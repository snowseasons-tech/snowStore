import hashlib,logging,os,secrets
from contextlib import asynccontextmanager
from datetime import datetime,timedelta,timezone
from pathlib import Path
from urllib.parse import quote
from zoneinfo import ZoneInfo,ZoneInfoNotFoundError
import httpx
from fastapi import BackgroundTasks,FastAPI,Depends,HTTPException,Response
from fastapi.responses import FileResponse,RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel,EmailStr,Field,HttpUrl
from sqlalchemy import select
from sqlalchemy.orm import Session as DBSession
from .db import init_db,Session,User,Client,Membership,Connection,Post,OAuthState,Invite,now
from .security import db_session,current_user,hasher,issue,encrypt,require_member,session_generation
from .integrations import auth_url,exchange,discover_accounts
from . import mail,passwords
logger=logging.getLogger(__name__)

APP_NAME=os.getenv('APP_NAME','').strip() or 'Social Studio'
INVITE_DAYS=7
@asynccontextmanager
async def lifespan(_app):
    init_db();yield
app=FastAPI(title=APP_NAME,version='0.3.0',lifespan=lifespan)
BASE=Path(__file__).resolve().parent.parent
app.mount('/static',StaticFiles(directory=BASE/'static'),name='static')
@app.get('/',include_in_schema=False)
def index(): return FileResponse(BASE/'static/index.html')

class Credentials(BaseModel):
    email:EmailStr
    password:str=Field(min_length=12,max_length=256)
class RegisterIn(Credentials):
    invite_code:str|None=Field(default=None,max_length=100)
class ForgotIn(BaseModel):
    email:EmailStr
class ResetIn(BaseModel):
    code:str=Field(min_length=10,max_length=200)
    password:str=Field(min_length=12,max_length=256)
class OAuthStartIn(BaseModel):
    client_id:str
class ClientIn(BaseModel):
    name:str=Field(min_length=2,max_length=200)
    service_area:str=Field(default='',max_length=300)
    website:str=Field(default='',max_length=500)
    tone:str=Field(default='Professional and friendly',max_length=200)
    timezone:str='America/Denver'
class MemberIn(BaseModel):
    email:EmailStr
    role:str='editor'
class GenerateIn(BaseModel):
    topic:str=Field(min_length=5,max_length=1200)
    platforms:list[str]=Field(default_factory=lambda:['google','facebook','instagram'])
class PostIn(BaseModel):
    title:str=Field(min_length=1,max_length=250)
    platform:str
    content:str=Field(min_length=1,max_length=10000)
    media_url:str=Field(default='',max_length=2000)
    connection_id:str|None=None
class ScheduleIn(BaseModel):
    scheduled_at:datetime
    connection_id:str

def ensure_platform(p):
    if p not in ('google','facebook','instagram'): raise HTTPException(422,'Invalid platform')
def client_access(db,client_id,user,roles=None):
    require_member(db,user.id,client_id,roles)
    obj=db.get(Client,client_id)
    if not obj: raise HTTPException(404,'Client not found')
    return obj
def post_view(p):
    return {'id':p.id,'client_id':p.client_id,'title':p.title,'platform':p.platform,'content':p.content,'media_url':p.media_url,'status':p.status,'connection_id':p.connection_id,'scheduled_at':p.scheduled_at,'external_post_id':p.external_post_id,'last_error':p.last_error,'created_at':p.created_at}
def code_hash(code): return hashlib.sha256(code.strip().encode()).hexdigest()
def registration_open(db):
    # The first account can always register; after that only invited users, unless ALLOW_REGISTRATION=1.
    return os.getenv('ALLOW_REGISTRATION','0')=='1' or db.scalar(select(User.id).limit(1)) is None
def client_view(c): return {'id':c.id,'name':c.name,'service_area':c.service_area,'website':c.website,'tone':c.tone,'timezone':c.timezone}

@app.get('/api/config')
def config(db:DBSession=Depends(db_session)):
    return {'name':APP_NAME,'registration_open':registration_open(db),'password_reset_email':mail.enabled(),'providers':{'google':bool(os.getenv('GOOGLE_CLIENT_ID')),'meta':bool(os.getenv('META_APP_ID'))}}
@app.post('/api/auth/register')
def register(data:RegisterIn,db:DBSession=Depends(db_session)):
    email=str(data.email).lower()
    invite=None
    if data.invite_code:
        invite=db.scalar(select(Invite).where(Invite.code_hash==code_hash(data.invite_code)))
        if not invite or invite.expires_at<now() or invite.email!=email: raise HTTPException(403,'Invalid or expired invite code for this email')
    elif not registration_open(db): raise HTTPException(403,'Registration is closed. Ask a workspace owner for an invite code.')
    if db.scalar(select(User).where(User.email==email)): raise HTTPException(409,'Email already registered')
    u=User(email=email,password_hash=hasher.hash(data.password));db.add(u);db.flush()
    if invite:
        # Every pending invite for this email turns into a membership, not just the one whose code was used.
        for inv in db.scalars(select(Invite).where(Invite.email==email)).all():
            if inv.expires_at>=now(): db.add(Membership(client_id=inv.client_id,user_id=u.id,role=inv.role))
            db.delete(inv)
    db.commit();return {'token':issue(u.id)}
