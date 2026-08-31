-- MTP2026 App Launcher — cross-device recent activity
-- TiDB Cloud MySQL compatible migration.

ALTER TABLE user_applications
  ADD COLUMN IF NOT EXISTS last_opened_at TIMESTAMP NULL;

ALTER TABLE user_applications
  ADD INDEX idx_user_applications_recent (user_id, last_opened_at);
