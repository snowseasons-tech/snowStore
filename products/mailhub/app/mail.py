"""Outgoing email over SMTP. Configure SMTP_* in .env; without SMTP_HOST, email is switched off."""
import logging
import os
import smtplib
import ssl
from email.message import EmailMessage

logger = logging.getLogger(__name__)


def enabled():
    return bool(os.getenv('SMTP_HOST') and os.getenv('SMTP_FROM'))


def send(to, subject, body):
    msg = EmailMessage()
    msg['From'], msg['To'], msg['Subject'] = os.environ['SMTP_FROM'], to, subject
    msg.set_content(body)
    host, port = os.environ['SMTP_HOST'], int(os.getenv('SMTP_PORT', '587'))
    security = os.getenv('SMTP_SECURITY', 'starttls').lower()
    context = ssl.create_default_context()
    if security == 'ssl':
        server = smtplib.SMTP_SSL(host, port, timeout=20, context=context)
    else:
        server = smtplib.SMTP(host, port, timeout=20)
    with server:
        if security == 'starttls':
            server.starttls(context=context)
        if os.getenv('SMTP_USERNAME'):
            server.login(os.environ['SMTP_USERNAME'], os.getenv('SMTP_PASSWORD', ''))
        server.send_message(msg)
