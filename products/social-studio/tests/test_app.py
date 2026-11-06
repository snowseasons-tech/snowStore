import json
import os
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import httpx
import pytest

import app.integrations as integrations
import app.main as main
import app.worker as worker
from app.db import Connection, Invite, OAuthState, Post, Session, now
from app.security import decrypt, encrypt
from conftest import invite, make_client, register

FUTURE = lambda hours=2: (datetime.now(timezone.utc) + timedelta(hours=hours)).isoformat()


def add_connection(client_id, platform='facebook', token='page-token'):
    with Session() as db:
        conn = Connection(client_id=client_id, platform=platform, external_id=f'{platform}-1',
                          display_name=f'{platform} account', token_enc=encrypt(token))
        db.add(conn)
        db.commit()
        return conn.id


def new_post(client, headers, client_id, platform='facebook', media_url=''):
    r = client.post(f'/api/clients/{client_id}/posts', headers=headers,
                    json={'title': 'Tips', 'platform': platform, 'content': 'Hello there', 'media_url': media_url})
    assert r.status_code == 200, r.text
    return r.json()['id']


def approved_post(client, headers, client_id, **kw):
    pid = new_post(client, headers, client_id, **kw)
    for action in ('submit', 'approve'):
        assert client.post(f'/api/clients/{client_id}/posts/{pid}/{action}', headers=headers).status_code == 200
    return pid


# --- Registration and invites -------------------------------------------------------------

def test_first_account_can_register_then_registration_closes(client):
    assert client.get('/api/config').json()['registration_open'] is True
    register(client, 'owner@example.com')
    assert client.get('/api/config').json()['registration_open'] is False
    r = client.post('/api/auth/register', json={'email': 'stranger@example.com', 'password': 'another-long-password'})
    assert r.status_code == 403
    assert 'invite code' in r.json()['detail']


def test_allow_registration_keeps_signups_open(client, monkeypatch):
    monkeypatch.setenv('ALLOW_REGISTRATION', '1')
    register(client, 'owner@example.com')
    register(client, 'second@example.com')


def test_invite_code_creates_account_with_role(client):
    owner = register(client, 'owner@example.com')
    cid = make_client(client, owner)
    result = invite(client, owner, cid, 'Editor@Example.com', 'editor')
    assert result['invited'] is True and result['invite_code']

    editor = register(client, 'editor@example.com', invite_code=result['invite_code'])
    assert [c['id'] for c in client.get('/api/clients', headers=editor).json()] == [cid]
    pid = new_post(client, editor, cid)
    assert client.post(f'/api/clients/{cid}/posts/{pid}/submit', headers=editor).status_code == 200
    assert client.post(f'/api/clients/{cid}/posts/{pid}/approve', headers=editor).status_code == 403
    with Session() as db:
        assert db.query(Invite).count() == 0


def test_invite_code_is_bound_to_email_single_use_and_expires(client):
    owner = register(client, 'owner@example.com')
    cid = make_client(client, owner)
    code = invite(client, owner, cid, 'new@example.com', 'viewer')['invite_code']

    wrong = client.post('/api/auth/register', json={'email': 'other@example.com', 'password': 'another-long-password', 'invite_code': code})
    assert wrong.status_code == 403
    register(client, 'new@example.com', invite_code=code)
    reused = client.post('/api/auth/register', json={'email': 'new2@example.com', 'password': 'another-long-password', 'invite_code': code})
    assert reused.status_code == 403

    code2 = invite(client, owner, cid, 'late@example.com', 'viewer')['invite_code']
    with Session() as db:
        inv = db.query(Invite).filter_by(email='late@example.com').one()
        inv.expires_at = now() - timedelta(minutes=1)
        db.commit()
    expired = client.post('/api/auth/register', json={'email': 'late@example.com', 'password': 'another-long-password', 'invite_code': code2})
    assert expired.status_code == 403


def test_reinviting_replaces_the_old_code(client):
    owner = register(client, 'owner@example.com')
    cid = make_client(client, owner)
    first = invite(client, owner, cid, 'new@example.com', 'viewer')['invite_code']
    second = invite(client, owner, cid, 'new@example.com', 'editor')['invite_code']
    assert client.post('/api/auth/register', json={'email': 'new@example.com', 'password': 'another-long-password', 'invite_code': first}).status_code == 403
    register(client, 'new@example.com', invite_code=second)


