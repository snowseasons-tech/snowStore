#!/usr/bin/env python3
"""Scan product templates for secrets, personal info, owner details and junk files.

    python3 .claude/skills/sanitize-templates/scripts/scan.py [paths...] [--root DIR] [--term TEXT ...] [--json]

Paths can be files, folders or .zip deliverables (default: products/). Owner-specific terms are read at run
time, never stored in this file: values from <root>/.env and <root>/managed/ops.env, git user.name/email,
the home directory, the hostname, and the site name from SITE_URL. Matched secret values are masked in the
output. Exit code: 0 clean, 1 findings.
"""
import argparse, json, os, re, socket, subprocess, sys, zipfile
from pathlib import Path

JUNK_NAMES = {'__pycache__', 'node_modules', '.git', '.idea', '.vscode', '.wrangler',
              '.pytest_cache', '.mypy_cache', '.venv', 'venv', '.cache'}
JUNK_FILES = {'.DS_Store', 'Thumbs.db', 'desktop.ini'}
JUNK_SUFFIXES = ('.pyc', '.pyo', '.log', '.swp', '.swo', '.bak', '.orig', '.tmp', '~')
ENV_FILE = re.compile(r'^\.env(\..+)?$')
ENV_EXAMPLE = re.compile(r'\.(example|sample|template)$')
MAX_BYTES = 5 * 1024 * 1024

SECRET_PATTERNS = [
    ('Stripe secret/restricted key', r'\b(sk|rk)_(live|test)_[A-Za-z0-9]{10,}'),
    ('Stripe webhook secret', r'\bwhsec_[A-Za-z0-9]{10,}'),
    ('Stripe live publishable key', r'\bpk_live_[A-Za-z0-9]{10,}'),
    ('Resend API key', r'\bre_[A-Za-z0-9]{6,}_[A-Za-z0-9]{6,}'),
    ('AWS access key', r'\b(AKIA|ASIA)[0-9A-Z]{16}\b'),
    ('GitHub token', r'\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{30,}'),
    ('Google API key', r'\bAIza[0-9A-Za-z_-]{35}\b'),
    ('Slack token', r'\bxox[abposr]-[A-Za-z0-9-]{10,}'),
    ('OpenAI/Anthropic key', r'\bsk-(ant-|proj-)?[A-Za-z0-9_-]{20,}'),
    ('Private key block', r'-----BEGIN [A-Z ]*PRIVATE KEY-----'),
    ('JWT', r'\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'),
    ('Credentials in URL', r'[a-z][a-z0-9+.-]*://[^/\s:@"\']+:[^/\s@"\']+@[^\s"\']+'),
    ('Upstash/Redis URL', r'\b[a-z0-9-]+\.upstash\.io\b|\bredis(s)?://[^\s"\']+'),
    ('Hard-coded secret', r'(?i)\b(password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|auth)\w*["\']?\s*[:=]\s*["\'][^"\'\s]{6,}["\']'),
]
PERSONAL_PATTERNS = [
    ('Email address', r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b'),
    ('Phone number', r'(?<![\w.])(\+?1[\s.-]?)?\(?\b[2-9]\d{2}\)?[\s.-]\d{3}[\s.-]\d{4}\b'),
    ('Street address', r'\b\d{2,5}\s+[A-Z][a-z]+(\s[A-Z][a-z]+)*\s(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way)\b\.?'),
]
OWNER_PATTERNS = [
    ('Home directory path', r'(/home/|/Users/)[A-Za-z0-9._-]+|[A-Z]:\\Users\\[A-Za-z0-9._ -]+'),
    ('Private/LAN IP', r'\b(10\.\d{1,3}|192\.168|172\.(1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b'),
    ('R2/S3 endpoint', r'\b[a-z0-9]{32}\.r2\.cloudflarestorage\.com\b|\b[a-z0-9.-]+\.s3[.-][a-z0-9-]*\.?amazonaws\.com\b'),
    # Real Stripe IDs mix in digits (price_1Q2w...), which keeps names like price_difference out.
    ('Stripe object ID', r'\b(price|prod|cus|sub|pi|ch|in|acct|cs_live|cs_test|bps|evt)_(?=[A-Za-z]*\d)[A-Za-z0-9]{8,}'),
]
# Placeholder content that is fine to ship.
SAFE_EMAIL = re.compile(r'@(example\.(com|org|net)|[a-z0-9-]+\.(example|test|invalid|localhost)|localhost)$|^(you|name|user|hello|info|support|someone|test)@example', re.I)
SAFE_SECRET = re.compile(r'(?i)your|example|placeholder|changeme|change_me|xxx|\*\*\*|<[^>]+>|\$\{|process\.env|os\.environ|getenv|dummy|sample|test-?password|s3cret')
SAFE_PHONE = re.compile(r'555[\s.-]?\d{4}|\b555\b')


def run(cmd):
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=5).stdout.strip()
    except Exception:
        return ''


