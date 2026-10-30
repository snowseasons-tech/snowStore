"""Test setup: a throwaway SQLite database, set before the app is imported. Nothing here reaches Resend.

Run from the project folder:  pip install -r requirements.lock -r requirements-dev.txt && python -m pytest
"""
import os
import secrets
import sys
import tempfile
from pathlib import Path

import pytest
from cryptography.fernet import Fernet

_fd, _db_path = tempfile.mkstemp(prefix='mailhub-test-', suffix='.db')
os.close(_fd)
os.environ.update(
    DATABASE_URL=f'sqlite:///{_db_path}',
    SECRET_KEY=secrets.token_hex(32),
    FERNET_KEY=Fernet.generate_key().decode(),
    PUBLIC_URL='https://mail.example.com',
    RESEND_BASE_URL='http://resend.invalid',
)
for name in ('ALLOW_REGISTRATION', 'APP_NAME', 'SMTP_HOST', 'SMTP_FROM', 'MAX_MONTHLY_SENDS', 'SETUP_CODE', 'RESEND_API_KEY', 'RESEND_WEBHOOK_SECRET', 'SEND_RATE_PER_SECOND'):
    os.environ.pop(name, None)
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402
from app.db import Base, Settings, Session, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.security import encrypt  # noqa: E402
import app.main as main  # noqa: E402
import app.worker as worker  # noqa: E402

PASSWORD = 'correct-horse-battery'


def pytest_sessionfinish(session, exitstatus):
    engine.dispose()
    Path(_db_path).unlink(missing_ok=True)


@pytest.fixture(autouse=True)
def fresh_db():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    main.failed_logins.clear()
    yield


@pytest.fixture
def client():
    with TestClient(app, follow_redirects=False) as c:
        yield c


@pytest.fixture
def owner(client):
    r = client.post('/api/auth/register', json={'email': 'owner@example.com', 'password': PASSWORD})
    assert r.status_code == 200, r.text
    return {'Authorization': f"Bearer {r.json()['token']}"}


@pytest.fixture
def ready():
    """A server with a verified domain, so campaigns can send."""
    with Session() as db:
        db.add(Settings(id=1, from_name='Acme', from_email='news@acme.test', postal_address='1 Main St, Denver CO',
                        resend_key_enc=encrypt('re_fake'), webhook_secret_enc=encrypt('whsec_' + 'c2VjcmV0'),
                        domain='acme.test', domain_id='d1', domain_status='verified'))
        db.commit()


@pytest.fixture
def outbox(monkeypatch):
    """Replaces Resend. Set outbox.fail to an exception to make the next sends raise it."""
    class Box(list):
        fail = None

    box = Box()

    def fake(key, payload, idempotency_key=None):
        if box.fail:
            raise box.fail
        box.append(payload | {'idempotency_key': idempotency_key})
        return f're_{len(box)}'
    monkeypatch.setattr(main, 'send', fake)
    monkeypatch.setattr(worker, 'send', fake)
    monkeypatch.setattr(worker.time, 'sleep', lambda s: None)
    return box
