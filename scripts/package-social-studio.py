#!/usr/bin/env python3
"""Build the customer ZIP from tracked sources, with reproducible metadata."""
import argparse
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import zipfile


ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'products/social-studio'
EXCLUDED = {'.git', '.pytest_cache', '__pycache__', 'node_modules', '.venv', 'venv'}
TOP_LEVEL = {
    '.env.example', 'Dockerfile', 'README.md', 'docker-compose.yml',
    'requirements.txt', 'requirements.lock', 'requirements-dev.txt',
}


def package(output):
    tracked = subprocess.check_output(
        ['git', 'ls-files', '-z', '--', 'products/social-studio/'], cwd=ROOT,
    ).decode().split('\0')
    paths = []
    for name in filter(None, tracked):
        path = ROOT / name
        relative = path.relative_to(SOURCE)
        if any(part in EXCLUDED for part in relative.parts):
            continue
        if path.name.startswith('.env') and relative.as_posix() != '.env.example':
            continue
        if path.suffix in {'.pyc', '.pyo', '.log'} or path.name == '.DS_Store':
            continue
        if relative.parts[0] not in {'app', 'static', 'tests'} and relative.as_posix() not in TOP_LEVEL:
            continue
        if path.is_symlink() or not path.is_file():
            raise ValueError(f'Expected a regular source file: {relative}')
        paths.append((path, relative))

    names = {relative.as_posix() for _, relative in paths}
    required = TOP_LEVEL | {'app/main.py', 'app/throttle.py', 'static/app.js',
                            'tests/test_login_throttle.py', 'tests/frontend.test.cjs'}
    if missing := required - names:
        raise ValueError(f'Missing tracked package files: {sorted(missing)}')

    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=output.parent, suffix='.zip', delete=False) as temporary:
        staging = Path(temporary.name)
    try:
        with zipfile.ZipFile(staging, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            for path, relative in sorted(paths, key=lambda entry: entry[1].as_posix()):
                entry = zipfile.ZipInfo('social-studio/' + relative.as_posix(), (1980, 1, 1, 0, 0, 0))
                entry.create_system = 3
                entry.external_attr = 0o100644 << 16
                archive.writestr(entry, path.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
        with zipfile.ZipFile(staging) as archive:
            if bad := archive.testzip():
                raise ValueError(f'Invalid archive entry: {bad}')
        backup = output.with_name(output.stem + '.orig.zip')
        if output.exists() and not backup.exists():
            shutil.copy2(output, backup)
        os.replace(staging, output)
    finally:
        staging.unlink(missing_ok=True)
    print(f'{output}: {len(paths)} files')
    print('sha256: ' + hashlib.sha256(output.read_bytes()).hexdigest())


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'products/social-studio.zip')
    package(parser.parse_args().output.resolve())
