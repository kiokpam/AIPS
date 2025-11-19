"""add_member_password

Revision ID: 0009_add_member_password
Revises: 0008_add_member_permissions
Create Date: 2024-11-13 05:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0009_add_member_password'
down_revision = '0008_add_member_permissions'
branch_labels = None
depends_on = None


def upgrade():
    # Add member_password_hash to organizations
    op.add_column('organizations', sa.Column('member_password_hash', sa.String(), nullable=True))


def downgrade():
    op.drop_column('organizations', 'member_password_hash')

