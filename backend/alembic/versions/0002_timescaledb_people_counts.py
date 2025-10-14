"""add people_counts hypertable

Revision ID: 0002
Revises: 0001
Create Date: 2025-10-14

"""
from alembic import op
import sqlalchemy as sa


revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Ensure extension
    op.execute("CREATE EXTENSION IF NOT EXISTS timescaledb;")
    # Create table
    op.create_table(
        'people_counts',
        sa.Column('time', sa.DateTime(), primary_key=True),
        sa.Column('store_id', sa.String(), primary_key=True),
        sa.Column('zone_id', sa.String(), primary_key=True),
        sa.Column('value', sa.Integer(), nullable=False),
    )
    # Convert to hypertable (partition by time)
    op.execute("SELECT create_hypertable('people_counts', by_range('time'), if_not_exists => TRUE);")
    # Optional index
    op.execute("CREATE INDEX IF NOT EXISTS idx_people_counts_store_zone_time ON people_counts (store_id, zone_id, time DESC);")


def downgrade() -> None:
    op.drop_table('people_counts')


