import os
import secrets
import time
from datetime import datetime, timezone
from uuid import uuid4
from sqlalchemy import create_engine, String, DateTime, ForeignKey, Text, Integer, UniqueConstraint, TypeDecorator
from sqlalchemy.dialects import mysql
from sqlalchemy.exc import OperationalError, ProgrammingError
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

engine = create_engine(os.environ['DATABASE_URL'], pool_pre_ping=True, pool_recycle=3600)
Session = sessionmaker(bind=engine, expire_on_commit=False)
def now(): return datetime.now(timezone.utc)
def uid(): return str(uuid4())
class Base(DeclarativeBase): pass
class UTCDateTime(TypeDecorator):
    # MySQL DATETIME has no timezone: store naive UTC with microseconds, hand back aware UTC.
    impl=DateTime
    cache_ok=True
    def load_dialect_impl(self,dialect):
        return dialect.type_descriptor(mysql.DATETIME(fsp=6)) if dialect.name=='mysql' else dialect.type_descriptor(DateTime())
    def process_bind_param(self,value,dialect):
        if value is None: return None
        if value.tzinfo is None: raise ValueError('Naive datetime not allowed')
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    def process_result_value(self,value,dialect):
        return None if value is None else value.replace(tzinfo=timezone.utc)
class User(Base):
    __tablename__='users'
    id: Mapped[str]=mapped_column(String(36),primary_key=True,default=uid)
    email: Mapped[str]=mapped_column(String(320),unique=True,index=True)
    password_hash: Mapped[str]=mapped_column(Text)
    created_at: Mapped[datetime]=mapped_column(UTCDateTime(),default=now)
class PasswordReset(Base):
    # One-time password reset code sent by email. Only a SHA-256 of the code is stored.
    __tablename__='password_resets'
    id: Mapped[str]=mapped_column(String(36),primary_key=True,default=uid)
    user_id: Mapped[str]=mapped_column(ForeignKey('users.id',ondelete='CASCADE'),index=True)
    code_hash: Mapped[str]=mapped_column(String(64),unique=True)
    expires_at: Mapped[datetime]=mapped_column(UTCDateTime())
    created_at: Mapped[datetime]=mapped_column(UTCDateTime(),default=now)
class SessionCutoff(Base):
    # Each password change bumps generation; logins carrying an older generation are rejected.
    __tablename__='session_cutoffs'
    user_id: Mapped[str]=mapped_column(ForeignKey('users.id',ondelete='CASCADE'),primary_key=True)
    generation: Mapped[int]=mapped_column(Integer,default=0)
class Settings(Base):
    # One row: each server belongs to one business.
    __tablename__='settings'
    id: Mapped[int]=mapped_column(Integer,primary_key=True,default=1)
    from_name: Mapped[str]=mapped_column(String(200),default='')
    from_email: Mapped[str]=mapped_column(String(320),default='')
    reply_to: Mapped[str]=mapped_column(String(320),default='')
    postal_address: Mapped[str]=mapped_column(String(500),default='')
    resend_key_enc: Mapped[str]=mapped_column(Text,default='')
    webhook_secret_enc: Mapped[str]=mapped_column(Text,default='')
    domain: Mapped[str]=mapped_column(String(253),default='')
    domain_id: Mapped[str]=mapped_column(String(100),default='')
    domain_status: Mapped[str]=mapped_column(String(40),default='')
    domain_records: Mapped[str]=mapped_column(Text,default='[]')
class Contact(Base):
    __tablename__='contacts'
    id: Mapped[str]=mapped_column(String(36),primary_key=True,default=uid)
    email: Mapped[str]=mapped_column(String(320),unique=True,index=True)
    first_name: Mapped[str]=mapped_column(String(200),default='')
    last_name: Mapped[str]=mapped_column(String(200),default='')
    created_at: Mapped[datetime]=mapped_column(UTCDateTime(),default=now)
class ContactTag(Base):
    __tablename__='contact_tags'
    contact_id: Mapped[str]=mapped_column(ForeignKey('contacts.id',ondelete='CASCADE'),primary_key=True)
    tag: Mapped[str]=mapped_column(String(60),primary_key=True,index=True)
class ContactList(Base):
    __tablename__='lists'
    id: Mapped[str]=mapped_column(String(36),primary_key=True,default=uid)
    name: Mapped[str]=mapped_column(String(200),unique=True)
    created_at: Mapped[datetime]=mapped_column(UTCDateTime(),default=now)
class ListMember(Base):
    __tablename__='list_members'
    list_id: Mapped[str]=mapped_column(ForeignKey('lists.id',ondelete='CASCADE'),primary_key=True)
    contact_id: Mapped[str]=mapped_column(ForeignKey('contacts.id',ondelete='CASCADE'),primary_key=True,index=True)
