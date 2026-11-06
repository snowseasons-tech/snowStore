import hashlib
from datetime import timedelta
from fastapi import HTTPException
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
    for key in keys:
        row = _live(db, key)
        if row is None:
            row = db.get(LoginThrottle, key)
            if row is None:
                row = LoginThrottle(key=key)
                db.add(row)
            row.failures = 1
            row.window_start = now()
        else:
            row.failures += 1
    db.commit()


def clear_account(db: DBSession, email):
    # A correct password clears the account's own count; the IP count still applies.
    row = db.get(LoginThrottle, account_key(email))
    if row is not None:
        db.delete(row)
        db.commit()
