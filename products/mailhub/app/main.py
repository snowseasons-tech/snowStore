import base64,csv,hashlib,hmac,html,io,json,logging,os,re,secrets,time
from collections import defaultdict
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from email_validator import EmailNotValidError,validate_email
from fastapi import BackgroundTasks,Depends,FastAPI,File,Form,HTTPException,Query,Request,Response,UploadFile
from fastapi.responses import FileResponse,HTMLResponse,JSONResponse,RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel,EmailStr,Field
from sqlalchemy import delete,func,select,update
from sqlalchemy.orm import Session as DBSession
from .db import init_db,Campaign,CampaignLink,Contact,ContactList,ContactTag,ListMember,Recipient,Segment,Suppression,User,now
from .security import current_user,db_session,encrypt,hasher,issue,session_generation
from .render import build,links_in
from .resend import ResendError,create_domain,get_domain,send,verify_domain
from . import mail,passwords,sending
logger=logging.getLogger(__name__)

APP_NAME=os.getenv('APP_NAME','').strip() or 'MailHub'
MAX_IMPORT_BYTES=20*1024*1024
LOGIN_TRIES=10
LOGIN_WINDOW=900
failed_logins=defaultdict(list)
PIXEL=base64.b64decode('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7')
@asynccontextmanager
async def lifespan(_app):
    sending.monthly_limit();sending.rate();init_db();yield
app=FastAPI(title=APP_NAME,version='0.1.0',lifespan=lifespan)
@app.middleware('http')
async def suspended(request,call_next):
    # A stopped subscription keeps unsubscribe links and bounce handling alive, and nothing else.
    path=request.url.path
    if os.getenv('SUSPENDED')=='1' and path.startswith('/api/') and path!='/api/webhooks/resend':
        return JSONResponse({'detail':'This subscription has ended. Renew it to get back in.'},403)
    return await call_next(request)
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
class NameIn(BaseModel):
    name:str=Field(min_length=1,max_length=200)
class ContactIn(BaseModel):
    email:EmailStr
    first_name:str=Field(default='',max_length=200)
    last_name:str=Field(default='',max_length=200)
    tags:list[str]=Field(default_factory=list)
    list_id:str|None=None
class TagsIn(BaseModel):
    tags:list[str]
class SegmentIn(BaseModel):
    name:str=Field(min_length=1,max_length=200)
    tags:list[str]=Field(min_length=1)
    match:str='any'
class CampaignIn(BaseModel):
    name:str=Field(min_length=1,max_length=200)
    subject:str=Field(min_length=1,max_length=250)
    body_html:str=Field(min_length=1,max_length=1000000)
    list_id:str|None=None
    segment_id:str|None=None
class SendIn(BaseModel):
    send_at:datetime|None=None
class TestIn(BaseModel):
    email:EmailStr
class SettingsIn(BaseModel):
    from_name:str=Field(default='',max_length=200)
    from_email:EmailStr|None=None
    reply_to:EmailStr|None=None
    postal_address:str=Field(default='',max_length=500)
    resend_api_key:str|None=Field(default=None,max_length=200)
    webhook_secret:str|None=Field(default=None,max_length=200)
class DomainIn(BaseModel):
    domain:str=Field(min_length=3,max_length=253,pattern=r'^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$')
class SuppressIn(BaseModel):
    email:EmailStr

def clean_tags(tags):
    return sorted({t.strip().lower()[:60] for t in tags if t.strip()})
def registration_open(db):
    return os.getenv('ALLOW_REGISTRATION','0')=='1' or db.scalar(select(User.id).limit(1)) is None
def set_tags(db,contact_id,tags):
    have=set(db.scalars(select(ContactTag.tag).where(ContactTag.contact_id==contact_id)).all())
    for tag in set(tags)-have: db.add(ContactTag(contact_id=contact_id,tag=tag))
def join_list(db,list_id,contact_id):
    if not db.get(ListMember,(list_id,contact_id)): db.add(ListMember(list_id=list_id,contact_id=contact_id))
def need(db,model,key,label):
    obj=db.get(model,key)
    if not obj: raise HTTPException(404,f'{label} not found')
    return obj
