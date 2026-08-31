-- MTP2026 App Launcher — TiDB Cloud MySQL schema
-- Canonical persistent schema for the application launcher.

CREATE TABLE IF NOT EXISTS mtp_users (
  id CHAR(36) NOT NULL,
  vexa_account_subject VARCHAR(255) NOT NULL,
  profile_id VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_mtp_users_subject (vexa_account_subject)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS applications (
  id CHAR(36) NOT NULL,
  canonical_url VARCHAR(2048) NOT NULL,
  title VARCHAR(160) NOT NULL,
  description VARCHAR(1000) NULL,
  icon_url VARCHAR(2048) NULL,
  manifest_url VARCHAR(2048) NULL,
  theme_color VARCHAR(32) NULL,
  pwa_supported BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_applications_url (canonical_url(768)),
  KEY idx_applications_title (title)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_applications (
  user_id CHAR(36) NOT NULL,
  application_id CHAR(36) NOT NULL,
  category VARCHAR(100) NOT NULL DEFAULT 'Web',
  is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INT NOT NULL DEFAULT 0,
  last_opened_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, application_id),
  KEY idx_user_applications_user_order (user_id, is_pinned, is_favorite, sort_order),
  KEY idx_user_applications_recent (user_id, last_opened_at),
  CONSTRAINT fk_user_applications_user FOREIGN KEY (user_id) REFERENCES mtp_users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_applications_application FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Safe upgrade for existing installations.
ALTER TABLE user_applications ADD COLUMN IF NOT EXISTS last_opened_at TIMESTAMP NULL DEFAULT NULL;
ALTER TABLE user_applications ADD INDEX IF NOT EXISTS idx_user_applications_recent (user_id, last_opened_at);