def test_existing_user_is_added_directly(client, monkeypatch):
    monkeypatch.setenv('ALLOW_REGISTRATION', '1')
    owner = register(client, 'owner@example.com')
    register(client, 'member@example.com')
    cid = make_client(client, owner)
    assert invite(client, owner, cid, 'member@example.com', 'approver') == {'ok': True, 'invited': False}
    again = client.post(f'/api/clients/{cid}/members', headers=owner, json={'email': 'member@example.com', 'role': 'viewer'})
    assert again.status_code == 409


# --- Access control ------------------------------------------------------------------------

def test_workspaces_are_isolated_between_accounts(client, monkeypatch):
    monkeypatch.setenv('ALLOW_REGISTRATION', '1')
    a = register(client, 'a@example.com')
    b = register(client, 'b@example.com')
    cid = make_client(client, a)
    for method, path in [('get', f'/api/clients/{cid}/posts'), ('get', f'/api/clients/{cid}/connections'),
                         ('post', f'/api/clients/{cid}/generate')]:
        kw = {'json': {'topic': 'Spring cleanup tips'}} if method == 'post' else {}
        assert getattr(client, method)(path, headers=b, **kw).status_code == 404
    assert client.get('/api/clients', headers=b).json() == []


def test_roles_limit_what_members_can_do(client):
    owner = register(client, 'owner@example.com')
    cid = make_client(client, owner)
    viewer = register(client, 'viewer@example.com', invite_code=invite(client, owner, cid, 'viewer@example.com', 'viewer')['invite_code'])
    approver = register(client, 'approver@example.com', invite_code=invite(client, owner, cid, 'approver@example.com', 'approver')['invite_code'])

    assert client.post(f'/api/clients/{cid}/posts', headers=viewer, json={'title': 't', 'platform': 'facebook', 'content': 'c'}).status_code == 403
    assert client.get(f'/api/clients/{cid}/posts', headers=viewer).status_code == 200
    assert client.post(f'/api/clients/{cid}/members', headers=approver, json={'email': 'x@example.com', 'role': 'viewer'}).status_code == 403
    pid = new_post(client, owner, cid)
    client.post(f'/api/clients/{cid}/posts/{pid}/submit', headers=owner)
    assert client.post(f'/api/clients/{cid}/posts/{pid}/approve', headers=approver).status_code == 200


def test_requests_without_a_valid_login_are_rejected(client):
    assert client.get('/api/me').status_code == 401
    assert client.get('/api/me', headers={'Authorization': 'Bearer not-a-token'}).status_code == 401
    register(client, 'owner@example.com')
    bad = client.post('/api/auth/login', json={'email': 'owner@example.com', 'password': 'wrong-password-123'})
    assert bad.status_code == 401


# --- Post lifecycle and scheduling ----------------------------------------------------------

def test_rejected_and_failed_posts_go_back_to_draft_when_edited(client):
    owner = register(client, 'owner@example.com')
    cid = make_client(client, owner)
    pid = new_post(client, owner, cid)
    client.post(f'/api/clients/{cid}/posts/{pid}/submit', headers=owner)
    assert client.post(f'/api/clients/{cid}/posts/{pid}/reject', headers=owner).json()['status'] == 'rejected'
    edit = {'title': 'Tips', 'platform': 'facebook', 'content': 'Better text'}
    assert client.put(f'/api/clients/{cid}/posts/{pid}', headers=owner, json=edit).json()['status'] == 'draft'

    with Session() as db:
        db.get(Post, pid).status = 'failed'
        db.get(Post, pid).last_error = 'boom'
        db.commit()
    edited = client.put(f'/api/clients/{cid}/posts/{pid}', headers=owner, json=edit).json()
    assert edited['status'] == 'draft' and edited['last_error'] == ''

    client.post(f'/api/clients/{cid}/posts/{pid}/submit', headers=owner)
    client.post(f'/api/clients/{cid}/posts/{pid}/approve', headers=owner)
    assert client.put(f'/api/clients/{cid}/posts/{pid}', headers=owner, json=edit).status_code == 409


