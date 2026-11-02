"""Integration tests run against migrated, isolated SQLite databases."""
import os
from datetime import datetime, timedelta, timezone

os.environ['APP_PASSWORD'] = 'test-secret-password-for-ci'
os.environ['DATABASE_URL'] = 'sqlite://'

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from app import main

HEADERS = {'X-Requested-With': 'PodcastStudio'}

@pytest.fixture
def client(tmp_path, monkeypatch):
    engine = create_engine(f'sqlite:///{tmp_path}/test.db', connect_args={'check_same_thread': False})
    monkeypatch.setattr(main, 'engine', engine)
    monkeypatch.setattr(main, 'SessionLocal', main.sessionmaker(bind=engine))
    command.upgrade(Config('alembic.ini'), 'head')
    main._attempts.clear()
    with TestClient(main.app) as c:
        yield c
    engine.dispose()

@pytest.fixture
def signed(client):
    r = client.post('/api/login', headers=HEADERS, json={'username': 'admin', 'password': os.environ['APP_PASSWORD']})
    assert r.status_code == 200, r.text
    client.headers.update(HEADERS)
    return client

def episode(client):
    r = client.post('/api/episodes', json={'title': 'Two generations', 'source_url': 'https://example.com/episode'})
    assert r.status_code == 201, r.text
    return r.json()['id']

def clip(client, asset=True):
    r = client.post('/api/clips', json={'episode_id': episode(client), 'hook': 'What changed?', 'asset_url': 'https://example.com/clip.mp4' if asset else ''})
    assert r.status_code == 201, r.text
    return r.json()['id']

def advance(client, id, state, **kwargs):
    return client.patch(f'/api/clips/{id}', json={'status': state, **kwargs})