def contact_view(db,c):
    return {'id':c.id,'email':c.email,'first_name':c.first_name,'last_name':c.last_name,'tags':list(db.scalars(select(ContactTag.tag).where(ContactTag.contact_id==c.id)).all()),'suppressed':db.get(Suppression,c.email) is not None,'consent_source':c.consent_source}
def campaign_view(c):
    return {'id':c.id,'name':c.name,'subject':c.subject,'body_html':c.body_html,'list_id':c.list_id,'segment_id':c.segment_id,'status':c.status,'last_error':c.last_error,'created_at':c.created_at,'queued_at':c.queued_at,'send_at':c.send_at,'finished_at':c.finished_at}
def settings_view(s):
    return {'from_name':s.from_name,'from_email':s.from_email,'reply_to':s.reply_to,'postal_address':s.postal_address,'has_resend_key':bool(sending.resend_key(s)),'key_from_server':bool(os.getenv('RESEND_API_KEY')),'has_webhook_secret':bool(sending.webhook_secret(s)),'domain':s.domain,'domain_status':s.domain_status,'domain_records':json.loads(s.domain_records),'webhook_last_at':s.webhook_last_at,'webhook_url':os.environ['PUBLIC_URL'].rstrip('/')+'/api/webhooks/resend','not_ready':sending.not_ready(s)}
def validate_target(db,data):
    if not data.list_id and not data.segment_id: raise HTTPException(422,'Choose a list or a segment')
    if data.list_id: need(db,ContactList,data.list_id,'List')
    if data.segment_id: need(db,Segment,data.segment_id,'Segment')
def editable(db,campaign_id):
    c=need(db,Campaign,campaign_id,'Campaign')
    if c.status!='draft': raise HTTPException(409,'Only drafts can be changed')
    return c
def provider_error(e):
    logger.warning('Resend call failed: %s',e)
    return HTTPException(502,str(e))

# --- Sign-in ------------------------------------------------------------------------------

@app.get('/api/config')
def config(db:DBSession=Depends(db_session)):
    return {'name':APP_NAME,'registration_open':registration_open(db),'password_reset_email':mail.enabled()}
@app.post('/api/auth/register')
def register(data:RegisterIn,db:DBSession=Depends(db_session)):
    email=str(data.email).lower()
    setup=os.getenv('SETUP_CODE','')
    if setup and db.scalar(select(User.id).limit(1)) is None:
        # A hosted server is handed over by emailing this code, so the first visitor can't claim it.
        if not secrets.compare_digest((data.invite_code or '').encode(),setup.encode()): raise HTTPException(403,'Use the setup link from your welcome email')
    elif not registration_open(db): raise HTTPException(403,'Registration is closed.')
    if db.scalar(select(User).where(User.email==email)): raise HTTPException(409,'Email already registered')
    u=User(email=email,password_hash=hasher.hash(data.password));db.add(u);db.commit()
    return {'token':issue(u.id)}
@app.post('/api/auth/login')
def login(data:Credentials,db:DBSession=Depends(db_session)):
    email=str(data.email).lower()
    recent=failed_logins[email]=[t for t in failed_logins[email] if t>time.time()-LOGIN_WINDOW]
    if len(recent)>=LOGIN_TRIES: raise HTTPException(429,'Too many tries. Wait 15 minutes or reset your password.')
    u=db.scalar(select(User).where(User.email==email))
    if not u or not hasher.verify(data.password,u.password_hash):
        recent.append(time.time());raise HTTPException(401,'Invalid credentials')
    failed_logins.pop(email,None)
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
    try: mail.send(email,f'Reset your {APP_NAME} password',body)
    except Exception: logger.exception('Could not send the password reset email to %s',email)
@app.post('/api/auth/reset')
def reset_password(data:ResetIn,db:DBSession=Depends(db_session)):
    u=passwords.user_for_code(db,data.code)
    if not u: raise HTTPException(400,'This reset link is invalid or has expired. Ask for a new one.')
    return {'token':issue(u.id,passwords.set_password(db,u,data.password))}
@app.get('/api/me')
def me(user:User=Depends(current_user)): return {'id':user.id,'email':user.email}
@app.get('/api/plan')
def plan(user:User=Depends(current_user),db:DBSession=Depends(db_session)):
    return {'limit':sending.monthly_limit() or None,'used':sending.used_this_month(db)}

# --- Settings and sending domain ----------------------------------------------------------

