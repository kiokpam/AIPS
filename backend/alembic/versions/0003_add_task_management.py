"""Add task management tables

Revision ID: 0003_add_task_management
Revises: 0002_timescaledb_people_counts
Create Date: 2024-01-15 10:30:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '0003_add_task_management'
down_revision = '0002_timescaledb_people_counts'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add new columns to cameras table
    op.add_column('cameras', sa.Column('ai_services', sa.JSON(), nullable=False, server_default='[]'))
    op.add_column('cameras', sa.Column('model_name', sa.String(), nullable=False, server_default='yolov8n.pt'))
    op.add_column('cameras', sa.Column('device', sa.String(), nullable=False, server_default='auto'))
    op.add_column('cameras', sa.Column('conf_thresh', sa.Float(), nullable=False, server_default='0.5'))
    op.add_column('cameras', sa.Column('skip_frame', sa.Integer(), nullable=False, server_default='3'))
    op.add_column('cameras', sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'))
    
    # Create counting_zones table
    op.create_table('counting_zones',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('camera_id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('polygon', sa.JSON(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.ForeignKeyConstraint(['camera_id'], ['cameras.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create counting_lines table
    op.create_table('counting_lines',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('camera_id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('p1', sa.JSON(), nullable=False),
        sa.Column('p2', sa.JSON(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.ForeignKeyConstraint(['camera_id'], ['cameras.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )


def downgrade() -> None:
    # Drop counting_lines table
    op.drop_table('counting_lines')
    
    # Drop counting_zones table
    op.drop_table('counting_zones')
    
    # Remove columns from cameras table
    op.drop_column('cameras', 'is_active')
    op.drop_column('cameras', 'skip_frame')
    op.drop_column('cameras', 'conf_thresh')
    op.drop_column('cameras', 'device')
    op.drop_column('cameras', 'model_name')
    op.drop_column('cameras', 'ai_services')
