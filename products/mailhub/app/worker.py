import logging,os,time
from datetime import timedelta
from sqlalchemy import func,select,update
from .db import Session,Campaign,CampaignLink,Recipient,Suppression,now,init_db
from .render import build
from .resend import ResendError,send
from . import sending
logging.basicConfig(level=logging.INFO)
logger=logging.getLogger(__name__)

BATCH=50
MAX_ATTEMPTS=5
RETRY_WINDOW=timedelta(hours=23)
# Past these rates a campaign pauses itself, so one bad list can't cost the customer their sending account.
GUARD_MINIMUM=100
GUARD_BOUNCE=0.05
GUARD_COMPLAINT=0.003

def recover_stuck(db):
    # A recipient left in 'sending' means a worker stopped mid-send. The idempotency key makes a retry
    # safe for Resend's 24 hours; after that it may have gone out, so mark it failed instead of risking a duplicate.
    cutoff=now()-sending.STUCK_AFTER
    for r in db.scalars(select(Recipient).where(Recipient.status=='sending',Recipient.claimed_at<=cutoff).with_for_update(skip_locked=True)).all():
        if r.claimed_at>now()-RETRY_WINDOW: r.status='pending'
        else: r.status='failed';r.error='Sending was interrupted and it is too late to retry safely.'
    db.commit()

def check_guard(db,c):
    if c.guard_off: return
    sent=db.scalar(select(func.count()).select_from(Recipient).where(Recipient.campaign_id==c.id,Recipient.status=='sent')) or 0
    if sent<GUARD_MINIMUM: return
    bounced=db.scalar(select(func.count()).select_from(Recipient).where(Recipient.campaign_id==c.id,Recipient.bounced_at.is_not(None))) or 0
    complained=db.scalar(select(func.count()).select_from(Recipient).where(Recipient.campaign_id==c.id,Recipient.complained_at.is_not(None))) or 0
    if bounced/sent>GUARD_BOUNCE or complained/sent>GUARD_COMPLAINT:
        sending.pause(c,sending.GUARD_PREFIX+f' {bounced} bounces and {complained} complaints from {sent} emails. Clean this list before resuming.')

def claim(db):
    """Take the next batch of one campaign. Returns (campaign id, recipient ids)."""
    c=db.scalar(select(Campaign).where(Campaign.status.in_(('queued','sending')),(Campaign.send_at.is_(None))|(Campaign.send_at<=now())).order_by(Campaign.queued_at).with_for_update(skip_locked=True).limit(1))
    if not c: return None,[]
    c.status='sending'
    check_guard(db,c)
    problems=sending.not_ready(sending.settings(db))
    if problems: sending.pause(c,'; '.join(problems))
    if c.status!='sending': db.commit();return None,[]
    left=sending.remaining(db)
    pending=select(Recipient).where(Recipient.campaign_id==c.id,Recipient.status=='pending').limit(BATCH if left is None else min(BATCH,left)).with_for_update(skip_locked=True)
    rows=db.scalars(pending).all()
    if not rows:
        waiting=db.scalar(select(func.count()).select_from(Recipient).where(Recipient.campaign_id==c.id,Recipient.status.in_(('pending','sending'))))
        if not waiting: c.status='sent';c.finished_at=now()
        elif left==0: sending.pause(c,'This month\'s send limit is used up. Resume when it resets or after upgrading your plan.')
        db.commit();return None,[]
    suppressed=set(db.scalars(select(Suppression.email).where(Suppression.email.in_([r.email for r in rows]))).all())
    ids=[]
    for r in rows:
        if r.email in suppressed: r.status='skipped'
        else: r.status='sending';r.claimed_at=now();ids.append(r.id)
    sending.count_sends(db,len(ids))
    db.commit()
    return c.id,ids

def release(db,ids,status='pending'):
    # Hand back claimed recipients that were never attempted, along with their sends.
    if not ids: return
    db.execute(update(Recipient).where(Recipient.id.in_(ids),Recipient.status=='sending').values(status=status))
    sending.count_sends(db,-len(ids))

def deliver(db,c,row,links,r):
    """Send one email. Returns False when the rest of the batch should wait."""
    r.attempts+=1
    try:
        r.provider_id=send(sending.resend_key(row),build(c,row,r,os.environ['PUBLIC_URL'],links),r.id)
        r.status='sent';r.sent_at=now();r.error=''
        return True
    except ResendError as e:
        r.error=str(e)[:1000]
        sending.count_sends(db,-1)
        if e.bad_key:
            r.status='pending';sending.pause(c,str(e));return False
        if e.retryable and r.attempts<MAX_ATTEMPTS:
            r.status='pending';return False
        r.status='failed'
        logger.error('Failed recipient %s: %s',r.id,e)
        return not e.retryable

def run_once():
    """Send one batch. Returns how many emails were attempted."""
    with Session() as db: recover_stuck(db)
    with Session() as db: campaign_id,ids=claim(db)
    attempted=0
    for n,rid in enumerate(ids):
        with Session() as db:
            c=db.get(Campaign,campaign_id)
            if c.status!='sending':
                release(db,ids[n:],'canceled' if c.status=='canceled' else 'pending');db.commit();break
            row=sending.settings(db)
            links={l.url:l.id for l in db.scalars(select(CampaignLink).where(CampaignLink.campaign_id==c.id)).all()}
            r=db.get(Recipient,rid)
            if db.get(Suppression,r.email):
                # Unsubscribed or bounced after this batch was claimed. Its send was counted when claimed, so give it back.
                r.status='skipped';sending.count_sends(db,-1);db.commit();continue
            carry_on=deliver(db,c,row,links,r)
            attempted+=1
            if not carry_on: release(db,ids[n+1:])
            db.commit()
        if not carry_on:
            time.sleep(10);break
        time.sleep(1/sending.rate())
    return attempted

def main():
    init_db();sending.monthly_limit();sending.rate()
    while True:
        try: busy=run_once()
        except Exception: logger.exception('Worker cycle failed');busy=0
        if not busy: time.sleep(5)
if __name__=='__main__': main()
