"""Server-side sessions and transactional audit history."""
from alembic import op
import sqlalchemy as sa
revision = "0002"
down_revision = "0001"

def upgrade():
    op.create_table("login_sessions", sa.Column("token_hash", sa.String(64), primary_key=True), sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False))
    op.create_table("audit_events", sa.Column("id", sa.Integer, primary_key=True), sa.Column("actor", sa.String(200), nullable=False), sa.Column("action", sa.String(100), nullable=False), sa.Column("entity_id", sa.Integer), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_clips_episode_id", "clips", ["episode_id"])
    op.create_index("ix_metrics_recorded_on", "metrics", ["recorded_on"])
    op.create_index("ix_login_sessions_expires_at", "login_sessions", ["expires_at"])

def downgrade():
    op.drop_index("ix_login_sessions_expires_at", "login_sessions")
    op.drop_index("ix_metrics_recorded_on", "metrics")
    op.drop_index("ix_clips_episode_id", "clips")
    op.drop_table("audit_events")
    op.drop_table("login_sessions")