def read_env(path):
    out = {}
    try:
        for line in path.read_text(errors='ignore').splitlines():
            m = re.match(r'^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$', line)
            if m:
                out[m.group(1)] = m.group(2).strip().strip('"\'')
    except OSError:
        pass
    return out


def owner_terms(root, extra):
    """[(label, value, is_secret)] for exact-match search. Values are never printed."""
    terms = []
    env = {**read_env(root / '.env'), **read_env(root / 'managed' / 'ops.env')}
    for k, v in env.items():
        if len(v) >= 6 and not v.lower() in ('true', 'false', 'production'):
            secret = bool(re.search(r'KEY|SECRET|TOKEN|PASSWORD|PASS', k))
            terms.append((f'value of {k} from .env', v, secret))
            if k == 'SITE_URL':
                host = re.sub(r'^https?://', '', v).split('/')[0]
                name = host.split('.')[-2] if host.count('.') >= 1 else host
                if len(name) >= 5:
                    terms.append(('site/brand name (any domain)', name, False))
            if k == 'S3_ENDPOINT':
                terms.append(('storage endpoint host', re.sub(r'^https?://', '', v).split('/')[0], False))
    for label, cmd in (('git user.email', ['git', '-C', str(root), 'config', 'user.email']),
                       ('git user.name', ['git', '-C', str(root), 'config', 'user.name'])):
        v = run(cmd)
        if len(v) >= 4:
            terms.append((label, v, False))
    home = os.path.expanduser('~')
    if home not in ('/', '/root'):
        terms.append(('home directory', home, False))
    host = socket.gethostname()
    if len(host) >= 4 and host not in ('localhost',):
        terms.append(('machine hostname', host, False))
    for t in extra:
        terms.append((f'term "{t}"', t, False))
    # Longest first, so a full value is reported before the brand name inside it.
    return sorted({(l, v.lower(), s) for l, v, s in terms}, key=lambda t: -len(t[1]))


def mask(s):
    return s[:4] + '…' + f'({len(s)} chars)' if len(s) > 8 else '…'


def junk_reason(parts):
    for p in parts:
        if p in JUNK_NAMES:
            return f'{p}/ (cache, dependency or editor folder)'
    name = parts[-1]
    if name in JUNK_FILES:
        return 'OS metadata file'
    if ENV_FILE.match(name) and not ENV_EXAMPLE.search(name):
        return 'env file (may hold real secrets; never ship it)'
    if name.endswith(JUNK_SUFFIXES):
        return 'cache, log, backup or swap file'
    return None


def scan_text(where, text, terms, findings):
    for n, line in enumerate(text.splitlines(), 1):
        low = line.lower()
        hit_spans = []

        def add(cat, label, match, secret=False, span=None):
            if span and any(a <= span[0] < b for a, b in hit_spans):
                return
            if span:
                hit_spans.append(span)
            findings.append({'category': cat, 'kind': label, 'file': where, 'line': n,
                             'match': mask(match) if secret else match[:120], 'context': '' if secret else line.strip()[:160]})

        for label, value, secret in terms:
            i = low.find(value)
            while i != -1:
                add('secret' if secret else 'owner', f'Matches {label}', line[i:i + len(value)], secret, (i, i + len(value)))
                i = low.find(value, i + 1)
        for label, pat in SECRET_PATTERNS:
            for m in re.finditer(pat, line):
                if label in ('Hard-coded secret', 'Credentials in URL', 'Upstash/Redis URL') and SAFE_SECRET.search(m.group(0)):
                    continue
                add('secret', label, m.group(0), True, m.span())
        for label, pat in OWNER_PATTERNS:
            for m in re.finditer(pat, line):
                if label == 'Stripe object ID' and SAFE_SECRET.search(m.group(0)):
                    continue
                add('owner', label, m.group(0), False, m.span())
        for label, pat in PERSONAL_PATTERNS:
            for m in re.finditer(pat, line):
                v = m.group(0)
                if label == 'Email address' and SAFE_EMAIL.search(v):
                    continue
                if label == 'Phone number' and SAFE_PHONE.search(v):
                    continue
                add('personal', label, v, False, m.span())


