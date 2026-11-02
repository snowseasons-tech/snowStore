"""Prevent concurrent content edits and approvals from silently overwriting each other."""
from alembic import op
import sqlalchemy as sa
revision = "0003"
down_revision = "0002"

def upgrade():
    op.add_column("clips", sa.Column("version", sa.Integer, nullable=False, server_default="1"))

def downgrade():
    op.drop_column("clips", "version")
