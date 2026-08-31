-- MTP2026 App Launcher — cross-device recent activity
-- TiDB Cloud MySQL compatible migration.

ALTER TABLE user_applications
  ADD COLUMN IF NOT EXISTS last_opened_at TIMESTAMP NULL;

CREATE INDEX IF NOT EXISTS idx_user_applications_recent
  ON user_applications (user_id, last_opened_at);