def test_schedule_checks(client):
    owner = register(client, 'owner@example.com')
    cid = make_client(client, owner)
    fb = add_connection(cid, 'facebook')
    ig = add_connection(cid, 'instagram')
    pid = approved_post(client, owner, cid)
    url = f'/api/clients/{cid}/posts/{pid}/schedule'

    past = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    assert client.post(url, headers=owner, json={'scheduled_at': past, 'connection_id': fb}).status_code == 422
    naive = datetime.now().replace(microsecond=0).isoformat()
    assert client.post(url, headers=owner, json={'scheduled_at': naive, 'connection_id': fb}).status_code == 422
    assert client.post(url, headers=owner, json={'scheduled_at': FUTURE(), 'connection_id': ig}).status_code == 422
    ok = client.post(url, headers=owner, json={'scheduled_at': FUTURE(), 'connection_id': fb})
    assert ok.status_code == 200 and ok.json()['status'] == 'scheduled'

    ig_post = approved_post(client, owner, cid, platform='instagram', media_url='http://example.com/a.jpg')
    r = client.post(f'/api/clients/{cid}/posts/{ig_post}/schedule', headers=owner, json={'scheduled_at': FUTURE(), 'connection_id': ig})
    assert r.status_code == 422 and 'HTTPS' in r.json()['detail']

    draft = new_post(client, owner, cid)
    assert client.post(f'/api/clients/{cid}/posts/{draft}/schedule', headers=owner, json={'scheduled_at': FUTURE(), 'connection_id': fb}).status_code == 409


# --- OAuth -----------------------------------------------------------------------------------

def test_oauth_start_returns_provider_url_without_login_token(client):
    owner = register(client, 'owner@example.com')
    cid = make_client(client, owner)
    r = client.post('/api/oauth/meta/start', headers=owner, json={'client_id': cid})
    assert r.status_code == 200
    url = urlparse(r.json()['url'])
    q = parse_qs(url.query)
    assert url.netloc == 'www.facebook.com'
    assert q['redirect_uri'] == ['https://studio.example.com/api/oauth/meta/callback']
    assert owner['Authorization'].split()[1] not in r.json()['url']
    with Session() as db:
        assert db.get(OAuthState, q['state'][0]).client_id == cid

    google = client.post('/api/oauth/google/start', headers=owner, json={'client_id': cid}).json()['url']
    assert 'accounts.google.com' in google and 'access_type=offline' in google
    assert client.get(f'/api/oauth/meta/start?client_id={cid}&token=x').status_code == 405
    assert client.post('/api/oauth/meta/start', json={'client_id': cid}).status_code == 401


def test_only_owners_can_connect_accounts(client):
    owner = register(client, 'owner@example.com')
    cid = make_client(client, owner)
    approver = register(client, 'approver@example.com', invite_code=invite(client, owner, cid, 'approver@example.com', 'approver')['invite_code'])
    assert client.post('/api/oauth/meta/start', headers=approver, json={'client_id': cid}).status_code == 403


def test_oauth_callback_stores_encrypted_tokens_and_state_is_single_use(client, monkeypatch):
    owner = register(client, 'owner@example.com')
    cid = make_client(client, owner)
    state = parse_qs(urlparse(client.post('/api/oauth/meta/start', headers=owner, json={'client_id': cid}).json()['url']).query)['state'][0]

    async def fake_exchange(provider, code):
        assert (provider, code) == ('meta', 'auth-code')
        return 'user-token', '', 3600

    async def fake_discover(provider, access):
        return [{'platform': 'facebook', 'id': 'page-1', 'name': 'Example Page', 'token': 'page-secret'},
                {'platform': 'instagram', 'id': 'ig-1', 'name': 'example', 'token': 'page-secret', 'parent_id': 'page-1'}]

    monkeypatch.setattr(main, 'exchange', fake_exchange)
    monkeypatch.setattr(main, 'discover_accounts', fake_discover)
    r = client.get(f'/api/oauth/meta/callback?state={state}&code=auth-code', follow_redirects=False)
    assert r.status_code in (302, 307) and r.headers['location'] == '/?connected=meta'

    conns = client.get(f'/api/clients/{cid}/connections', headers=owner).json()
    assert sorted(c['platform'] for c in conns) == ['facebook', 'instagram']
    with Session() as db:
        for c in db.query(Connection).all():
            assert c.token_enc != 'page-secret' and decrypt(c.token_enc) == 'page-secret'
    assert client.get(f'/api/oauth/meta/callback?state={state}&code=auth-code', follow_redirects=False).status_code == 400


