"""Add advanced camera configuration

Revision ID: 0004_add_advanced_camera_config
Revises: 0003_add_task_management
Create Date: 2024-01-15 11:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '0004_add_advanced_camera_config'
down_revision = '0003_add_task_management'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add new columns to cameras table
    op.add_column('cameras', sa.Column('source', sa.String(), nullable=False, server_default=''))
    op.add_column('cameras', sa.Column('iou_thresh', sa.Float(), nullable=False, server_default='0.45'))
    op.add_column('cameras', sa.Column('max_det', sa.Integer(), nullable=False, server_default='300'))
    
    # Update existing rtsp_url to source
    op.execute("UPDATE cameras SET source = COALESCE(rtsp_url, '') WHERE source = ''")
    
    # Drop old rtsp_url column
    op.drop_column('cameras', 'rtsp_url')


def downgrade() -> None:
    # Add back rtsp_url column
    op.add_column('cameras', sa.Column('rtsp_url', sa.String(), nullable=True))
    
    # Copy source back to rtsp_url
    op.execute("UPDATE cameras SET rtsp_url = source WHERE rtsp_url IS NULL")
    
    # Remove new columns
    op.drop_column('cameras', 'max_det')
    op.drop_column('cameras', 'iou_thresh')
    op.drop_column('cameras', 'source')
