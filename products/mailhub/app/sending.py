"""Rules shared by the web app and the worker: who a campaign reaches, the monthly limit, and suppression."""
import json
import os
from datetime import timedelta

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError

from .db import Campaign, Contact, ContactTag, ListMember, Recipient, Segment, SendCounter, Settings, Suppression, now
from .security import decrypt


def monthly_limit():
    # Plan size: emails this server may send per calendar month. 0 means no limit.
    limit = int(os.getenv('MAX_MONTHLY_SENDS') or 0)
    if limit < 0:
        raise ValueError('MAX_MONTHLY_SENDS cannot be negative')
    return limit


def rate():
    value = float(os.getenv('SEND_RATE_PER_SECOND') or 2)
    if value <= 0:
        raise ValueError('SEND_RATE_PER_SECOND must be above 0')
    return value


def settings(db):
    row = db.get(Settings, 1)
    if not row:
        row = Settings(id=1)
        db.add(row)
        db.flush()
    return row


def resend_key(row):
    return os.getenv('RESEND_API_KEY') or (decrypt(row.resend_key_enc) if row.resend_key_enc else '')


def webhook_secret(row):
    return os.getenv('RESEND_WEBHOOK_SECRET') or (decrypt(row.webhook_secret_enc) if row.webhook_secret_enc else '')


def not_ready(row):
    """What stops this server from sending. Empty means it can send."""
    problems = []
    if not resend_key(row):
        problems.append('Add your Resend API key')
    if row.domain_status != 'verified':
        problems.append('Verify your sending domain')
    if not row.from_email or row.from_email.rpartition('@')[2] != row.domain:
        problems.append('Use a From address on your verified domain')
    if not webhook_secret(row):
        problems.append('Add your Resend webhook secret, or bounces and complaints will not be suppressed')
    if not row.postal_address.strip():
        problems.append('Add your postal address; anti-spam law requires it in every email')
    return problems


def month_key():
    return now().strftime('%Y-%m')


def used_this_month(db):
    row = db.get(SendCounter, month_key())
    return row.used if row else 0


def remaining(db):
    """Sends left this month, or None when there is no limit."""
    limit = monthly_limit()
    return None if not limit else max(limit - used_this_month(db), 0)


def committed(db):
    """Emails already promised to campaigns that haven't finished."""
    active = select(Campaign.id).where(Campaign.status.in_(('queued', 'sending', 'paused')))
    return db.scalar(select(func.count()).select_from(Recipient).where(Recipient.campaign_id.in_(active), Recipient.status == 'pending')) or 0


def count_sends(db, n):
    """Add to this month's count under a row lock. Pass a negative number to give back a send that never went out."""
    key = month_key()
    if not db.get(SendCounter, key):
        try:
            with db.begin_nested():
                db.add(SendCounter(month=key, used=0))
        except IntegrityError:
            pass
    # A send handed back just after the month rolled over must not push the new month below zero.
    db.execute(update(SendCounter).where(SendCounter.month == key, SendCounter.used + n >= 0).values(used=SendCounter.used + n))


def audience(db, campaign):
    """Contacts a campaign reaches right now, leaving out suppressed addresses."""
    q = select(Contact).where(Contact.email.not_in(select(Suppression.email)))
    if campaign.list_id:
        q = q.where(Contact.id.in_(select(ListMember.contact_id).where(ListMember.list_id == campaign.list_id)))
    if campaign.segment_id:
        segment = db.get(Segment, campaign.segment_id)
        tags = json.loads(segment.tags) if segment else []
        if segment and segment.match == 'all':
            for tag in tags:
                q = q.where(Contact.id.in_(select(ContactTag.contact_id).where(ContactTag.tag == tag)))
        else:
            q = q.where(Contact.id.in_(select(ContactTag.contact_id).where(ContactTag.tag.in_(tags))))
    return db.scalars(q.order_by(Contact.email)).all()


def suppress(db, email, reason, campaign_id=None):
    email = email.strip().lower()
    if db.get(Suppression, email):
        return
    try:
        with db.begin_nested():
            db.add(Suppression(email=email, reason=reason, campaign_id=campaign_id))
    except IntegrityError:
        pass


def pause(campaign, reason):
    campaign.status = 'paused'
    campaign.last_error = reason


STUCK_AFTER = timedelta(minutes=10)
GUARD_PREFIX = 'Paused to protect your sending reputation:'