@app.get('/api/settings')
def get_settings(user:User=Depends(current_user),db:DBSession=Depends(db_session)):
    s=sending.settings(db);db.commit();return settings_view(s)
@app.put('/api/settings')
def put_settings(data:SettingsIn,user:User=Depends(current_user),db:DBSession=Depends(db_session)):
    s=sending.settings(db)
    s.from_name=data.from_name.strip();s.postal_address=data.postal_address.strip()
    s.from_email=str(data.from_email or '').lower();s.reply_to=str(data.reply_to or '').lower()
    if data.resend_api_key: s.resend_key_enc=encrypt(data.resend_api_key.strip())
    if data.webhook_secret: s.webhook_secret_enc=encrypt(data.webhook_secret.strip())
    db.commit();return settings_view(s)
def apply_domain(s,found):
    s.domain_id=found['id'];s.domain=found['name'].lower();s.domain_status=found.get('status','')
    if found.get('records'): s.domain_records=json.dumps(found['records'])
@app.post('/api/domain')
def add_domain(data:DomainIn,user:User=Depends(current_user),db:DBSession=Depends(db_session)):
    s=sending.settings(db);key=sending.resend_key(s)
    if not key: raise HTTPException(409,'Add your Resend API key first')
    try: apply_domain(s,create_domain(key,data.domain.lower()))
    except ResendError as e: raise provider_error(e)
    db.commit();return settings_view(s)
@app.post('/api/domain/check')
def check_domain(user:User=Depends(current_user),db:DBSession=Depends(db_session)):
    s=sending.settings(db)
    if not s.domain_id: raise HTTPException(409,'Add a domain first')
    key=sending.resend_key(s)
    try:
        verify_domain(key,s.domain_id);apply_domain(s,get_domain(key,s.domain_id))
    except ResendError as e: raise provider_error(e)
    db.commit();return settings_view(s)

# --- Lists, contacts, segments, suppression -------------------------------------------------

@app.get('/api/lists')
def lists(user:User=Depends(current_user),db:DBSession=Depends(db_session)):
    counts=dict(db.execute(select(ListMember.list_id,func.count()).group_by(ListMember.list_id)).all())
    return [{'id':l.id,'name':l.name,'contacts':counts.get(l.id,0)} for l in db.scalars(select(ContactList).order_by(ContactList.name)).all()]
@app.post('/api/lists')
def create_list(data:NameIn,user:User=Depends(current_user),db:DBSession=Depends(db_session)):
    if db.scalar(select(ContactList).where(ContactList.name==data.name)): raise HTTPException(409,'A list with this name already exists')
    l=ContactList(name=data.name);db.add(l);db.commit();return {'id':l.id,'name':l.name,'contacts':0}
@app.delete('/api/lists/{list_id}')
def delete_list(list_id:str,user:User=Depends(current_user),db:DBSession=Depends(db_session)):
    db.delete(need(db,ContactList,list_id,'List'));db.commit();return {'ok':True}
@app.post('/api/lists/{list_id}/import')
async def import_csv(list_id:str,file:UploadFile=File(),consent:bool=Form(False),user:User=Depends(current_user),db:DBSession=Depends(db_session)):
    need(db,ContactList,list_id,'List')
    if not consent: raise HTTPException(422,'Confirm these people agreed to get email from you')
    raw=await file.read(MAX_IMPORT_BYTES+1)
    if len(raw)>MAX_IMPORT_BYTES: raise HTTPException(413,'That file is over 20 MB')
    try: text=raw.decode('utf-8-sig')
    except UnicodeDecodeError: text=raw.decode('latin-1')
    reader=csv.DictReader(io.StringIO(text))
    columns={(f or '').strip().lower().replace(' ','_'):f for f in reader.fieldnames or []}
    if 'email' not in columns: raise HTTPException(422,'The file needs an "email" column')
    rows={};invalid=0
    for row in reader:
        cell=lambda name:(row.get(columns.get(name)) or '').strip() if name in columns else ''
        try: email=validate_email(cell('email'),check_deliverability=False).normalized.lower()
        except EmailNotValidError: invalid+=1;continue
        rows[email]={'first_name':cell('first_name')[:200],'last_name':cell('last_name')[:200],'tags':clean_tags(re.split('[;,|]',cell('tags')))}
    emails=list(rows);existing={};blocked=set()
    for i in range(0,len(emails),500):
        chunk=emails[i:i+500]
        existing.update({c.email:c for c in db.scalars(select(Contact).where(Contact.email.in_(chunk))).all()})
        blocked.update(db.scalars(select(Suppression.email).where(Suppression.email.in_(chunk))).all())
    added=updated=0;source=f'CSV {file.filename or ""}, confirmed by {user.email} on {now():%Y-%m-%d}'[:300]
    for email,info in rows.items():
        c=existing.get(email)
        if c:
            updated+=1
            c.first_name=info['first_name'] or c.first_name;c.last_name=info['last_name'] or c.last_name
        else:
            added+=1
            c=Contact(email=email,first_name=info['first_name'],last_name=info['last_name'],consent_source=source);db.add(c);db.flush()
        set_tags(db,c.id,info['tags']);join_list(db,list_id,c.id)
    db.commit()
    return {'added':added,'updated':updated,'invalid':invalid,'suppressed':len(blocked)}
