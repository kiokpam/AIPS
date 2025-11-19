"""add_store_id_to_member_permissions

Revision ID: 0010_add_store_id_to_member_permissions
Revises: 0009_add_member_password
Create Date: 2024-01-20 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '0010_add_store_id_to_member_permissions'
down_revision = '0009_add_member_password'
branch_labels = None
depends_on = None


def upgrade():
    # Add store_id column to member_permissions
    op.add_column('member_permissions', sa.Column('store_id', sa.String(), nullable=True))
    
    # Create foreign key constraint
    op.create_foreign_key(
        'fk_member_permissions_store_id',
        'member_permissions',
        'stores',
        ['store_id'],
        ['id'],
        ondelete='CASCADE'
    )
    
    # Create index for store_id
    op.create_index(op.f('ix_member_permissions_store_id'), 'member_permissions', ['store_id'])
    
    # Add unique constraint for membership_id + store_id
    op.create_unique_constraint(
        'uq_member_permission_store',
        'member_permissions',
        ['membership_id', 'store_id']
    )


def downgrade():
    op.drop_constraint('uq_member_permission_store', 'member_permissions', type_='unique')
    op.drop_index(op.f('ix_member_permissions_store_id'), table_name='member_permissions')
    op.drop_constraint('fk_member_permissions_store_id', 'member_permissions', type_='foreignkey')
    op.drop_column('member_permissions', 'store_id')

