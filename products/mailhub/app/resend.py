"""Calls to the Resend API. RESEND_BASE_URL exists so tests and local runs can point at a fake."""
import os

import httpx


class ResendError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.retryable = status is None or status == 429 or status >= 500
        self.bad_key = status in (401, 403)


def _call(method, path, key, json=None, headers=None):
    base = os.getenv('RESEND_BASE_URL', 'https://api.resend.com').rstrip('/')
    try:
        r = httpx.request(method, base + path, json=json, timeout=20, headers={'Authorization': f'Bearer {key}', **(headers or {})})
    except httpx.HTTPError as e:
        raise ResendError(None, f'Could not reach Resend: {e}') from e
    if r.status_code >= 400:
        try:
            message = r.json().get('message') or r.text
        except ValueError:
            message = r.text
        raise ResendError(r.status_code, f'Resend returned {r.status_code}: {message}'[:500])
    return r.json() if r.content else {}


def send(key, payload, idempotency_key=None):
    """Send one email and return Resend's id. The key makes a retry within 24 hours safe."""
    headers = {'Idempotency-Key': idempotency_key} if idempotency_key else None
    return _call('POST', '/emails', key, payload, headers)['id']


def create_domain(key, name):
    return _call('POST', '/domains', key, {'name': name})


def verify_domain(key, domain_id):
    _call('POST', f'/domains/{domain_id}/verify', key)


def get_domain(key, domain_id):
    return _call('GET', f'/domains/{domain_id}', key)
