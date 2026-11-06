from datetime import timedelta

from app import throttle
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
