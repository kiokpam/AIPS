"""add_member_permissions

Revision ID: 0008_add_member_permissions
Revises: 0007_add_invites_and_join_codes
Create Date: 2024-01-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '0008_add_member_permissions'
down_revision = '0007_add_invites_and_join_codes'
branch_labels = None
depends_on = None


def upgrade():
    # Create member_permissions table
    op.create_table('member_permissions',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('membership_id', sa.String(), nullable=False),
        sa.Column('camera_id', sa.String(), nullable=True),  # NULL means dashboard access
        sa.Column('can_view', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['membership_id'], ['memberships.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['camera_id'], ['cameras.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('membership_id', 'camera_id', name='uq_member_permission_camera')
    )
    op.create_index(op.f('ix_member_permissions_membership_id'), 'member_permissions', ['membership_id'])
    op.create_index(op.f('ix_member_permissions_camera_id'), 'member_permissions', ['camera_id'])


def downgrade():
    op.drop_index(op.f('ix_member_permissions_camera_id'), table_name='member_permissions')
    op.drop_index(op.f('ix_member_permissions_membership_id'), table_name='member_permissions')
    op.drop_table('member_permissions')

