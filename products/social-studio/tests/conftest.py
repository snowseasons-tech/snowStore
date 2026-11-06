"""Test setup: a throwaway SQLite database and fake provider credentials, set before the app is imported.

Run from the project folder:  pip install -r requirements.lock -r requirements-dev.txt && python -m pytest
"""
import os
import secrets
import sys
import tempfile
from pathlib import Path

import pytest
from cryptography.fernet import Fernet
from sqlalchemy.engine import make_url

_test_database_url = os.getenv('SOCIAL_STUDIO_TEST_DATABASE_URL')
_db_path = None
if _test_database_url:
    # Tests drop and recreate tables. Only accept an explicitly named throwaway
    # database, never an existing DATABASE_URL from someone's app environment.
    _url = make_url(_test_database_url)
    if _url.get_backend_name() != 'mysql' or not (_url.database or '').startswith('social_studio_test_'):
        raise RuntimeError('Use a disposable MySQL database named social_studio_test_*')
else:
    _fd, _db_path = tempfile.mkstemp(prefix='social-studio-test-', suffix='.db')
    os.close(_fd)
    _test_database_url = f'sqlite:///{_db_path}'
os.environ.update(
    DATABASE_URL=_test_database_url,
    SECRET_KEY=secrets.token_hex(32),
    FERNET_KEY=Fernet.generate_key().decode(),
    PUBLIC_URL='https://studio.example.com',
    GOOGLE_CLIENT_ID='google-client-id',
    GOOGLE_CLIENT_SECRET='google-client-secret',
    META_APP_ID='meta-app-id',
    META_APP_SECRET='meta-app-secret',
)
for name in ('LLM_MODEL', 'ALLOW_REGISTRATION', 'APP_NAME', 'SMTP_HOST', 'SMTP_FROM', 'SMTP_USERNAME', 'MAX_ACCOUNTS', 'SETUP_CODE', 'SUBSCRIBER_ID', 'OAUTH_REDIRECT_URL'):
    os.environ.pop(name, None)
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402
from app.db import Base, engine  # noqa: E402
from app.main import app  # noqa: E402

PASSWORD = 'correct-horse-battery'


def pytest_sessionfinish(session, exitstatus):
    engine.dispose()
    if _db_path:
        Path(_db_path).unlink(missing_ok=True)


@pytest.fixture(autouse=True)
def fresh_db():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def register(client, email, invite_code=None, password=PASSWORD):
    body = {'email': email, 'password': password}
    if invite_code:
        body['invite_code'] = invite_code
    r = client.post('/api/auth/register', json=body)
    assert r.status_code == 200, r.text
    return {'Authorization': f"Bearer {r.json()['token']}"}


def make_client(client, headers, name='Example Co'):
    r = client.post('/api/clients', headers=headers, json={'name': name, 'service_area': 'Springfield'})
    assert r.status_code == 200, r.text
    return r.json()['id']


def invite(client, owner, client_id, email, role):
    r = client.post(f'/api/clients/{client_id}/members', headers=owner, json={'email': email, 'role': role})
    assert r.status_code == 200, r.text
    return r.json()
