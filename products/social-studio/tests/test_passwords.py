from datetime import timedelta
from urllib.parse import parse_qs, urlparse

import pytest

import app.main as main
import app.mail as mail
from app import reset_password
from app.db import PasswordReset, Session, SessionCutoff, now
from conftest import PASSWORD, register

NEW_PASSWORD = 'a-brand-new-password'


@pytest.fixture
def outbox(monkeypatch):
    """Turn email on and capture messages instead of sending them."""
    sent = []
    monkeypatch.setenv('SMTP_HOST', 'smtp.example.com')
    monkeypatch.setenv('SMTP_FROM', 'studio@example.com')
    monkeypatch.setattr(mail, 'send', lambda to, subject, body: sent.append({'to': to, 'subject': subject, 'body': body}))
    return sent


def reset_code(message):
    link = next(line for line in message['body'].splitlines() if '?reset=' in line)
    assert link.startswith('https://studio.example.com/?reset=')
    return parse_qs(urlparse(link).query)['reset'][0]


def login(client, password):
    return client.post('/api/auth/login', json={'email': 'owner@example.com', 'password': password})


def test_reset_by_email_changes_password_and_signs_out_old_sessions(client, outbox):
    old_session = register(client, 'owner@example.com')
    assert client.get('/api/config').json()['password_reset_email'] is True

    r = client.post('/api/auth/forgot', json={'email': 'Owner@Example.com'})
    assert r.json() == {'ok': True, 'email_enabled': True}
    assert len(outbox) == 1 and outbox[0]['to'] == 'owner@example.com'
    assert 'Social Studio' in outbox[0]['subject']

    done = client.post('/api/auth/reset', json={'code': reset_code(outbox[0]), 'password': NEW_PASSWORD})
    assert done.status_code == 200
    assert client.get('/api/me', headers={'Authorization': f"Bearer {done.json()['token']}"}).status_code == 200

    stale = client.get('/api/me', headers=old_session)
    assert stale.status_code == 401 and 'password was changed' in stale.json()['detail']
    assert login(client, PASSWORD).status_code == 401
    assert login(client, NEW_PASSWORD).status_code == 200


def test_unknown_email_gets_the_same_answer_and_no_email(client, outbox):
    register(client, 'owner@example.com')
    r = client.post('/api/auth/forgot', json={'email': 'nobody@example.com'})
    assert r.json() == {'ok': True, 'email_enabled': True}
    assert outbox == []


def test_reset_codes_are_single_use_and_expire(client, outbox):
    register(client, 'owner@example.com')
    client.post('/api/auth/forgot', json={'email': 'owner@example.com'})
    code = reset_code(outbox[0])
    assert client.post('/api/auth/reset', json={'code': code, 'password': NEW_PASSWORD}).status_code == 200
    assert client.post('/api/auth/reset', json={'code': code, 'password': 'yet-another-password'}).status_code == 400

    with Session() as db:  # allow a new request straight away, then expire it
        db.query(PasswordReset).delete()
        db.commit()
    client.post('/api/auth/forgot', json={'email': 'owner@example.com'})
    with Session() as db:
        db.query(PasswordReset).one().expires_at = now() - timedelta(minutes=1)
        db.commit()
    expired = client.post('/api/auth/reset', json={'code': reset_code(outbox[1]), 'password': 'yet-another-password'})
    assert expired.status_code == 400 and 'expired' in expired.json()['detail']
    assert client.post('/api/auth/reset', json={'code': 'made-up-code-123', 'password': 'yet-another-password'}).status_code == 400


def test_new_password_must_be_long_enough(client, outbox):
    register(client, 'owner@example.com')
    client.post('/api/auth/forgot', json={'email': 'owner@example.com'})
    short = client.post('/api/auth/reset', json={'code': reset_code(outbox[0]), 'password': 'short'})
    assert short.status_code == 422
    assert login(client, PASSWORD).status_code == 200


def test_repeat_requests_are_throttled(client, outbox):
    register(client, 'owner@example.com')
    for _ in range(3):
        client.post('/api/auth/forgot', json={'email': 'owner@example.com'})
    assert len(outbox) == 1
    with Session() as db:
        reset = db.query(PasswordReset).one()
        reset.created_at = now() - timedelta(minutes=3)
        db.commit()
    client.post('/api/auth/forgot', json={'email': 'owner@example.com'})
    assert len(outbox) == 2
    with Session() as db:
        assert db.query(PasswordReset).count() == 1  # the newer code replaced the older one
    assert client.post('/api/auth/reset', json={'code': reset_code(outbox[0]), 'password': NEW_PASSWORD}).status_code == 400
    assert client.post('/api/auth/reset', json={'code': reset_code(outbox[1]), 'password': NEW_PASSWORD}).status_code == 200