def future():
    return (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()

def test_login_logout_and_security(client):
    assert client.get('/').status_code == 200
    assert client.get('/api/episodes').status_code == 401
    assert client.get('/api/export').status_code == 401
    assert client.get('/api/audit').status_code == 401
    assert client.get('/docs').status_code == 404
    assert client.post('/api/login', json={'username':'admin', 'password':os.environ['APP_PASSWORD']}).status_code == 403
    assert client.post('/api/login', headers={**HEADERS, 'Origin':'https://attacker.test'}, json={}).status_code == 403
    assert client.post('/api/login', headers=HEADERS, json={'username':'admin', 'password':'wrong'}).status_code == 401
    r = client.post('/api/login', headers=HEADERS, json={'username':'admin', 'password':os.environ['APP_PASSWORD']})
    assert 'HttpOnly' in r.headers['set-cookie'] and 'SameSite=strict' in r.headers['set-cookie']
    assert 'script-src \'self\'' in r.headers['content-security-policy']
    assert client.get('/api/me').status_code == 200
    assert client.post('/api/logout', headers=HEADERS).status_code == 200
    assert client.get('/api/me').status_code == 401

def test_workflow(signed):
    id = clip(signed)
    assert advance(signed, id, 'published').status_code == 422
    assert advance(signed, id, 'review').status_code == 200
    assert advance(signed, id, 'approved').status_code == 200
    assert advance(signed, id, 'scheduled').status_code == 422
    assert advance(signed, id, 'scheduled', scheduled_for='2020-01-01T00:00:00Z').status_code == 422
    assert advance(signed, id, 'scheduled', scheduled_for='2099-01-01T00:00:00').status_code == 422
    assert advance(signed, id, 'scheduled', scheduled_for=future()).status_code == 200
    assert advance(signed, id, 'approved').json()['scheduled_for'] is None
    assert advance(signed, id, 'scheduled', scheduled_for=future()).status_code == 200
    assert advance(signed, id, 'published').status_code == 200
    assert advance(signed, id, 'draft').status_code == 422
    assert signed.get('/api/dashboard').json()['published'] == 1
    events = signed.get('/api/audit').json()
    assert any(e['action'] == 'clip.scheduled.published' for e in events)

def test_edit_reapproval(signed):
    id = clip(signed)
    data = signed.get('/api/clips').json()[0]
    payload = {k: data[k] for k in ['episode_id','hook','caption','platform','asset_url']}
    advance(signed, id, 'review')
    assert signed.put(f'/api/clips/{id}/content', json={**payload, 'hook':'Updated hook'}).json()['status'] == 'draft'
    advance(signed, id, 'review')
    advance(signed, id, 'approved')
    assert signed.put(f'/api/clips/{id}/content', json=payload).status_code == 409
    assert signed.delete(f'/api/clips/{id}').status_code == 409
    advance(signed, id, 'draft')
    assert signed.delete(f'/api/clips/{id}').status_code == 200
    assert advance(signed, id, 'review').status_code == 404

def test_validation_and_export(signed):
    for payload in [{'title':'   '}, {'title':'Hello', 'source_url':'javascript:alert(1)'}, {'title':'Hello','source_url':'https://user:pass@example.com'}, {'title':'Hello','unexpected':True}]:
        assert signed.post('/api/episodes', json=payload).status_code == 422
    assert signed.post('/api/clips', json={'episode_id':999,'hook':'Missing'}).status_code == 404
    id = episode(signed)
    assert signed.put(f'/api/episodes/{id}', json={'title':'New title'}).json()['title'] == 'New title'
    assert signed.get('/api/episodes?limit=501').status_code == 422
    metric = {'recorded_on':'2026-01-01','platform':'instagram','plays':100,'followers':10,'engagement':5}
    assert signed.post('/api/metrics', json={**metric, 'plays':-1}).status_code == 422
    r = signed.post('/api/metrics', json=metric)
    assert r.status_code == 201
    exported = signed.get('/api/export')
    assert exported.json()['episodes'][0]['title'] == 'New title'
    assert len(exported.json()['metrics']) == 1
    assert 'login_sessions' not in exported.text
    assert signed.delete(f"/api/metrics/{r.json()['id']}").status_code == 200

def test_missing_asset_and_templates(signed, monkeypatch):
    monkeypatch.setenv('LLM_BASE_URL','')
    id = clip(signed, asset=False)
    advance(signed, id, 'review'); advance(signed, id, 'approved')
    assert advance(signed, id, 'scheduled', scheduled_for=future()).status_code == 422
    episode_id = signed.get('/api/episodes').json()[0]['id']
    assert signed.post('/api/ideas', json={'episode_id':episode_id}).json()['source'] == 'template'

def test_limits_and_health(client):
    assert client.get('/health').json() == {'status':'ok'}
    assert client.get('/ready').status_code == 200
    assert client.get('/health', headers={'host':'evil.test'}).status_code == 400
    assert client.post('/api/login', headers=HEADERS, content='x'*65537).status_code == 413
    for _ in range(10):
        assert client.post('/api/login', headers=HEADERS, json={'username':'x','password':'x'}).status_code == 401
    assert client.post('/api/login', headers=HEADERS, json={'username':'x','password':'x'}).status_code == 429

def test_expired_session(signed):
    with main.SessionLocal() as db:
        record = db.scalars(select(main.LoginSession)).first()
        record.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.commit()
    assert signed.get('/api/me').status_code == 401

def test_upgrade_preserves_legacy_rows(tmp_path, monkeypatch):
    engine = create_engine(f'sqlite:///{tmp_path}/legacy.db')
    monkeypatch.setattr(main, 'engine', engine)
    cfg = Config('alembic.ini')
    command.upgrade(cfg, '0001')
    with main.Session(bind=engine) as db:
        db.add(main.Episode(title='Keep me', description='', source_url=''))
        db.commit()
    command.upgrade(cfg, 'head')
    with main.Session(bind=engine) as db:
        assert db.scalars(select(main.Episode)).one().title == 'Keep me'
    command.downgrade(cfg, '0001')
    engine.dispose()

def test_password_rotation_revokes_sessions(signed, monkeypatch):
    monkeypatch.setenv('APP_PASSWORD','a-completely-new-test-password')
    assert signed.get('/api/me').status_code == 401

def test_clip_concurrent_updates_fail(signed):
    from sqlalchemy.orm.exc import StaleDataError
    id = clip(signed)
    with main.SessionLocal() as first, main.SessionLocal() as second:
        a = first.get(main.Clip, id)
        b = second.get(main.Clip, id)
        a.hook = 'First editor'
        first.commit()
        b.status = 'review'
        with pytest.raises(StaleDataError):
            second.commit()

def test_timezone_schedule_is_utc(signed):
    id = clip(signed)
    advance(signed, id, 'review'); advance(signed, id, 'approved')
    local = (datetime.now(timezone(timedelta(hours=-7))) + timedelta(days=1)).isoformat()
    r = advance(signed, id, 'scheduled', scheduled_for=local)
    assert r.status_code == 200
    assert datetime.fromisoformat(r.json()['scheduled_for']).utcoffset() == timedelta(0)

def test_weak_credentials_refuse_start(client, monkeypatch):
    monkeypatch.setenv('APP_PASSWORD', 'weak')
    with pytest.raises(RuntimeError, match='at least 16 characters'):
        with TestClient(main.app):
            pass

def test_malformed_ai_response_falls_back(signed, monkeypatch):
    import httpx
    monkeypatch.setenv('LLM_BASE_URL', 'https://model.example/v1')
    class FakeClient:
        def __init__(self, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        async def post(self, url, **kwargs):
            return httpx.Response(200, request=httpx.Request('POST', url), json={'choices':[{'message':{'content':'[]'}}]})
    monkeypatch.setattr(main.httpx, 'AsyncClient', FakeClient)
    r = signed.post('/api/ideas', json={'episode_id':episode(signed)})
    assert r.status_code == 200 and r.json()['source'] == 'template'
    assert 'warning' in r.json()
