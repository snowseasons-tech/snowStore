"""Password resets, shared by the web app and the reset_password command."""
import hashlib
import secrets
from datetime import timedelta

from sqlalchemy import delete, select

from .db import PasswordReset, SessionCutoff, User, now
from .security import hasher

RESET_MINUTES = 30
RESEND_AFTER = timedelta(minutes=2)
MIN_LENGTH = 12


def code_hash(code):
    return hashlib.sha256(code.strip().encode()).hexdigest()


def new_reset_code(db, user):
    """Replace any earlier code for this user and return a fresh one, or None if one was sent very recently."""
    last = db.scalar(select(PasswordReset).where(PasswordReset.user_id == user.id).order_by(PasswordReset.created_at.desc()))
    if last and last.created_at > now() - RESEND_AFTER:
        return None
    db.execute(delete(PasswordReset).where(PasswordReset.user_id == user.id))
    code = secrets.token_urlsafe(24)
    db.add(PasswordReset(user_id=user.id, code_hash=code_hash(code), expires_at=now() + timedelta(minutes=RESET_MINUTES)))
    db.commit()
    return code


def user_for_code(db, code):
    reset = db.scalar(select(PasswordReset).where(PasswordReset.code_hash == code_hash(code)))
    if not reset or reset.expires_at < now():
        return None
    return db.get(User, reset.user_id)


def set_password(db, user, password):
    """Set a new password, cancel outstanding reset codes and sign out existing sessions."""
    if len(password) < MIN_LENGTH:
        raise ValueError(f'Password must be at least {MIN_LENGTH} characters')
    user.password_hash = hasher.hash(password)
    db.execute(delete(PasswordReset).where(PasswordReset.user_id == user.id))
    cutoff = db.get(SessionCutoff, user.id) or SessionCutoff(user_id=user.id, generation=0)
    cutoff.generation += 1
    db.add(cutoff)
    db.commit()
    return cutoff.generation