def test_without_smtp_no_code_is_created(client, monkeypatch, caplog):
    monkeypatch.delenv('SMTP_HOST', raising=False)
    register(client, 'owner@example.com')
    assert client.get('/api/config').json()['password_reset_email'] is False
    r = client.post('/api/auth/forgot', json={'email': 'owner@example.com'})
    assert r.json() == {'ok': True, 'email_enabled': False}
    with Session() as db:
        assert db.query(PasswordReset).count() == 0
    assert 'app.reset_password' in caplog.text


def test_email_failures_do_not_break_the_request(client, monkeypatch):
    monkeypatch.setenv('SMTP_HOST', 'smtp.example.com')
    monkeypatch.setenv('SMTP_FROM', 'studio@example.com')

    def broken(*args):
        raise OSError('connection refused')

    monkeypatch.setattr(mail, 'send', broken)
    register(client, 'owner@example.com')
    assert client.post('/api/auth/forgot', json={'email': 'owner@example.com'}).status_code == 200


def test_reset_command_sets_a_typed_password(client, monkeypatch, capsys):
    old_session = register(client, 'owner@example.com')
    answers = iter([NEW_PASSWORD, NEW_PASSWORD])
    monkeypatch.setattr(reset_password.getpass, 'getpass', lambda prompt='': next(answers))
    assert reset_password.main(['Owner@Example.com']) == 0
    assert 'Password updated for owner@example.com' in capsys.readouterr().out
    assert login(client, NEW_PASSWORD).status_code == 200
    assert client.get('/api/me', headers=old_session).status_code == 401
    with Session() as db:
        assert db.query(SessionCutoff).count() == 1


def test_reset_command_can_generate_a_password(client, capsys):
    register(client, 'owner@example.com')
    assert reset_password.main(['owner@example.com', '--generate']) == 0
    generated = capsys.readouterr().out.split('New password: ')[1].strip()
    assert login(client, generated).status_code == 200


def test_reset_command_refuses_bad_input(client, monkeypatch, capsys):
    register(client, 'owner@example.com')
    assert reset_password.main(['missing@example.com', '--generate']) == 1
    answers = iter([NEW_PASSWORD, 'something-else-entirely'])
    monkeypatch.setattr(reset_password.getpass, 'getpass', lambda prompt='': next(answers))
    assert reset_password.main(['owner@example.com']) == 1
    answers2 = iter(['short', 'short'])
    monkeypatch.setattr(reset_password.getpass, 'getpass', lambda prompt='': next(answers2))
    assert reset_password.main(['owner@example.com']) == 1
    assert login(client, PASSWORD).status_code == 200


def test_mail_send_delivers_over_smtp(monkeypatch):
    """Runs the real SMTP code against a tiny local server (no encryption, no login)."""
    import socket
    import threading

    received = {}
    srv = socket.socket()
    srv.bind(('127.0.0.1', 0))
    srv.listen(1)

    def serve():
        conn, _ = srv.accept()
        f = conn.makefile('rwb')

        def reply(line):
            f.write(line.encode() + b'\r\n')
            f.flush()

        reply('220 test ready')
        data_mode, lines = False, []
        for raw in f:
            line = raw.decode().rstrip('\r\n')
            if data_mode:
                if line == '.':
                    data_mode = False
                    received['data'] = '\n'.join(lines)
                    reply('250 queued')
                else:
                    lines.append(line)
            elif line.upper().startswith(('EHLO', 'HELO')):
                reply('250 test')
            elif line.upper().startswith('MAIL FROM'):
                received['from'] = line
                reply('250 ok')
            elif line.upper().startswith('RCPT TO'):
                received['to'] = line
                reply('250 ok')
            elif line.upper() == 'DATA':
                data_mode = True
                reply('354 go on')
            elif line.upper() == 'QUIT':
                reply('221 bye')
                break
            else:
                reply('250 ok')
        conn.close()

    thread = threading.Thread(target=serve, daemon=True)
    thread.start()
    monkeypatch.setenv('SMTP_HOST', '127.0.0.1')
    monkeypatch.setenv('SMTP_PORT', str(srv.getsockname()[1]))
    monkeypatch.setenv('SMTP_SECURITY', 'none')
    monkeypatch.setenv('SMTP_FROM', 'studio@example.com')
    mail.send('owner@example.com', 'Reset your Social Studio password', 'Open this link: https://studio.example.com/?reset=abc')
    thread.join(5)
    srv.close()
    assert 'owner@example.com' in received['to'] and 'studio@example.com' in received['from']
    assert 'Subject: Reset your Social Studio password' in received['data']
    assert 'https://studio.example.com/?reset=abc' in received['data']