def connect(client, owner, cid, monkeypatch, accounts):
    state = parse_qs(urlparse(client.post('/api/oauth/meta/start', headers=owner, json={'client_id': cid}).json()['url']).query)['state'][0]

    async def fake_exchange(provider, code):
        return 'user-token', '', 3600

    async def fake_discover(provider, access):
        return [{'platform': 'facebook', 'id': a, 'name': a, 'token': 'secret'} for a in accounts]

    monkeypatch.setattr(main, 'exchange', fake_exchange)
    monkeypatch.setattr(main, 'discover_accounts', fake_discover)
    return client.get(f'/api/oauth/meta/callback?state={state}&code=auth-code', follow_redirects=False).headers['location']


def test_account_limit_stops_at_plan_size_and_counts_every_workspace(client, monkeypatch):
    monkeypatch.setenv('MAX_ACCOUNTS', '3')
    owner = register(client, 'owner@example.com')
    first, second = make_client(client, owner), make_client(client, owner, 'Second Co')
    assert client.get('/api/plan', headers=owner).json() == {'limit': 3, 'used': 0}
    assert connect(client, owner, first, monkeypatch, ['a', 'b']) == '/?connected=meta'
    assert connect(client, owner, second, monkeypatch, ['c', 'd', 'e']) == '/?connected=meta&skipped=2'
    assert client.get('/api/plan', headers=owner).json() == {'limit': 3, 'used': 3}
    assert [c['external_id'] for c in client.get(f'/api/clients/{second}/connections', headers=owner).json()] == ['c']


def test_reconnecting_at_the_limit_keeps_working_and_disconnecting_frees_a_place(client, monkeypatch):
    monkeypatch.setenv('MAX_ACCOUNTS', '1')
    owner = register(client, 'owner@example.com')
    cid = make_client(client, owner)
    assert connect(client, owner, cid, monkeypatch, ['a']) == '/?connected=meta'
    assert connect(client, owner, cid, monkeypatch, ['a', 'b']) == '/?connected=meta&skipped=1'
    conn = client.get(f'/api/clients/{cid}/connections', headers=owner).json()[0]
    assert client.delete(f"/api/clients/{cid}/connections/{conn['id']}", headers=owner).status_code == 200
    assert connect(client, owner, cid, monkeypatch, ['b']) == '/?connected=meta'


def test_no_limit_by_default_and_plan_needs_login(client, monkeypatch):
    owner = register(client, 'owner@example.com')
    cid = make_client(client, owner)
    assert connect(client, owner, cid, monkeypatch, ['a', 'b', 'c', 'd']) == '/?connected=meta'
    assert client.get('/api/plan', headers=owner).json() == {'limit': None, 'used': 4}
    assert client.get('/api/plan').status_code == 401


@pytest.mark.parametrize('value', ['three', '-1'])
def test_bad_account_limit_stops_startup(monkeypatch, value):
    monkeypatch.setenv('MAX_ACCOUNTS', value)
    with pytest.raises(ValueError):
        main.account_limit()


def test_setup_code_protects_the_first_account_only(client, monkeypatch):
    monkeypatch.setenv('SETUP_CODE', 'welcome-code')
    body = {'email': 'owner@example.com', 'password': 'correct-horse-battery'}
    assert client.post('/api/auth/register', json=body).status_code == 403
    assert client.post('/api/auth/register', json={**body, 'invite_code': 'wrong'}).status_code == 403
    assert client.post('/api/auth/register', json={**body, 'invite_code': 'welcome-code'}).status_code == 200
    late = {'email': 'second@example.com', 'password': 'correct-horse-battery', 'invite_code': 'welcome-code'}
    assert client.post('/api/auth/register', json=late).status_code == 403


def test_hosted_server_uses_the_shared_oauth_address(client, monkeypatch):
    monkeypatch.setenv('SUBSCRIBER_ID', 'abc123')
    monkeypatch.setenv('OAUTH_REDIRECT_URL', 'https://oauth.example.com/')
    owner = register(client, 'owner@example.com')
    cid = make_client(client, owner)
    q = parse_qs(urlparse(client.post('/api/oauth/meta/start', headers=owner, json={'client_id': cid}).json()['url']).query)
    assert q['redirect_uri'] == ['https://oauth.example.com/api/oauth/meta/callback']
    assert q['state'][0].startswith('abc123~')