@app.get('/api/contacts')
def contacts(list_id:str|None=None,q:str='',offset:int=Query(0,ge=0),user:User=Depends(current_user),db:DBSession=Depends(db_session)):
    where=[]
    if list_id: where.append(Contact.id.in_(select(ListMember.contact_id).where(ListMember.list_id==list_id)))
    if q: where.append(Contact.email.contains(q.strip().lower(),autoescape=True))
    rows=db.scalars(select(Contact).where(*where).order_by(Contact.email).offset(offset).limit(100)).all()
    return {'total':db.scalar(select(func.count()).select_from(Contact).where(*where)),'contacts':[contact_view(db,c) for c in rows]}
@app.post('/api/contacts')
def add_contact(data:ContactIn,user:User=Depends(current_user),db:DBSession=Depends(db_session)):
    email=str(data.email).lower()
    if data.list_id: need(db,ContactList,data.list_id,'List')
    if db.scalar(select(Contact).where(Contact.email==email)): raise HTTPException(409,'This contact already exists')
    c=Contact(email=email,first_name=data.first_name,last_name=data.last_name,consent_source=f'Added by {user.email} on {now():%Y-%m-%d}'[:300]);db.add(c);db.flush()
    set_tags(db,c.id,clean_tags(data.tags))
    if data.list_id: join_list(db,data.list_id,c.id)
    db.commit();return contact_view(db,c)
@app.put('/api/contacts/{contact_id}/tags')
def put_tags(contact_id:str,data:TagsIn,user:User=Depends(current_user),db:DBSession=Depends(db_session)):
    c=need(db,Contact,contact_id,'Contact')
    db.execute(delete(ContactTag).where(ContactTag.contact_id==c.id));set_tags(db,c.id,clean_tags(data.tags))
    db.commit();return contact_view(db,c)
@app.delete('/api/contacts/{contact_id}')
def delete_contact(contact_id:str,user:User=Depends(current_user),db:DBSession=Depends(db_session)):
    # Any suppression stays, so a deleted address that opted out can't be re-added and emailed.
    db.delete(need(db,Contact,contact_id,'Contact'));db.commit();return {'ok':True}
@app.get('/api/tags')
def tags(user:User=Depends(current_user),db:DBSession=Depends(db_session)):
    return [{'tag':t,'contacts':n} for t,n in db.execute(select(ContactTag.tag,func.count()).group_by(ContactTag.tag).order_by(ContactTag.tag)).all()]
def segment_view(s): return {'id':s.id,'name':s.name,'tags':json.loads(s.tags),'match':s.match}
@app.get('/api/segments')
def segments(user:User=Depends(current_user),db:DBSession=Depends(db_session)):
    return [segment_view(s) for s in db.scalars(select(Segment).order_by(Segment.name)).all()]
@app.post('/api/segments')
def create_segment(data:SegmentIn,user:User=Depends(current_user),db:DBSession=Depends(db_session)):
    picked=clean_tags(data.tags)
    if data.match not in ('any','all') or not picked: raise HTTPException(422,'Pick at least one tag and match any or all')
    if db.scalar(select(Segment).where(Segment.name==data.name)): raise HTTPException(409,'A segment with this name already exists')
    s=Segment(name=data.name,tags=json.dumps(picked),match=data.match);db.add(s);db.commit();return segment_view(s)
