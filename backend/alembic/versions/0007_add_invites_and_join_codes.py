"""add_invites_and_join_codes

Revision ID: 0007_add_invites_and_join_codes
Revises: 0006_auth_and_org
Create Date: 2024-01-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '0007_add_invites_and_join_codes'
down_revision = '0006_auth_and_org'
branch_labels = None
depends_on = None


def upgrade():
    # Add join_code to organizations
    op.add_column('organizations', sa.Column('join_code', sa.String(), nullable=True))
    op.create_index(op.f('ix_organizations_join_code'), 'organizations', ['join_code'], unique=True)

    # Create invites table
    op.create_table('invites',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('token', sa.String(), nullable=False),
        sa.Column('org_id', sa.String(), nullable=False),
        sa.Column('email', sa.String(), nullable=True),
        sa.Column('role', sa.Enum('manager', 'member', name='membershiprole'), nullable=False),
        sa.Column('created_by', sa.String(), nullable=True),
        sa.Column('expires_at', sa.DateTime(), nullable=True),
        sa.Column('used_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['org_id'], ['organizations.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_invites_token'), 'invites', ['token'], unique=True)


def downgrade():
    op.drop_index(op.f('ix_invites_token'), table_name='invites')
    op.drop_table('invites')
    op.drop_index(op.f('ix_organizations_join_code'), table_name='organizations')
    op.drop_column('organizations', 'join_code')

