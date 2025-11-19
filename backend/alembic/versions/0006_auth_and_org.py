"""Add auth and organization schema

Revision ID: 0006_auth_and_org
Revises: 0005_improve_database_schema
Create Date: 2024-01-15 12:00:00

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0006_auth_and_org"
down_revision = "0005_improve_database_schema"
branch_labels = None
depends_on = None

membership_role_enum = sa.Enum("manager", "member", name="membershiprole")


def upgrade() -> None:
    op.create_table(
        "organizations",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
    )

    op.create_table(
        "users",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("email", sa.String(), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
    )

    op.create_table(
        "memberships",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("org_id", sa.String(), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", membership_role_enum, nullable=False, server_default="member"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
        sa.UniqueConstraint("user_id", "org_id", name="uq_memberships_user_org"),
    )

    # Stores
    op.add_column("stores", sa.Column("org_id", sa.String(), nullable=True))
    op.create_foreign_key("fk_stores_org", "stores", "organizations", ["org_id"], ["id"], ondelete="CASCADE")
    op.alter_column("stores", "org_id", nullable=False)

    # Cameras
    op.add_column("cameras", sa.Column("org_id", sa.String(), nullable=True))
    op.create_foreign_key("fk_cameras_org", "cameras", "organizations", ["org_id"], ["id"], ondelete="CASCADE")
    op.alter_column("cameras", "org_id", nullable=False)

    # Counting zones
    op.add_column("counting_zones", sa.Column("org_id", sa.String(), nullable=True))
    op.create_foreign_key("fk_zones_org", "counting_zones", "organizations", ["org_id"], ["id"], ondelete="CASCADE")
    op.alter_column("counting_zones", "org_id", nullable=False)

    # Counting lines
    op.add_column("counting_lines", sa.Column("org_id", sa.String(), nullable=True))
    op.create_foreign_key("fk_lines_org", "counting_lines", "organizations", ["org_id"], ["id"], ondelete="CASCADE")
    op.alter_column("counting_lines", "org_id", nullable=False)

    # Alerts
    op.add_column("alerts", sa.Column("org_id", sa.String(), nullable=True))
    op.create_foreign_key("fk_alerts_org", "alerts", "organizations", ["org_id"], ["id"], ondelete="CASCADE")
    op.alter_column("alerts", "org_id", nullable=False)

    # Video clips
    op.add_column("video_clips", sa.Column("org_id", sa.String(), nullable=True))
    op.create_foreign_key("fk_clips_org", "video_clips", "organizations", ["org_id"], ["id"], ondelete="CASCADE")
    op.alter_column("video_clips", "org_id", nullable=False)

    # People counts
    op.add_column("people_counts", sa.Column("org_id", sa.String(), nullable=True))
    op.create_foreign_key("fk_counts_org", "people_counts", "organizations", ["org_id"], ["id"], ondelete="CASCADE")
    op.alter_column("people_counts", "org_id", nullable=False)


def downgrade() -> None:
    op.drop_constraint("fk_counts_org", "people_counts", type_="foreignkey")
    op.drop_column("people_counts", "org_id")

    op.drop_constraint("fk_clips_org", "video_clips", type_="foreignkey")
    op.drop_column("video_clips", "org_id")

    op.drop_constraint("fk_alerts_org", "alerts", type_="foreignkey")
    op.drop_column("alerts", "org_id")

    op.drop_constraint("fk_lines_org", "counting_lines", type_="foreignkey")
    op.drop_column("counting_lines", "org_id")

    op.drop_constraint("fk_zones_org", "counting_zones", type_="foreignkey")
    op.drop_column("counting_zones", "org_id")

    op.drop_constraint("fk_cameras_org", "cameras", type_="foreignkey")
    op.drop_column("cameras", "org_id")

    op.drop_constraint("fk_stores_org", "stores", type_="foreignkey")
    op.drop_column("stores", "org_id")

    op.drop_table("memberships")
    op.drop_table("users")
    op.drop_table("organizations")

    membership_role_enum.drop(op.get_bind(), checkfirst=True)