@app.post('/api/auth/login')
def login(data:Credentials,db:DBSession=Depends(db_session)):
    u=db.scalar(select(User).where(User.email==str(data.email).lower()))
    if not u or not hasher.verify(data.password,u.password_hash): raise HTTPException(401,'Invalid credentials')
    return {'token':issue(u.id,session_generation(db,u.id))}
@app.post('/api/auth/forgot')
def forgot(data:ForgotIn,background:BackgroundTasks,db:DBSession=Depends(db_session)):
    # Same answer whether or not the account exists, so this can't be used to find registered emails.
    email=str(data.email).lower()
    u=db.scalar(select(User).where(User.email==email))
    if u and not mail.enabled():
        logger.warning('Password reset requested for %s, but SMTP is not configured. Run: python -m app.reset_password %s',email,email)
    elif u and (code:=passwords.new_reset_code(db,u)):
        link=os.environ['PUBLIC_URL'].rstrip('/')+'/?reset='+code
        body=(f'Someone asked to reset the password for your {APP_NAME} account ({email}).\n\n'
              f'To choose a new password, open this link within {passwords.RESET_MINUTES} minutes:\n{link}\n\n'
              'If you did not ask for this, ignore this email; your password will not change.')
        background.add_task(send_reset_email,email,body)
    return {'ok':True,'email_enabled':mail.enabled()}
def send_reset_email(email,body):
    # Sent after the response, so a real account doesn't answer slower than an unknown email.
    try: mail.send(email,f'Reset your {APP_NAME} password',body)
    except Exception: logger.exception('Could not send the password reset email to %s',email)
@app.post('/api/auth/reset')
def reset_password(data:ResetIn,db:DBSession=Depends(db_session)):
    u=passwords.user_for_code(db,data.code)
    if not u: raise HTTPException(400,'This reset link is invalid or has expired. Ask for a new one.')
    generation=passwords.set_password(db,u,data.password)
    return {'token':issue(u.id,generation)}
@app.get('/api/me')
def me(user:User=Depends(current_user)):return {'id':user.id,'email':user.email}
@app.post('/api/clients')
def create_client(data:ClientIn,user:User=Depends(current_user),db:DBSession=Depends(db_session)):
    try: ZoneInfo(data.timezone)
    except ZoneInfoNotFoundError: raise HTTPException(422,'Invalid timezone')
    c=Client(**data.model_dump());db.add(c);db.flush()
    db.add(Membership(user_id=user.id,client_id=c.id,role='owner'));db.commit()
    return client_view(c)
@app.get('/api/clients')
def clients(user:User=Depends(current_user),db:DBSession=Depends(db_session)):
    rows=db.scalars(select(Client).join(Membership,Membership.client_id==Client.id).where(Membership.user_id==user.id).order_by(Client.name)).all()
    return [client_view(c) for c in rows]
@app.post('/api/clients/{client_id}/members')
def add_member(client_id:str,data:MemberIn,user:User=Depends(current_user),db:DBSession=Depends(db_session)):
    client_access(db,client_id,user,['owner'])
    if data.role not in ('editor','approver','viewer'): raise HTTPException(422,'Invalid role')
    email=str(data.email).lower()
    u=db.scalar(select(User).where(User.email==email))
    if not u:
        # No account yet: issue a one-time invite code for the owner to send them.
        code=secrets.token_urlsafe(12)
        old=db.scalar(select(Invite).where(Invite.client_id==client_id,Invite.email==email))
        if old: db.delete(old);db.flush()
        expires=now()+timedelta(days=INVITE_DAYS)
        db.add(Invite(client_id=client_id,email=email,role=data.role,code_hash=code_hash(code),created_by=user.id,expires_at=expires));db.commit()
        return {'ok':True,'invited':True,'invite_code':code,'expires_at':expires}
    if db.scalar(select(Membership).where(Membership.user_id==u.id,Membership.client_id==client_id)): raise HTTPException(409,'Already a member')
    db.add(Membership(client_id=client_id,user_id=u.id,role=data.role));db.commit();return {'ok':True,'invited':False}