# --- AI generation -----------------------------------------------------------------------------

def test_generate_falls_back_to_templates_without_a_model(client):
    owner = register(client, 'owner@example.com')
    cid = make_client(client, owner)
    r = client.post(f'/api/clients/{cid}/generate', headers=owner, json={'topic': 'Spring cleanup tips', 'platforms': ['google', 'instagram']}).json()
    assert r['mode'] == 'template' and set(r['posts']) == {'google', 'instagram'}
    assert 'Example Co' in r['posts']['google']


def test_generate_uses_the_configured_model(client, monkeypatch):
    owner = register(client, 'owner@example.com')
    cid = make_client(client, owner)
    monkeypatch.setenv('LLM_MODEL', 'local-model')
    reply = '```json\n' + json.dumps({'google': 'G text', 'facebook': 'F text', 'instagram': 'I text'}) + '\n```'

    def handler(request):
        assert request.url.path.endswith('/chat/completions')
        return httpx.Response(200, json={'choices': [{'message': {'content': reply}}]})

    real = httpx.AsyncClient
    monkeypatch.setattr(main.httpx, 'AsyncClient', lambda **kw: real(transport=httpx.MockTransport(handler), **kw))
    r = client.post(f'/api/clients/{cid}/generate', headers=owner, json={'topic': 'Spring cleanup tips', 'platforms': ['google', 'facebook']}).json()
    assert r == {'posts': {'google': 'G text', 'facebook': 'F text'}, 'mode': 'llm'}


# --- Worker --------------------------------------------------------------------------------------

def due_post(client, platform='facebook'):
    owner = register(client, 'owner@example.com')
    cid = make_client(client, owner)
    conn = add_connection(cid, platform)
    pid = approved_post(client, owner, cid)
    with Session() as db:
        p = db.get(Post, pid)
        p.status, p.connection_id, p.scheduled_at = 'scheduled', conn, now() - timedelta(minutes=1)
        db.commit()
    return pid


def test_worker_publishes_due_posts(client, monkeypatch):
    pid = due_post(client)

    async def fake_publish(post, conn):
        return 'external-123'

    monkeypatch.setattr(worker, 'publish', fake_publish)
    import asyncio
    asyncio.run(worker.run_once())
    with Session() as db:
        p = db.get(Post, pid)
        assert (p.status, p.external_post_id, p.last_error) == ('published', 'external-123', '')


def test_worker_marks_failures_without_retrying(client, monkeypatch):
    pid = due_post(client)
    calls = []

    async def failing_publish(post, conn):
        calls.append(post.id)
        raise RuntimeError('Provider HTTP 400: bad request')

    monkeypatch.setattr(worker, 'publish', failing_publish)
    import asyncio
    asyncio.run(worker.run_once())
    asyncio.run(worker.run_once())
    with Session() as db:
        p = db.get(Post, pid)
        assert p.status == 'failed' and 'bad request' in p.last_error
    assert calls == [pid]


def test_worker_recovers_posts_stuck_in_publishing(client):
    owner = register(client, 'owner@example.com')
    cid = make_client(client, owner)
    old, recent = new_post(client, owner, cid), new_post(client, owner, cid)
    with Session() as db:
        for pid, age in ((old, 20), (recent, 1)):
            p = db.get(Post, pid)
            p.status, p.updated_at = 'publishing', now() - timedelta(minutes=age)
        db.commit()
    import asyncio
    asyncio.run(worker.run_once())
    with Session() as db:
        assert db.get(Post, old).status == 'failed' and 'interrupted' in db.get(Post, old).last_error
        assert db.get(Post, recent).status == 'publishing'


# --- Provider calls (simulated) -------------------------------------------------------------

class Recorder:
    def __init__(self, routes):
        self.routes, self.calls = routes, []

    def __call__(self, request):
        self.calls.append((request.method, request.url.host, request.url.path))
        for (method, fragment), response in self.routes.items():
            if request.method == method and fragment in str(request.url):
                return response() if callable(response) else response
        return httpx.Response(404, json={'error': 'unexpected call'})


@pytest.fixture
def fake_http(monkeypatch):
    def install(routes):
        rec = Recorder(routes)
        real = httpx.AsyncClient
        monkeypatch.setattr(integrations.httpx, 'AsyncClient', lambda **kw: real(transport=httpx.MockTransport(rec), **kw))

        async def no_sleep(_):
            return None
        monkeypatch.setattr(integrations.asyncio, 'sleep', no_sleep)
        return rec
    return install


