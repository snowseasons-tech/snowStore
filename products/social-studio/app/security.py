import os
from datetime import timedelta
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from cryptography.fernet import Fernet
import jwt
from pwdlib import PasswordHash
from sqlalchemy.orm import Session as DBSession
from sqlalchemy import select
from .db import Session, User, Membership, SessionCutoff, now

hasher=PasswordHash.recommended()
bearer=HTTPBearer(auto_error=False)
SECRET=os.environ['SECRET_KEY']
crypto=Fernet(os.environ['FERNET_KEY'].encode())
def encrypt(v): return crypto.encrypt(v.encode()).decode()
def decrypt(v): return crypto.decrypt(v.encode()).decode()
def session_generation(db,user_id):
    cutoff=db.get(SessionCutoff,user_id)
    return cutoff.generation if cutoff else 0
def issue(user_id,generation=0): return jwt.encode({'sub': user_id,'gen':generation,'iat':now(),'exp':now()+timedelta(hours=12)}, SECRET, algorithm='HS256')
def db_session():
    with Session() as db: yield db
def current_user(credentials:HTTPAuthorizationCredentials|None=Depends(bearer),db:DBSession=Depends(db_session)):
    if not credentials: raise HTTPException(401,'Login required')
    try:
        payload=jwt.decode(credentials.credentials,SECRET,algorithms=['HS256'])
        user_id=payload['sub']
    except (jwt.InvalidTokenError,KeyError): raise HTTPException(401,'Invalid or expired login')
    user=db.get(User,user_id)
    if not user: raise HTTPException(401,'Account not found')
    if payload.get('gen',0)<session_generation(db,user_id): raise HTTPException(401,'Your password was changed. Sign in again.')
    return user
def require_member(db,user_id,client_id,roles=None):
    m=db.scalar(select(Membership).where(Membership.client_id==client_id,Membership.user_id==user_id))
    if not m: raise HTTPException(404,'Client not found')
    if roles and m.role not in roles: raise HTTPException(403,'Insufficient permissions')
    return m
