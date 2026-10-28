"""Reset a user's password from the server, for when email isn't set up or the owner is locked out.

    docker compose exec web python -m app.reset_password you@example.com
    docker compose exec web python -m app.reset_password you@example.com --generate
"""
import argparse
import getpass
import secrets
import sys

from sqlalchemy import select

from .db import Session, User, init_db
from .passwords import MIN_LENGTH, set_password


def main(argv=None):
    ap = argparse.ArgumentParser(description='Set a new password for a Social Studio user.')
    ap.add_argument('email')
    ap.add_argument('--generate', action='store_true', help='create a random password and print it')
    args = ap.parse_args(argv)
    init_db()
    with Session() as db:
        user = db.scalar(select(User).where(User.email == args.email.strip().lower()))
        if not user:
            print(f'No account with the email {args.email}', file=sys.stderr)
            return 1
        if args.generate:
            password = secrets.token_urlsafe(15)
        else:
            password = getpass.getpass(f'New password for {user.email} ({MIN_LENGTH}+ characters): ')
            if password != getpass.getpass('Type it again: '):
                print('The passwords did not match. Nothing was changed.', file=sys.stderr)
                return 1
        try:
            set_password(db, user, password)
        except ValueError as e:
            print(f'{e}. Nothing was changed.', file=sys.stderr)
            return 1
    print(f'Password updated for {user.email}. They have been signed out everywhere.')
    if args.generate:
        print(f'New password: {password}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