class Segment(Base):
    __tablename__='segments'
    id: Mapped[str]=mapped_column(String(36),primary_key=True,default=uid)
    name: Mapped[str]=mapped_column(String(200),unique=True)
    tags: Mapped[str]=mapped_column(Text)  # JSON list
    match: Mapped[str]=mapped_column(String(10),default='any')
class Suppression(Base):
    # Never email these addresses, even if they are imported again. Outlives the contact on purpose.
    __tablename__='suppressions'
    email: Mapped[str]=mapped_column(String(320),primary_key=True)
    reason: Mapped[str]=mapped_column(String(20))
    campaign_id: Mapped[str|None]=mapped_column(String(36),nullable=True)
    created_at: Mapped[datetime]=mapped_column(UTCDateTime(),default=now)
class Campaign(Base):
    __tablename__='campaigns'
    id: Mapped[str]=mapped_column(String(36),primary_key=True,default=uid)
    name: Mapped[str]=mapped_column(String(200))
    subject: Mapped[str]=mapped_column(String(250))
    body_html: Mapped[str]=mapped_column(Text(16777215).with_variant(mysql.MEDIUMTEXT(),'mysql'))
    list_id: Mapped[str|None]=mapped_column(ForeignKey('lists.id',ondelete='SET NULL'),nullable=True)
    segment_id: Mapped[str|None]=mapped_column(ForeignKey('segments.id',ondelete='SET NULL'),nullable=True)
    status: Mapped[str]=mapped_column(String(20),default='draft',index=True)
    last_error: Mapped[str]=mapped_column(Text,default='')
    guard_off: Mapped[int]=mapped_column(Integer,default=0)
    created_at: Mapped[datetime]=mapped_column(UTCDateTime(),default=now)
    queued_at: Mapped[datetime|None]=mapped_column(UTCDateTime(),nullable=True)
    finished_at: Mapped[datetime|None]=mapped_column(UTCDateTime(),nullable=True)
class CampaignLink(Base):
    # Clicks redirect only to URLs stored here, so the tracker can't be used as an open redirect.
    __tablename__='campaign_links'
    id: Mapped[str]=mapped_column(String(36),primary_key=True,default=uid)
    campaign_id: Mapped[str]=mapped_column(ForeignKey('campaigns.id',ondelete='CASCADE'),index=True)
    url: Mapped[str]=mapped_column(Text)
    clicks: Mapped[int]=mapped_column(Integer,default=0)
class Recipient(Base):
    __tablename__='recipients'
    __table_args__=(UniqueConstraint('campaign_id','email'),)
    id: Mapped[str]=mapped_column(String(36),primary_key=True,default=uid)
    token: Mapped[str]=mapped_column(String(44),unique=True,default=lambda:secrets.token_urlsafe(24))
    campaign_id: Mapped[str]=mapped_column(ForeignKey('campaigns.id',ondelete='CASCADE'),index=True)
    email: Mapped[str]=mapped_column(String(320))
    first_name: Mapped[str]=mapped_column(String(200),default='')
    last_name: Mapped[str]=mapped_column(String(200),default='')
    status: Mapped[str]=mapped_column(String(20),default='pending',index=True)
    attempts: Mapped[int]=mapped_column(Integer,default=0)
    error: Mapped[str]=mapped_column(Text,default='')
    provider_id: Mapped[str]=mapped_column(String(100),default='',index=True)
    claimed_at: Mapped[datetime|None]=mapped_column(UTCDateTime(),nullable=True)
    sent_at: Mapped[datetime|None]=mapped_column(UTCDateTime(),nullable=True)
    opened_at: Mapped[datetime|None]=mapped_column(UTCDateTime(),nullable=True)
    open_count: Mapped[int]=mapped_column(Integer,default=0)
    clicked_at: Mapped[datetime|None]=mapped_column(UTCDateTime(),nullable=True)
    click_count: Mapped[int]=mapped_column(Integer,default=0)
    unsubscribed_at: Mapped[datetime|None]=mapped_column(UTCDateTime(),nullable=True)
    bounced_at: Mapped[datetime|None]=mapped_column(UTCDateTime(),nullable=True)
    complained_at: Mapped[datetime|None]=mapped_column(UTCDateTime(),nullable=True)
class SendCounter(Base):
    # Emails used this calendar month (UTC), for MAX_MONTHLY_SENDS.
    __tablename__='send_counters'
    month: Mapped[str]=mapped_column(String(7),primary_key=True)
    used: Mapped[int]=mapped_column(Integer,default=0)

# MVP bootstrapping. Switch to Alembic migrations before operating a production deployment.
def init_db():
    # The web app and worker start together on a new database and can collide creating tables.
    for attempt in range(10):
        try: return Base.metadata.create_all(engine)
        except (OperationalError,ProgrammingError):
            if attempt==9: raise
            time.sleep(1)
