import os, asyncio
from urllib.parse import urlencode
import httpx
from fastapi import HTTPException
from .security import decrypt
GRAPH=f"https://graph.facebook.com/{os.getenv('META_GRAPH_VERSION','v23.0')}"
GOOGLE='https://mybusiness.googleapis.com/v4'
TIMEOUT=25

async def response_json(resp):
    try: data=resp.json()
    except ValueError: raise RuntimeError(f'Provider returned HTTP {resp.status_code} without JSON')
    if resp.is_error: raise RuntimeError(f'Provider HTTP {resp.status_code}: {str(data)[:600]}')
    return data

async def publish(post,conn):
    token=decrypt(conn.token_enc)
    if conn.platform=='google' and conn.expires_at and conn.expires_at.timestamp()<__import__('time').time()+120:
        if not conn.refresh_enc: raise RuntimeError('Google OAuth token expired; reconnect this account')
        async with httpx.AsyncClient(timeout=TIMEOUT) as refresh_http:
            refresh_response=await refresh_http.post('https://oauth2.googleapis.com/token',data={'client_id':os.environ['GOOGLE_CLIENT_ID'],'client_secret':os.environ['GOOGLE_CLIENT_SECRET'],'refresh_token':decrypt(conn.refresh_enc),'grant_type':'refresh_token'})
            refreshed=await response_json(refresh_response)
            from .security import encrypt
            from .db import now
            from datetime import timedelta
            token=refreshed['access_token']
            conn.token_enc=encrypt(token)
            conn.expires_at=now()+timedelta(seconds=refreshed.get('expires_in',3600))
    async with httpx.AsyncClient(timeout=TIMEOUT) as http:
        if conn.platform=='facebook':
            payload={'message':post.content,'access_token':token}
            if post.media_url:
                # Post a link, not an uploaded image; publish photos through a future media pipeline.
                payload['link']=post.media_url
            r=await http.post(f'{GRAPH}/{conn.external_id}/feed',data=payload)
            data=await response_json(r)
            return data['id']
        if conn.platform=='instagram':
            if not post.media_url or not post.media_url.startswith('https://'):
                raise RuntimeError('Instagram requires a publicly accessible HTTPS image URL')
            r=await http.post(f'{GRAPH}/{conn.external_id}/media',data={'image_url':post.media_url,'caption':post.content,'access_token':token})
            data=await response_json(r)
            creation_id=data['id']
            # Processing isn't instantaneous. Check the container before publishing.
            for attempt in range(12):
                await asyncio.sleep(5)
                r=await http.get(f'{GRAPH}/{creation_id}',params={'fields':'status_code','access_token':token})
                info=await response_json(r)
                if info.get('status_code')=='FINISHED': break
                if info.get('status_code') in ('ERROR','EXPIRED'): raise RuntimeError(f'Instagram media processing: {info}')
            else: raise RuntimeError('Instagram media processing timed out; inspect the container before retrying')
            r=await http.post(f'{GRAPH}/{conn.external_id}/media_publish',data={'creation_id':creation_id,'access_token':token})
            data=await response_json(r)
            return data['id']
        if conn.platform=='google':
            # external_id is the canonical accounts/{id}/locations/{id} name.
            data={'languageCode':'en-US','summary':post.content,'topicType':'STANDARD'}
            if post.media_url: data['media']=[{'mediaFormat':'PHOTO','sourceUrl':post.media_url}]
            r=await http.post(f'{GOOGLE}/{conn.external_id}/localPosts',json=data,headers={'Authorization':f'Bearer {token}'})
            result=await response_json(r)
            return result['name']
    raise RuntimeError('Unknown platform')

def redirect_origin():
    # Hosted servers share one OAuth address, because Meta and Google need every redirect address listed in advance.
    return (os.getenv('OAUTH_REDIRECT_URL') or os.environ['PUBLIC_URL']).rstrip('/')