@app.delete('/api/segments/{segment_id}')
def delete_segment(segment_id:str,user:User=Depends(current_user),db:DBSession=Depends(db_session)):
    db.delete(need(db,Segment,segment_id,'Segment'));db.commit();return {'ok':True}
@app.get('/api/suppressions')
def suppressions(user:User=Depends(current_user),db:DBSession=Depends(db_session)):
    return [{'email':s.email,'reason':s.reason,'created_at':s.created_at} for s in db.scalars(select(Suppression).order_by(Suppression.created_at.desc()).limit(500)).all()]
@app.post('/api/suppressions')
def add_suppression(data:SuppressIn,user:User=Depends(current_user),db:DBSession=Depends(db_session)):
    sending.suppress(db,str(data.email),'manual');db.commit();return {'ok':True}

# --- Campaigns ------------------------------------------------------------------------------

@app.get('/api/campaigns')
def campaigns(user:User=Depends(current_user),db:DBSession=Depends(db_session)):
    return [campaign_view(c) for c in db.scalars(select(Campaign).order_by(Campaign.created_at.desc()).limit(200)).all()]
@app.post('/api/campaigns')
def create_campaign(data:CampaignIn,user:User=Depends(current_user),db:DBSession=Depends(db_session)):
    validate_target(db,data)
    c=Campaign(**data.model_dump());db.add(c);db.commit();return campaign_view(c)
@app.put('/api/campaigns/{campaign_id}')
def edit_campaign(campaign_id:str,data:CampaignIn,user:User=Depends(current_user),db:DBSession=Depends(db_session)):
    c=editable(db,campaign_id);validate_target(db,data)
    for k,v in data.model_dump().items(): setattr(c,k,v)
    db.commit();return campaign_view(c)
@app.delete('/api/campaigns/{campaign_id}')
def delete_campaign(campaign_id:str,user:User=Depends(current_user),db:DBSession=Depends(db_session)):
    db.delete(editable(db,campaign_id));db.commit();return {'ok':True}
@app.get('/api/campaigns/{campaign_id}/audience')
def campaign_audience(campaign_id:str,user:User=Depends(current_user),db:DBSession=Depends(db_session)):
    return {'recipients':len(sending.audience(db,need(db,Campaign,campaign_id,'Campaign')))}
@app.post('/api/campaigns/{campaign_id}/test')
def test_send(campaign_id:str,data:TestIn,user:User=Depends(current_user),db:DBSession=Depends(db_session)):
    c=need(db,Campaign,campaign_id,'Campaign');s=sending.settings(db)
    if problems:=sending.not_ready(s): raise HTTPException(409,'; '.join(problems))
    if sending.remaining(db)==0: raise HTTPException(409,'This month\'s send limit is used up')
    sample=Recipient(email=str(data.email).lower(),first_name='Test',last_name='Person',token='test')
    try: send(sending.resend_key(s),build(c,s,sample,os.environ['PUBLIC_URL'],test=True))
    except ResendError as e: raise provider_error(e)
    sending.count_sends(db,1);db.commit();return {'ok':True}
@app.post('/api/campaigns/{campaign_id}/send')
def send_campaign(campaign_id:str,data:SendIn|None=None,user:User=Depends(current_user),db:DBSession=Depends(db_session)):
    c=editable(db,campaign_id);s=sending.settings(db)
    if problems:=sending.not_ready(s): raise HTTPException(409,'; '.join(problems))
    people=sending.audience(db,c)
    if not people: raise HTTPException(409,'This campaign has no one to send to')
    send_at=data.send_at if data else None
    if send_at and send_at.tzinfo is None: raise HTTPException(422,'Datetime must include timezone')
    if send_at and send_at<=now(): raise HTTPException(422,'Schedule in the future')
    left=sending.remaining(db)
    if left is not None: left=max(left-sending.committed(db),0)
    if left is not None and len(people)>left: raise HTTPException(409,f'This campaign reaches {len(people)} people but only {left} sends are left this month')
    for url in links_in(c.body_html): db.add(CampaignLink(campaign_id=c.id,url=url))
    db.add_all(Recipient(campaign_id=c.id,email=p.email,first_name=p.first_name,last_name=p.last_name) for p in people)
    c.status='queued';c.queued_at=now();c.send_at=send_at;c.last_error='';db.commit()
    return {**campaign_view(c),'recipients':len(people)}
