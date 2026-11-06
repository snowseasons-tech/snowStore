import os
from datetime import datetime, timezone
from uuid import uuid4
from sqlalchemy import create_engine, text, String, DateTime, ForeignKey, Text, Boolean, Integer, UniqueConstraint, TypeDecorator
from sqlalchemy.dialects import mysql
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker

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
class Client(Base):
    __tablename__='clients'
    id: Mapped[str]=mapped_column(String(36),primary_key=True,default=uid)
    name: Mapped[str]=mapped_column(String(200))
    service_area: Mapped[str]=mapped_column(String(300),default='')
    website: Mapped[str]=mapped_column(String(500),default='')
    tone: Mapped[str]=mapped_column(String(200),default='Professional and friendly')
    timezone: Mapped[str]=mapped_column(String(70),default='America/Denver')
class Membership(Base):
    __tablename__='memberships'
    __table_args__=(UniqueConstraint('user_id','client_id'),)
    id: Mapped[str]=mapped_column(String(36),primary_key=True,default=uid)
    user_id: Mapped[str]=mapped_column(ForeignKey('users.id',ondelete='CASCADE'),index=True)
    client_id: Mapped[str]=mapped_column(ForeignKey('clients.id',ondelete='CASCADE'),index=True)
    role: Mapped[str]=mapped_column(String(20),default='editor')
class Connection(Base):
    __tablename__='connections'
    __table_args__=(UniqueConstraint('client_id','platform','external_id'),)
    id: Mapped[str]=mapped_column(String(36),primary_key=True,default=uid)
    client_id: Mapped[str]=mapped_column(ForeignKey('clients.id',ondelete='CASCADE'),index=True)
    platform: Mapped[str]=mapped_column(String(30))
    external_id: Mapped[str]=mapped_column(String(250))
    display_name: Mapped[str]=mapped_column(String(200))
    parent_id: Mapped[str]=mapped_column(String(250),default='')
    token_enc: Mapped[str]=mapped_column(Text)
    refresh_enc: Mapped[str]=mapped_column(Text,default="")
    expires_at: Mapped[datetime | None]=mapped_column(UTCDateTime(),nullable=True)
class Post(Base):
    __tablename__='posts'
    id: Mapped[str]=mapped_column(String(36),primary_key=True,default=uid)
    client_id: Mapped[str]=mapped_column(ForeignKey('clients.id',ondelete='CASCADE'),index=True)
    author_id: Mapped[str]=mapped_column(ForeignKey('users.id'))
    platform: Mapped[str]=mapped_column(String(30))
    title: Mapped[str]=mapped_column(String(250))
    content: Mapped[str]=mapped_column(Text)
    media_url: Mapped[str]=mapped_column(String(2000),default='')
    status: Mapped[str]=mapped_column(String(30),default='draft',index=True)
    scheduled_at: Mapped[datetime | None]=mapped_column(UTCDateTime(),nullable=True,index=True)
    connection_id: Mapped[str | None]=mapped_column(ForeignKey('connections.id',ondelete='SET NULL'),nullable=True)
    external_post_id: Mapped[str]=mapped_column(String(500),default='')
    last_error: Mapped[str]=mapped_column(Text,default='')
    created_at: Mapped[datetime]=mapped_column(UTCDateTime(),default=now)
    updated_at: Mapped[datetime]=mapped_column(UTCDateTime(),default=now,onupdate=now)
class OAuthState(Base):
    __tablename__='oauth_states'
    state: Mapped[str]=mapped_column(String(200),primary_key=True)
    client_id: Mapped[str]=mapped_column(ForeignKey('clients.id',ondelete='CASCADE'))
    user_id: Mapped[str]=mapped_column(ForeignKey('users.id',ondelete='CASCADE'))
    provider: Mapped[str]=mapped_column(String(30))
    expires_at: Mapped[datetime]=mapped_column(UTCDateTime())

class Invite(Base):
    # Lets an owner add a teammate who has no account yet while public registration is closed.
    # Only a SHA-256 of the one-time code is stored.
    __tablename__='invites'
    __table_args__=(UniqueConstraint('client_id','email'),)
    id: Mapped[str]=mapped_column(String(36),primary_key=True,default=uid)
    client_id: Mapped[str]=mapped_column(ForeignKey('clients.id',ondelete='CASCADE'),index=True)
    email: Mapped[str]=mapped_column(String(320),index=True)
    role: Mapped[str]=mapped_column(String(20),default='editor')
    code_hash: Mapped[str]=mapped_column(String(64),unique=True)
    created_by: Mapped[str]=mapped_column(ForeignKey('users.id',ondelete='CASCADE'))
    expires_at: Mapped[datetime]=mapped_column(UTCDateTime())

class PasswordReset(Base):
    # One-time password reset code sent by email. Only a SHA-256 of the code is stored.
    __tablename__='password_resets'
    id: Mapped[str]=mapped_column(String(36),primary_key=True,default=uid)
    user_id: Mapped[str]=mapped_column(ForeignKey('users.id',ondelete='CASCADE'),index=True)
    code_hash: Mapped[str]=mapped_column(String(64),unique=True)
    expires_at: Mapped[datetime]=mapped_column(UTCDateTime())
    created_at: Mapped[datetime]=mapped_column(UTCDateTime(),default=now)
class SessionCutoff(Base):
    # Each password change bumps generation; logins carrying an older generation are rejected,
    # so a password change signs out old sessions. Kept in its own table so upgrading needs no
    # change to the users table.
    __tablename__='session_cutoffs'
    user_id: Mapped[str]=mapped_column(ForeignKey('users.id',ondelete='CASCADE'),primary_key=True)
    generation: Mapped[int]=mapped_column(Integer,default=0)
class LoginThrottle(Base):
    # Failed sign-in counts per key ("acct:<hash of email>" or "ip:<address>"). Stored in the
    # database so every worker sees the same counts; a new table, so upgrading needs no migration.
    __tablename__='login_throttle'
    key: Mapped[str]=mapped_column(String(100),primary_key=True)
    failures: Mapped[int]=mapped_column(Integer,default=0)
    window_start: Mapped[datetime]=mapped_column(UTCDateTime())

# MVP bootstrapping. Switch to Alembic migrations before operating a production deployment.
def init_db():
    # The web app and the worker both start here. On a fresh MySQL database their CREATE TABLEs
    # collide (error 1684), so take a named lock while creating tables.
    with engine.connect() as conn:
        mysql_db=conn.dialect.name=='mysql'
        if mysql_db and conn.scalar(text("SELECT GET_LOCK('social_studio_init_db',60)"))!=1:
            raise RuntimeError('Timed out waiting for another process to create the database tables')
        try:
            Base.metadata.create_all(conn)
            conn.commit()
        finally:
            if mysql_db: conn.execute(text("SELECT RELEASE_LOCK('social_studio_init_db')"))
