"""Improve database schema with foreign keys, indexes, and new tables

Revision ID: 0005_improve_database_schema
Revises: 0004_add_advanced_camera_config
Create Date: 2024-01-15 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '0005_improve_database_schema'
down_revision = '0004_add_advanced_camera_config'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add unique constraints
    # Note: This might fail if duplicate data exists, handle with care
    try:
        op.create_unique_constraint('uq_stores_name', 'stores', ['name'])
    except Exception:
        # If duplicates exist, skip this constraint
        pass
    
    try:
        op.create_unique_constraint('uq_cameras_source', 'cameras', ['source'])
    except Exception:
        # If duplicates exist, skip this constraint
        pass
    
    # 2. Add foreign keys to people_counts (if table exists and is a hypertable)
    # First, check if people_counts exists and add foreign keys carefully
    op.execute("""
        DO $$
        BEGIN
            -- Add foreign key for store_id if it doesn't exist
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.table_constraints 
                WHERE constraint_name = 'people_counts_store_id_fkey'
            ) THEN
                ALTER TABLE people_counts 
                ADD CONSTRAINT people_counts_store_id_fkey 
                FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;
            END IF;
            
            -- Add foreign key for zone_id if it doesn't exist
            -- Use RESTRICT to prevent deletion of zones with historical data
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.table_constraints 
                WHERE constraint_name = 'people_counts_zone_id_fkey'
            ) THEN
                ALTER TABLE people_counts 
                ADD CONSTRAINT people_counts_zone_id_fkey 
                FOREIGN KEY (zone_id) REFERENCES counting_zones(id) ON DELETE RESTRICT;
            END IF;
        END $$;
    """)
    
    # 3. Add indexes on foreign keys for performance
    op.create_index('idx_cameras_store_id', 'cameras', ['store_id'], if_not_exists=True)
    op.create_index('idx_zones_camera_id', 'counting_zones', ['camera_id'], if_not_exists=True)
    op.create_index('idx_lines_camera_id', 'counting_lines', ['camera_id'], if_not_exists=True)
    
    # 4. Add composite indexes for common queries (filtering active zones/lines)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_zones_camera_active 
        ON counting_zones(camera_id, is_active) 
        WHERE is_active = TRUE;
    """)
    
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_lines_camera_active 
        ON counting_lines(camera_id, is_active) 
        WHERE is_active = TRUE;
    """)
    
    # 5. Create alerts table
    op.create_table('alerts',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('type', sa.String(), nullable=False),  # 'system' | 'anomaly'
        sa.Column('severity', sa.String(), nullable=False),  # 'low' | 'medium' | 'high'
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('store_id', sa.String(), nullable=True),
        sa.Column('camera_id', sa.String(), nullable=True),
        sa.Column('anomaly_type', sa.String(), nullable=True),  # 'fighting', 'theft', etc.
        sa.Column('confidence', sa.Float(), nullable=True),
        sa.Column('timestamp', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('acknowledged', sa.Boolean(), nullable=False, server_default='false'),
        sa.ForeignKeyConstraint(['store_id'], ['stores.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['camera_id'], ['cameras.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Add indexes for alerts table
    op.create_index('idx_alerts_store_time', 'alerts', ['store_id', 'timestamp'], if_not_exists=True)
    op.create_index('idx_alerts_camera_time', 'alerts', ['camera_id', 'timestamp'], if_not_exists=True)
    op.create_index('idx_alerts_acknowledged', 'alerts', ['acknowledged'], if_not_exists=True)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_alerts_unacknowledged 
        ON alerts(acknowledged, timestamp DESC) 
        WHERE acknowledged = FALSE;
    """)
    
    # 6. Create video_clips table
    op.create_table('video_clips',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('camera_id', sa.String(), nullable=False),
        sa.Column('store_id', sa.String(), nullable=False),
        sa.Column('file_path', sa.String(), nullable=False),
        sa.Column('start_time', sa.DateTime(), nullable=False),
        sa.Column('end_time', sa.DateTime(), nullable=False),
        sa.Column('anomaly_type', sa.String(), nullable=True),
        sa.Column('alert_id', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['camera_id'], ['cameras.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['store_id'], ['stores.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['alert_id'], ['alerts.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Add indexes for video_clips table
    op.create_index('idx_video_clips_camera', 'video_clips', ['camera_id', 'created_at'], if_not_exists=True)
    op.create_index('idx_video_clips_store', 'video_clips', ['store_id', 'created_at'], if_not_exists=True)
    op.create_index('idx_video_clips_alert', 'video_clips', ['alert_id'], if_not_exists=True)


def downgrade() -> None:
    # Drop video_clips table
    op.drop_table('video_clips')
    
    # Drop alerts table
    op.drop_table('alerts')
    
    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_lines_camera_active;")
    op.execute("DROP INDEX IF EXISTS idx_zones_camera_active;")
    op.drop_index('idx_lines_camera_id', table_name='counting_lines', if_exists=True)
    op.drop_index('idx_zones_camera_id', table_name='counting_zones', if_exists=True)
    op.drop_index('idx_cameras_store_id', table_name='cameras', if_exists=True)
    
    # Drop foreign keys from people_counts
    op.execute("""
        DO $$
        BEGIN
            ALTER TABLE people_counts DROP CONSTRAINT IF EXISTS people_counts_zone_id_fkey;
            ALTER TABLE people_counts DROP CONSTRAINT IF EXISTS people_counts_store_id_fkey;
        END $$;
    """)
    
    # Drop unique constraints
    op.drop_constraint('uq_cameras_source', 'cameras', type_='unique', if_exists=True)
    op.drop_constraint('uq_stores_name', 'stores', type_='unique', if_exists=True)