@app.post('/api/campaigns/{campaign_id}/resume')
def resume_campaign(campaign_id:str,user:User=Depends(current_user),db:DBSession=Depends(db_session)):
    c=need(db,Campaign,campaign_id,'Campaign')
    if c.status!='paused': raise HTTPException(409,'Only paused campaigns can resume')
    if sending.remaining(db)==0: raise HTTPException(409,'This month\'s send limit is used up')
    if c.last_error.startswith(sending.GUARD_PREFIX): c.guard_off=1
    c.status='queued';c.last_error='';db.commit();return campaign_view(c)
@app.post('/api/campaigns/{campaign_id}/cancel')
def cancel_campaign(campaign_id:str,user:User=Depends(current_user),db:DBSession=Depends(db_session)):
    c=need(db,Campaign,campaign_id,'Campaign')
    if c.status not in ('queued','sending','paused'): raise HTTPException(409,'This campaign is not sending')
    c.status='canceled';c.finished_at=now()
    db.execute(update(Recipient).where(Recipient.campaign_id==c.id,Recipient.status=='pending').values(status='canceled'))
    db.commit();return campaign_view(c)
@app.get('/api/campaigns/{campaign_id}/stats')
def stats(campaign_id:str,user:User=Depends(current_user),db:DBSession=Depends(db_session)):
    c=need(db,Campaign,campaign_id,'Campaign')
    def count(*where): return db.scalar(select(func.count()).select_from(Recipient).where(Recipient.campaign_id==c.id,*where)) or 0
    def total(col): return db.scalar(select(func.coalesce(func.sum(col),0)).where(Recipient.campaign_id==c.id)) or 0
    statuses=dict(db.execute(select(Recipient.status,func.count()).where(Recipient.campaign_id==c.id).group_by(Recipient.status)).all())
    sent=statuses.get('sent',0)
    opened=count(Recipient.opened_at.is_not(None));clicked=count(Recipient.clicked_at.is_not(None))
    rate=lambda n:round(n/sent*100,1) if sent else 0
    links=db.scalars(select(CampaignLink).where(CampaignLink.campaign_id==c.id).order_by(CampaignLink.clicks.desc())).all()
    return {'status':c.status,'recipients':sum(statuses.values()),'sent':sent,'pending':statuses.get('pending',0)+statuses.get('sending',0),'failed':statuses.get('failed',0),'skipped':statuses.get('skipped',0),'canceled':statuses.get('canceled',0),
            'opened':opened,'opens_total':total(Recipient.open_count),'open_rate':rate(opened),'clicked':clicked,'clicks_total':total(Recipient.click_count),'click_rate':rate(clicked),
            'delivered':count(Recipient.delivered_at.is_not(None)),'unsubscribed':count(Recipient.unsubscribed_at.is_not(None)),'bounced':count(Recipient.bounced_at.is_not(None)),'complained':count(Recipient.complained_at.is_not(None)),
            'links':[{'url':l.url,'clicks':l.clicks} for l in links]}

# --- Public links in emails -----------------------------------------------------------------

def page(title,text,form=''):
    return HTMLResponse(f'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{html.escape(title)}</title><body style="font-family:Arial,sans-serif;max-width:480px;margin:15vh auto;padding:0 16px"><h1 style="font-size:22px">{html.escape(title)}</h1><p>{html.escape(text)}</p>{form}</body></html>')
def seen(db,r,count_col,first_col):
    db.execute(update(Recipient).where(Recipient.id==r.id).values({count_col:getattr(Recipient,count_col)+1}))
    db.execute(update(Recipient).where(Recipient.id==r.id,getattr(Recipient,first_col).is_(None)).values({first_col:now()}))
@app.get('/t/o/{token}.gif',include_in_schema=False)
def track_open(token:str,db:DBSession=Depends(db_session)):
    r=db.scalar(select(Recipient).where(Recipient.token==token))
    if r: seen(db,r,'open_count','opened_at');db.commit()
    return Response(PIXEL,media_type='image/gif',headers={'Cache-Control':'no-store'})
