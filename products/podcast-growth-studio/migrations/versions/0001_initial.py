"""Original prototype schema. Existing installations may stamp 0001 after backup."""
from alembic import op
import sqlalchemy as sa
revision = "0001"
down_revision = None

def upgrade():
    op.create_table("episodes", sa.Column("id", sa.Integer, primary_key=True), sa.Column("title", sa.String(200), nullable=False), sa.Column("description", sa.Text, nullable=False), sa.Column("source_url", sa.Text, nullable=False), sa.Column("published_on", sa.Date), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_table("clips", sa.Column("id", sa.Integer, primary_key=True), sa.Column("episode_id", sa.Integer, sa.ForeignKey("episodes.id"), nullable=False), sa.Column("hook", sa.String(250), nullable=False), sa.Column("caption", sa.Text, nullable=False), sa.Column("platform", sa.String(32), nullable=False), sa.Column("status", sa.String(32), nullable=False), sa.Column("scheduled_for", sa.DateTime(timezone=True)), sa.Column("asset_url", sa.Text, nullable=False))
    op.create_table("metrics", sa.Column("id", sa.Integer, primary_key=True), sa.Column("recorded_on", sa.Date, nullable=False), sa.Column("platform", sa.String(32), nullable=False), sa.Column("plays", sa.Integer, nullable=False), sa.Column("followers", sa.Integer, nullable=False), sa.Column("engagement", sa.Integer, nullable=False))

def downgrade():
    op.drop_table("metrics")
    op.drop_table("clips")
    op.drop_table("episodes")
