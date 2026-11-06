import hashlib
from datetime import timedelta
from fastapi import HTTPException
from sqlalchemy import case
from sqlalchemy.dialects.mysql import insert as mysql_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session as DBSession
from .db import LoginThrottle, now

# Failed sign-ins allowed in one window, per email address and per client IP. A shared office
# IP gets the higher limit so one person's typos don't lock out everyone behind it.
WINDOW = timedelta(minutes=15)
MAX_FAILURES_PER_ACCOUNT = 5
MAX_FAILURES_PER_IP = 30


def account_key(email):
    # Hashed so the table never holds a plain email address.
    return 'acct:' + hashlib.sha256(email.lower().encode()).hexdigest()


def ip_key(address):
    return 'ip:' + (address or 'unknown')


def _live(db: DBSession, key):
    # The row for this key, or None when it is missing or its window has ended.
    row = db.get(LoginThrottle, key)
    if row is None or now() - row.window_start >= WINDOW:
        return None
    return row


def check_allowed(db: DBSession, keys_and_limits):
    # Raises 429 if any key has used up its failures in the current window.
    for key, limit in keys_and_limits:
        row = _live(db, key)
        if row and row.failures >= limit:
            retry_after = int((row.window_start + WINDOW - now()).total_seconds()) + 1
            minutes = max(1, -(-retry_after // 60))
            raise HTTPException(
                429,
                f'Too many sign-in attempts. Try again in about {minutes} minute{"s" if minutes != 1 else ""}.',
                headers={'Retry-After': str(retry_after)},
            )


def record_failure(db: DBSession, keys):
    # Increment in the database: loading a count into Python loses failures when
    # multiple web workers write at once. Upsert also handles simultaneous first attempts.
    timestamp = now()
    for key in keys:
        expired = LoginThrottle.window_start <= timestamp - WINDOW
        values = {
            'failures': case((expired, 1), else_=LoginThrottle.failures + 1),
            'window_start': case((expired, timestamp), else_=LoginThrottle.window_start),
        }
        if db.get_bind().dialect.name == 'mysql':
            statement = mysql_insert(LoginThrottle).values(
                key=key, failures=1, window_start=timestamp,
            ).on_duplicate_key_update(**values)
        else:
            statement = sqlite_insert(LoginThrottle).values(
                key=key, failures=1, window_start=timestamp,
            ).on_conflict_do_update(index_elements=['key'], set_=values)
        db.execute(statement)
    db.commit()
    # check_allowed may already have loaded these rows in this session.
    db.expire_all()


def clear_account(db: DBSession, email):
    # A correct password clears the account's own count; the IP count still applies.
    row = db.get(LoginThrottle, account_key(email))
    if row is not None:
        db.delete(row)
        db.commit()