def run_publish(platform, external_id, media_url='', expires_at=None, refresh=''):
    post = Post(client_id='c', author_id='u', platform=platform, title='t', content='Hello', media_url=media_url)
    conn = Connection(client_id='c', platform=platform, external_id=external_id, display_name='x',
                      token_enc=encrypt('page-token'), refresh_enc=encrypt(refresh) if refresh else '', expires_at=expires_at)
    import asyncio
    return asyncio.run(integrations.publish(post, conn)), conn


def test_publish_to_facebook_page(fake_http):
    rec = fake_http({('POST', '/page-1/feed'): httpx.Response(200, json={'id': 'page-1_post-9'})})
    result, _ = run_publish('facebook', 'page-1')
    assert result == 'page-1_post-9' and rec.calls[0][1] == 'graph.facebook.com'


def test_publish_to_instagram_waits_for_media_processing(fake_http):
    statuses = iter(['IN_PROGRESS', 'FINISHED'])
    rec = fake_http({
        ('POST', '/ig-1/media_publish'): httpx.Response(200, json={'id': 'ig-media-1'}),
        ('POST', '/ig-1/media'): httpx.Response(200, json={'id': 'container-1'}),
        ('GET', '/container-1'): lambda: httpx.Response(200, json={'status_code': next(statuses)}),
    })
    result, _ = run_publish('instagram', 'ig-1', media_url='https://example.com/photo.jpg')
    assert result == 'ig-media-1'
    assert [c[2].rsplit('/', 1)[-1] for c in rec.calls] == ['media', 'container-1', 'container-1', 'media_publish']


def test_publish_to_instagram_reports_processing_errors(fake_http):
    fake_http({('POST', '/ig-1/media'): httpx.Response(200, json={'id': 'container-1'}),
               ('GET', '/container-1'): httpx.Response(200, json={'status_code': 'ERROR'})})
    with pytest.raises(RuntimeError, match='processing'):
        run_publish('instagram', 'ig-1', media_url='https://example.com/photo.jpg')


def test_publish_to_google_refreshes_an_expiring_token(fake_http):
    rec = fake_http({
        ('POST', 'oauth2.googleapis.com/token'): httpx.Response(200, json={'access_token': 'fresh-token', 'expires_in': 3600}),
        ('POST', '/localPosts'): httpx.Response(200, json={'name': 'accounts/1/locations/2/localPosts/3'}),
    })
    result, conn = run_publish('google', 'accounts/1/locations/2', expires_at=now() + timedelta(seconds=30), refresh='refresh-token')
    assert result == 'accounts/1/locations/2/localPosts/3'
    assert decrypt(conn.token_enc) == 'fresh-token' and conn.expires_at > now() + timedelta(minutes=50)
    assert [c[1] for c in rec.calls] == ['oauth2.googleapis.com', 'mybusiness.googleapis.com']


def test_provider_errors_are_reported(fake_http):
    fake_http({('POST', '/page-1/feed'): httpx.Response(400, json={'error': {'message': 'Invalid OAuth access token'}})})
    with pytest.raises(RuntimeError, match='Provider HTTP 400'):
        run_publish('facebook', 'page-1')


# --- Pages ------------------------------------------------------------------------------------------

def test_home_page_and_config(client):
    page = client.get('/')
    assert page.status_code == 200 and 'text/html' in page.headers['content-type']
    cfg = client.get('/api/config').json()
    assert cfg['name'] == 'Social Studio' and cfg['providers'] == {'google': True, 'meta': True}


# --- Startup ----------------------------------------------------------------------------------------

@pytest.mark.parametrize('key', ['REPLACE_WITH_64_HEX_CHAR_RANDOM_KEY', 'short'])
def test_placeholder_or_short_secret_key_is_refused(key):
    env = {**os.environ, 'SECRET_KEY': key, 'DATABASE_URL': 'sqlite://'}
    result = subprocess.run([sys.executable, '-c', 'import app.security'], env=env,
                            cwd=Path(__file__).resolve().parent.parent, capture_output=True, text=True)
    assert result.returncode != 0 and 'Set SECRET_KEY' in result.stderr