@app.get('/t/c/{token}/{link_id}',include_in_schema=False)
def track_click(token:str,link_id:str,db:DBSession=Depends(db_session)):
    r=db.scalar(select(Recipient).where(Recipient.token==token));link=db.get(CampaignLink,link_id)
    if not r or not link or link.campaign_id!=r.campaign_id: raise HTTPException(404,'Link not found')
    seen(db,r,'click_count','clicked_at')
    # A click proves the email was opened, even when images were blocked.
    db.execute(update(Recipient).where(Recipient.id==r.id,Recipient.opened_at.is_(None)).values(opened_at=now()))
    db.execute(update(CampaignLink).where(CampaignLink.id==link.id).values(clicks=CampaignLink.clicks+1))
    db.commit();return RedirectResponse(link.url,302)
@app.get('/u/{token}',include_in_schema=False)
def unsubscribe_page(token:str,db:DBSession=Depends(db_session)):
    # GET only asks, because mail scanners open links and must not unsubscribe anyone.
    if token=='test': return page('This was a test','Test emails have no real unsubscribe. Nothing was changed.')
    r=db.scalar(select(Recipient).where(Recipient.token==token))
    if not r: return page('Link not found','This unsubscribe link is not valid.')
    if db.get(Suppression,r.email): return page('You are unsubscribed',f'{r.email} will not get more email from this sender.')
    return page('Unsubscribe?',f'Stop email to {r.email}?',f'<form method="post"><button style="padding:10px 18px;font-size:15px">Unsubscribe</button></form>')
@app.post('/u/{token}',include_in_schema=False)
def unsubscribe(token:str,db:DBSession=Depends(db_session)):
    # Also the target of mail apps' one-click List-Unsubscribe-Post, so it needs no confirmation or sign-in.
    if token=='test': return page('This was a test','Test emails have no real unsubscribe. Nothing was changed.')
    r=db.scalar(select(Recipient).where(Recipient.token==token))
    if not r: raise HTTPException(404,'Link not found')
    sending.suppress(db,r.email,'unsubscribed',r.campaign_id)
    if not r.unsubscribed_at: r.unsubscribed_at=now()
    db.commit();return page('You are unsubscribed',f'{r.email} will not get more email from this sender.')

# --- Resend webhook: bounces and complaints ---------------------------------------------------

def signature_ok(secret,headers,body):
    msg_id,stamp,given=headers.get('svix-id'),headers.get('svix-timestamp'),headers.get('svix-signature')
    if not (msg_id and stamp and given): return False
    try:
        if abs(time.time()-int(stamp))>300: return False
        key=base64.b64decode(secret.removeprefix('whsec_'))
    except ValueError: return False
    want=base64.b64encode(hmac.new(key,f'{msg_id}.{stamp}.'.encode()+body,hashlib.sha256).digest()).decode()
    return any(hmac.compare_digest(part.partition(',')[2],want) for part in given.split())
@app.post('/api/webhooks/resend',include_in_schema=False)
async def resend_webhook(request:Request,db:DBSession=Depends(db_session)):
    s=sending.settings(db);secret=sending.webhook_secret(s)
    body=await request.body()
    if not secret: raise HTTPException(503,'Webhook secret is not set')
    if not signature_ok(secret,request.headers,body): raise HTTPException(401,'Bad signature')
    try: event=json.loads(body);kind=event.get('type');data=event.get('data') or {}
    except (ValueError,AttributeError): raise HTTPException(400,'Bad event')
    s.webhook_last_at=now();db.commit()
    r=db.scalar(select(Recipient).where(Recipient.provider_id==data.get('email_id'))) if data.get('email_id') else None
    if kind=='email.delivered' and r and not r.delivered_at: r.delivered_at=now()
    # Only a permanent bounce suppresses; a full mailbox or a slow server may work next time.
    hard=kind=='email.bounced' and str((data.get('bounce') or {}).get('type','')).lower()=='permanent'
    if hard or kind=='email.complained':
        reason='bounced' if hard else 'complained'
        to=data.get('to') or ([r.email] if r else [])
        for email in [to] if isinstance(to,str) else to: sending.suppress(db,email,reason,r.campaign_id if r else None)
        if r and not getattr(r,reason+'_at'): setattr(r,reason+'_at',now())
    db.commit();return {'ok':True}