def auth_url(provider,state):
    origin=redirect_origin()
    redirect=f'{origin}/api/oauth/{provider}/callback'
    if provider=='google':
        if not os.getenv('GOOGLE_CLIENT_ID'): raise HTTPException(503,'Google OAuth not configured')
        return 'https://accounts.google.com/o/oauth2/v2/auth?'+urlencode({'client_id':os.environ['GOOGLE_CLIENT_ID'],'redirect_uri':redirect,'response_type':'code','scope':'https://www.googleapis.com/auth/business.manage','access_type':'offline','prompt':'consent','state':state})
    if provider=='meta':
        if not os.getenv('META_APP_ID'): raise HTTPException(503,'Meta OAuth not configured')
        return 'https://www.facebook.com/'+os.getenv('META_GRAPH_VERSION','v23.0')+'/dialog/oauth?'+urlencode({'client_id':os.environ['META_APP_ID'],'redirect_uri':redirect,'response_type':'code','scope':'pages_show_list,pages_manage_posts,pages_read_engagement,instagram_basic,instagram_content_publish','state':state})
    raise HTTPException(400,'Unknown provider')

async def exchange(provider,code):
    origin=redirect_origin()
    async with httpx.AsyncClient(timeout=TIMEOUT) as http:
        if provider=='google':
            r=await http.post('https://oauth2.googleapis.com/token',data={'code':code,'client_id':os.environ['GOOGLE_CLIENT_ID'],'client_secret':os.environ['GOOGLE_CLIENT_SECRET'],'redirect_uri':f'{origin}/api/oauth/google/callback','grant_type':'authorization_code'})
            d=await response_json(r)
            return d['access_token'],d.get('refresh_token',''),d.get('expires_in',3600)
        r=await http.get(f'{GRAPH}/oauth/access_token',params={'client_id':os.environ['META_APP_ID'],'client_secret':os.environ['META_APP_SECRET'],'redirect_uri':f'{origin}/api/oauth/meta/callback','code':code})
        d=await response_json(r)
        # Exchange for a long-lived user token when supported.
        r=await http.get(f'{GRAPH}/oauth/access_token',params={'grant_type':'fb_exchange_token','client_id':os.environ['META_APP_ID'],'client_secret':os.environ['META_APP_SECRET'],'fb_exchange_token':d['access_token']})
        if r.is_success: d=await response_json(r)
        return d['access_token'],'',d.get('expires_in',3600)

async def discover_accounts(provider,access_token):
    async with httpx.AsyncClient(timeout=TIMEOUT) as http:
        if provider=='google':
            # Account Management and Business Information APIs are separate from the v4 posts API.
            r=await http.get('https://mybusinessaccountmanagement.googleapis.com/v1/accounts',headers={'Authorization':f'Bearer {access_token}'})
            accounts=(await response_json(r)).get('accounts',[])
            results=[]
            for a in accounts:
                aid=a['name'].split('/')[-1]
                r=await http.get('https://mybusinessbusinessinformation.googleapis.com/v1/accounts/'+aid+'/locations',headers={'Authorization':f'Bearer {access_token}'},params={'readMask':'name,title'})
                for loc in (await response_json(r)).get('locations',[]):
                    location_id=loc['name'].split('/')[-1]
                    results.append({'platform':'google','id':f'accounts/{aid}/locations/{location_id}','name':loc.get('title',location_id),'token':access_token})
            return results
        results=[]
        url=f'{GRAPH}/me/accounts'
        params={'fields':'id,name,access_token,instagram_business_account{id,username}','limit':100,'access_token':access_token}
        while url:
            r=await http.get(url,params=params)
            data=await response_json(r)
            for page in data.get('data',[]):
                if not page.get('access_token'): continue
                results.append({'platform':'facebook','id':page['id'],'name':page['name'],'token':page['access_token']})
                ig=page.get('instagram_business_account')
                if ig: results.append({'platform':'instagram','id':ig['id'],'name':ig.get('username',ig['id']),'token':page['access_token'],'parent_id':page['id']})
            url=data.get('paging',{}).get('next')
            params=None
        return results
