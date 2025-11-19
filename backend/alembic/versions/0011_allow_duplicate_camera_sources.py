"""allow_duplicate_camera_sources

Revision ID: 0011_allow_duplicate_camera_sources
Revises: 0010_add_store_id_to_member_permissions
Create Date: 2025-11-18 00:00:00.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = "0011_allow_duplicate_camera_sources"
down_revision = "0010_add_store_id_to_member_permissions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop unique constraint on cameras.source to allow duplicate sources
    op.drop_constraint("cameras_source_key", "cameras", type_="unique")


def downgrade() -> None:
    # Reinstate unique constraint on cameras.source
    op.create_unique_constraint("cameras_source_key", "cameras", ["source"])