@app.get('/api/clients/{client_id}/connections')
def connections(client_id:str,user:User=Depends(current_user),db:DBSession=Depends(db_session)):
    client_access(db,client_id,user)
    return [{'id':c.id,'platform':c.platform,'display_name':c.display_name,'external_id':c.external_id,'expires_at':c.expires_at} for c in db.scalars(select(Connection).where(Connection.client_id==client_id)).all()]
@app.delete('/api/clients/{client_id}/connections/{connection_id}')
def disconnect(client_id:str,connection_id:str,user:User=Depends(current_user),db:DBSession=Depends(db_session)):
    client_access(db,client_id,user,['owner'])
    c=db.get(Connection,connection_id)
    if not c or c.client_id!=client_id: raise HTTPException(404,'Connection not found')
    db.delete(c);db.commit();return {'ok':True}
@app.post('/api/clients/{client_id}/generate')
async def generate(client_id:str,data:GenerateIn,user:User=Depends(current_user),db:DBSession=Depends(db_session)):
    c=client_access(db,client_id,user,['owner','editor','approver'])
    for p in data.platforms: ensure_platform(p)
    if not data.platforms: raise HTTPException(422,'Select a platform')
    instructions=f'You are a social media marketing writer for {c.name} in {c.service_area}. Tone: {c.tone}. Website: {c.website}. Write distinct, truthful posts on the topic: {data.topic}. Do not invent offers, customer testimonials, credentials or contact details. Return only valid JSON object with keys google, facebook, instagram. Google: concise local relevance and CTA. Facebook: conversational and useful. Instagram: engaging caption and relevant hashtags. No markdown.'
    generated={}
    if os.getenv('LLM_MODEL'):
        try:
            async with httpx.AsyncClient(timeout=85) as http:
                r=await http.post(os.getenv('LLM_BASE_URL','http://host.docker.internal:8080/v1').rstrip('/')+'/chat/completions',headers={'Authorization':f"Bearer {os.getenv('LLM_API_KEY','unused')}"},json={'model':os.environ['LLM_MODEL'],'messages':[{'role':'system','content':'Return valid JSON, never invent facts.'},{'role':'user','content':instructions}],'temperature':0.65})
                r.raise_for_status();s=r.json()['choices'][0]['message']['content']
                import json
                s=s.strip().removeprefix('```json').removeprefix('```').removesuffix('```').strip()
                generated=json.loads(s)
        except (httpx.HTTPError,KeyError,ValueError,TypeError) as exc:
            generated={}
    fallback={'google':f'{c.name}: {data.topic}. Serving {c.service_area}. Contact us to learn more about our services. {c.website}'.strip(), 'facebook':f'🌿 {data.topic}\n\nQuestions about this topic? {c.name} serves {c.service_area}. Message us to learn more.', 'instagram':f'🌿 {data.topic}\n\nFrom {c.name}. Share your questions below!\n\n#LocalBusiness #Community'}
    return {'posts':{p:generated.get(p) if isinstance(generated.get(p),str) and generated[p].strip() else fallback[p] for p in data.platforms},'mode':'llm' if generated else 'template'}
@app.post('/api/clients/{client_id}/posts')
def create_post(client_id:str,data:PostIn,user:User=Depends(current_user),db:DBSession=Depends(db_session)):
    client_access(db,client_id,user,['owner','editor','approver']);ensure_platform(data.platform)
    if data.connection_id:
        conn=db.get(Connection,data.connection_id)
        if not conn or conn.client_id!=client_id or conn.platform!=data.platform: raise HTTPException(422,'Connection does not belong to this client/platform')
    p=Post(client_id=client_id,author_id=user.id,**data.model_dump());db.add(p);db.commit();return post_view(p)
@app.get('/api/clients/{client_id}/posts')
def list_posts(client_id:str,user:User=Depends(current_user),db:DBSession=Depends(db_session)):
    client_access(db,client_id,user)
    return [post_view(p) for p in db.scalars(select(Post).where(Post.client_id==client_id).order_by(Post.created_at.desc()).limit(500)).all()]
@app.put('/api/clients/{client_id}/posts/{post_id}')
def edit_post(client_id:str,post_id:str,data:PostIn,user:User=Depends(current_user),db:DBSession=Depends(db_session)):
    client_access(db,client_id,user,['owner','editor','approver']);ensure_platform(data.platform)
    p=db.get(Post,post_id)
    if not p or p.client_id!=client_id: raise HTTPException(404,'Post not found')
    if p.status not in ('draft','rejected','failed'): raise HTTPException(409,'Cannot edit a submitted or published post')
    if data.connection_id:
        conn=db.get(Connection,data.connection_id)
        if not conn or conn.client_id!=client_id or conn.platform!=data.platform: raise HTTPException(422,'Invalid connection')
    for k,v in data.model_dump().items(): setattr(p,k,v)
    # An edited rejected or failed post goes back to draft so it can be resubmitted.
    if p.status in ('rejected','failed'): p.status='draft';p.last_error=''
    db.commit();return post_view(p)