def decode(data):
    if b'\0' in data[:8192]:
        return None
    return data.decode('utf-8', errors='ignore')


def scan_path(target, terms, findings):
    if target.is_file() and target.suffix.lower() == '.zip':
        with zipfile.ZipFile(target) as z:
            reported = set()
            for info in z.infolist():
                where = f'{target}!{info.filename}'
                parts = [p for p in info.filename.split('/') if p]
                if not parts:
                    continue
                reason = junk_reason(parts)
                if reason:
                    cut = next((i + 1 for i, part in enumerate(parts) if part in JUNK_NAMES), len(parts))
                    top = '/'.join(parts[:cut])
                    if top not in reported:
                        reported.add(top)
                        findings.append({'category': 'junk', 'kind': reason, 'file': f'{target}!{top}', 'line': 0, 'match': '', 'context': ''})
                    if cut < len(parts) or info.is_dir():
                        continue
                if not info.is_dir() and info.file_size <= MAX_BYTES:
                    text = decode(z.read(info))
                    if text is not None:
                        scan_text(where, text, terms, findings)
        return
    files = [target] if target.is_file() else sorted(p for p in target.rglob('*'))
    reported_dirs = set()
    for p in files:
        rel = p.relative_to(target.parent if target.is_file() else target)
        reason = junk_reason(rel.parts)
        if reason:
            top = next((Path(*rel.parts[:i + 1]) for i, part in enumerate(rel.parts) if part in JUNK_NAMES), rel)
            if top not in reported_dirs:
                reported_dirs.add(top)
                findings.append({'category': 'junk', 'kind': reason, 'file': str((target if target.is_dir() else target.parent) / top), 'line': 0, 'match': '', 'context': ''})
            if any(part in JUNK_NAMES for part in rel.parts) and not ENV_FILE.match(p.name):
                continue
        if not p.is_file() or p.stat().st_size > MAX_BYTES:
            continue
        text = decode(p.read_bytes())
        if text is not None:
            scan_text(str(p), text, terms, findings)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('paths', nargs='*', default=['products'])
    ap.add_argument('--root', default='.', help='repo root holding .env (default: current directory)')
    ap.add_argument('--term', action='append', default=[], help='extra owner term to flag (repeatable)')
    ap.add_argument('--json', action='store_true')
    a = ap.parse_args()
    root = Path(a.root).resolve()
    terms = owner_terms(root, a.term)
    findings = []
    for raw in a.paths:
        p = Path(raw)
        if not p.exists():
            print(f'missing: {raw}', file=sys.stderr)
            continue
        scan_path(p, terms, findings)
    # One row per file, line and kind; repeats on the same line become a count.
    merged = {}
    for f in findings:
        key = (f['file'], f['line'], f['kind'])
        if key in merged:
            merged[key]['count'] += 1
        else:
            merged[key] = {**f, 'count': 1}
    findings = list(merged.values())
    if a.json:
        print(json.dumps(findings, indent=1))
    else:
        order = ['secret', 'personal', 'owner', 'junk']
        print(f'{len(findings)} finding(s); owner terms checked: {", ".join(sorted({l for l, _, _ in terms})) or "none"}')
        for cat in order:
            items = [f for f in findings if f['category'] == cat]
            if not items:
                continue
            print(f'\n== {cat.upper()} ({len(items)})')
            for f in items:
                loc = f"{f['file']}:{f['line']}" if f['line'] else f['file']
                print(f"  {loc}  {f['kind']}" + (f"  [{f['match']}]" if f['match'] else '') + (f" x{f['count']}" if f['count'] > 1 else ''))
                if f['context']:
                    print(f"      {f['context']}")
    sys.exit(1 if findings else 0)


if __name__ == '__main__':
    main()
