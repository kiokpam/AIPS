"""init tables stores and cameras

Revision ID: 0001
Revises: 
Create Date: 2025-10-14

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'stores',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('name', sa.String(), nullable=False),
    )
    op.create_table(
        'cameras',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('store_id', sa.String(), sa.ForeignKey('stores.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('rtsp_url', sa.String(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table('cameras')
    op.drop_table('stores')