@app.post('/api/clients/{client_id}/posts/{post_id}/submit')
def submit(client_id:str,post_id:str,user:User=Depends(current_user),db:DBSession=Depends(db_session)):
    client_access(db,client_id,user,['owner','editor','approver'])
    p=db.get(Post,post_id)
    if not p or p.client_id!=client_id: raise HTTPException(404,'Post not found')
    if p.status not in ('draft','rejected'): raise HTTPException(409,'Only drafts can be submitted')
    p.status='pending_approval';db.commit();return post_view(p)
@app.post('/api/clients/{client_id}/posts/{post_id}/approve')
def approve(client_id:str,post_id:str,user:User=Depends(current_user),db:DBSession=Depends(db_session)):
    client_access(db,client_id,user,['owner','approver'])
    p=db.get(Post,post_id)
    if not p or p.client_id!=client_id: raise HTTPException(404,'Post not found')
    if p.status!='pending_approval': raise HTTPException(409,'Not awaiting approval')
    p.status='approved';db.commit();return post_view(p)
@app.post('/api/clients/{client_id}/posts/{post_id}/reject')
def reject(client_id:str,post_id:str,user:User=Depends(current_user),db:DBSession=Depends(db_session)):
    client_access(db,client_id,user,['owner','approver'])
    p=db.get(Post,post_id)
    if not p or p.client_id!=client_id: raise HTTPException(404,'Post not found')
    if p.status!='pending_approval': raise HTTPException(409,'Not awaiting approval')
    p.status='rejected';db.commit();return post_view(p)
@app.post('/api/clients/{client_id}/posts/{post_id}/schedule')
def schedule(client_id:str,post_id:str,data:ScheduleIn,user:User=Depends(current_user),db:DBSession=Depends(db_session)):
    client_access(db,client_id,user,['owner','approver'])
    p=db.get(Post,post_id);conn=db.get(Connection,data.connection_id)
    if not p or p.client_id!=client_id: raise HTTPException(404,'Post not found')
    if p.status!='approved': raise HTTPException(409,'Approve this post before scheduling')
    if not conn or conn.client_id!=client_id or conn.platform!=p.platform: raise HTTPException(422,'Select an authorized account for this platform')
    if data.scheduled_at.tzinfo is None: raise HTTPException(422,'Datetime must include timezone')
    if data.scheduled_at <= now(): raise HTTPException(422,'Schedule in the future')
    if p.platform=='instagram' and not p.media_url.startswith('https://'): raise HTTPException(422,'Instagram requires a publicly accessible HTTPS image URL')
    p.connection_id=conn.id;p.scheduled_at=data.scheduled_at;p.status='scheduled';db.commit();return post_view(p)
@app.post('/api/oauth/{provider}/start')
def oauth_start(provider:str,data:OAuthStartIn,user:User=Depends(current_user),db:DBSession=Depends(db_session)):
    # Returns the provider URL for the browser to open, so the login token never goes into a URL.
    require_member(db,user.id,data.client_id,['owner'])
    if provider not in ('meta','google'): raise HTTPException(404,'Provider not found')
    url=auth_url(provider,state:=secrets.token_urlsafe(32))
    db.add(OAuthState(state=state,client_id=data.client_id,user_id=user.id,provider=provider,expires_at=now()+timedelta(minutes=10)));db.commit()
    return {'url':url}
@app.get('/api/oauth/{provider}/callback')
async def oauth_callback(provider:str,state:str,code:str,db:DBSession=Depends(db_session)):
    record=db.get(OAuthState,state)
    if not record or record.provider!=provider or record.expires_at<now(): raise HTTPException(400,'Invalid or expired OAuth state')
    client_id=record.client_id
    db.delete(record);db.commit()
    try:
        access,refresh,expires=await exchange(provider,code)
        accounts=await discover_accounts(provider,access)
        for a in accounts:
            existing=db.scalar(select(Connection).where(Connection.client_id==client_id,Connection.platform==a['platform'],Connection.external_id==a['id']))
            if existing: conn=existing
            else: conn=Connection(client_id=client_id,platform=a['platform'],external_id=a['id'],display_name=a['name'],token_enc='');db.add(conn)
            conn.display_name=a['name'];conn.parent_id=a.get('parent_id','')
            # Google refresh requires implementation before token expiry; see README.
            conn.token_enc=encrypt(a['token'])
            if provider=='google' and refresh: conn.refresh_enc=encrypt(refresh)
            if provider=='google':conn.expires_at=now()+timedelta(seconds=expires)
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(502,'Provider authentication completed but account discovery failed; inspect server logs')
    return RedirectResponse('/?connected='+provider)
