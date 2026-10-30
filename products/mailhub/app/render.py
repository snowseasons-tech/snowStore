"""Turns a campaign into the email one recipient gets. Every email leaves here with an unsubscribe link and the sender's address."""
import html
import re
from email.utils import formataddr

MERGE = re.compile(r'\{\{\s*(\w+)\s*(?:\|([^}]*))?\}\}')
HREF = re.compile(r'''(<a\b[^>]*?\bhref\s*=\s*)(["'])(https?://[^"']+)\2''', re.I)
PIXEL = '<img src="{}" width="1" height="1" alt="" style="display:none">'


def links_in(body):
    """Web links the tracker should wrap. Links containing merge tags differ per person, so they stay as written."""
    return {html.unescape(m.group(3)) for m in HREF.finditer(body) if '{{' not in m.group(3)}


def merge(text, values, escape):
    def fill(m):
        value = values.get(m.group(1).lower())
        if value is None:
            return m.group(0)
        value = value or (m.group(2) or '').strip()
        return html.escape(value) if escape else value
    return MERGE.sub(fill, text)


def to_text(body):
    text = re.sub(r'<(style|script)\b.*?</\1>', '', body, flags=re.I | re.S)
    text = re.sub(r'''<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>(.*?)</a>''', r'\2 (\1)', text, flags=re.I | re.S)
    text = re.sub(r'<br\s*/?>|</(p|div|h[1-6]|li|tr)>', '\n', text, flags=re.I)
    text = html.unescape(re.sub(r'<[^>]+>', '', text))
    return re.sub(r'\n{3,}', '\n\n', re.sub(r'[ \t]+', ' ', text)).strip()


def build(campaign, settings, recipient, base_url, links=None, test=False):
    """Return the Resend payload. links maps URL to link id; a test send has no tracking and an inert unsubscribe."""
    base_url = base_url.rstrip('/')
    unsubscribe = f'{base_url}/u/test' if test else f'{base_url}/u/{recipient.token}'
    values = {'first_name': recipient.first_name, 'last_name': recipient.last_name, 'email': recipient.email, 'unsubscribe_url': unsubscribe}
    sender = settings.from_name or settings.from_email

    def track(m):
        link = (links or {}).get(html.unescape(m.group(3)))
        if not link:
            return m.group(0)
        return f'{m.group(1)}{m.group(2)}{base_url}/t/c/{recipient.token}/{link}{m.group(2)}'

    body = merge(HREF.sub(track, campaign.body_html), values, True)
    footer = ('<div style="margin-top:32px;font-size:12px;color:#666;font-family:Arial,sans-serif">'
              f'{html.escape(sender)}, {html.escape(settings.postal_address)}<br>'
              f'<a href="{unsubscribe}">Unsubscribe</a></div>')
    if not test:
        footer += PIXEL.format(f'{base_url}/t/o/{recipient.token}.gif')
    at = body.lower().rfind('</body>')
    full = body[:at] + footer + body[at:] if at >= 0 else body + footer
    text = to_text(merge(campaign.body_html, values, True))
    text += f'\n\n--\n{sender}, {settings.postal_address}\nUnsubscribe: {unsubscribe}\n'
    subject = ' '.join(merge(campaign.subject, values, False).split())
    payload = {
        'from': formataddr((settings.from_name, settings.from_email)),
        'to': [recipient.email],
        'subject': f'[Test] {subject}' if test else subject,
        'html': full,
        'text': text,
        'headers': {'List-Unsubscribe': f'<{unsubscribe}>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'},
    }
    if settings.reply_to:
        payload['reply_to'] = settings.reply_to
    return payload
