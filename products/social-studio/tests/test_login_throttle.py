from datetime import timedelta
from concurrent.futures import ThreadPoolExecutor

from app import throttle
from app.db import LoginThrottle, Session
from conftest import PASSWORD, register

OWNER = 'owner@example.com'


def login(client, email, password):
    return client.post('/api/auth/login', json={'email': email, 'password': password})


def test_account_is_locked_after_five_wrong_passwords(client):
    register(client, OWNER)
    for _ in range(throttle.MAX_FAILURES_PER_ACCOUNT):
        assert login(client, OWNER, 'wrong-password-123').status_code == 401

    locked = login(client, OWNER, PASSWORD)
    assert locked.status_code == 429
    assert int(locked.headers['Retry-After']) > 0
    assert 'Too many sign-in attempts' in locked.json()['detail']


def test_correct_password_clears_the_account_count(client):
    register(client, OWNER)
    for _ in range(throttle.MAX_FAILURES_PER_ACCOUNT - 1):
        assert login(client, OWNER, 'wrong-password-123').status_code == 401
    assert login(client, OWNER, PASSWORD).status_code == 200

    # The count starts again from zero after a successful sign-in.
    for _ in range(throttle.MAX_FAILURES_PER_ACCOUNT - 1):
        assert login(client, OWNER, 'wrong-password-123').status_code == 401
    assert login(client, OWNER, PASSWORD).status_code == 200


def test_lock_lifts_after_the_window(client, monkeypatch):
    register(client, OWNER)
    for _ in range(throttle.MAX_FAILURES_PER_ACCOUNT):
        login(client, OWNER, 'wrong-password-123')
    assert login(client, OWNER, PASSWORD).status_code == 429

    later = throttle.now() + throttle.WINDOW + timedelta(minutes=1)
    monkeypatch.setattr(throttle, 'now', lambda: later)
    assert login(client, OWNER, PASSWORD).status_code == 200


def test_unknown_email_is_throttled_too(client):
    # Throttling unknown addresses means a locked-out response can't reveal whether an account exists.
    for _ in range(throttle.MAX_FAILURES_PER_ACCOUNT):
        assert login(client, 'nobody@example.com', 'wrong-password-123').status_code == 401
    assert login(client, 'nobody@example.com', 'wrong-password-123').status_code == 429


def test_one_address_is_limited_across_many_accounts(client):
    # The test client is one address. Thirty failures across different emails use up its limit.
    for i in range(throttle.MAX_FAILURES_PER_IP):
        assert login(client, f'person{i}@example.com', 'wrong-password-123').status_code == 401
    assert login(client, 'someone-else@example.com', 'wrong-password-123').status_code == 429


def test_failure_increment_does_not_overwrite_a_previously_loaded_count():
    key = throttle.account_key(OWNER)
    with Session() as first, Session() as second:
        throttle.record_failure(first, [key])
        cached = first.get(LoginThrottle, key)
        assert cached.failures == 1
        throttle.record_failure(second, [key])
        throttle.record_failure(first, [key])
        assert first.get(LoginThrottle, key).failures == 3


def test_parallel_first_failures_are_all_counted():
    keys = [throttle.account_key(OWNER), throttle.ip_key('192.0.2.1')]

    def fail(_):
        with Session() as db:
            throttle.record_failure(db, keys)

    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(fail, range(24)))
    with Session() as db:
        for key in keys:
            assert db.get(LoginThrottle, key).failures == 24


def test_expired_counter_restarts_at_one(monkeypatch):
    key = throttle.account_key(OWNER)
    with Session() as db:
        throttle.record_failure(db, [key])
        throttle.record_failure(db, [key])
        later = throttle.now() + throttle.WINDOW
        monkeypatch.setattr(throttle, 'now', lambda: later)
        throttle.record_failure(db, [key])
        row = db.get(LoginThrottle, key)
        assert row.failures == 1
        assert row.window_start == later
