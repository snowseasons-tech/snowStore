"""Create local Compose configuration without printing secrets or replacing existing config."""
import os
from pathlib import Path
import secrets

root = Path(__file__).resolve().parents[1]
password = secrets.token_urlsafe(32)
database_password = secrets.token_urlsafe(32)
config = (root / '.env.example').read_text()
config = config.replace('APP_PASSWORD=\n', f'APP_PASSWORD={password}\n')
config = config.replace('POSTGRES_PASSWORD=\n', f'POSTGRES_PASSWORD={database_password}\n')
config = config.replace('REPLACE_WITH_DATABASE_PASSWORD', database_password)
try:
    descriptor = os.open(root / '.env', os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
except FileExistsError:
    raise SystemExit('Existing .env preserved. Edit it directly if configuration changes are needed.')
with os.fdopen(descriptor, 'w') as handle:
    handle.write(config)
print('Created .env with unique secrets. Sign in as admin using APP_PASSWORD from that file.')
print('Start the local app: docker compose up --build -d')
