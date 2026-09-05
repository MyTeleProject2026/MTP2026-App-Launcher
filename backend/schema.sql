CREATE TABLE IF NOT EXISTS mtp_users (
  id CHAR(36) NOT NULL PRIMARY KEY,
  vexa_account_subject VARCHAR(191) NOT NULL UNIQUE,
  profile_id VARCHAR(191) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS applications (
  id CHAR(36) NOT NULL PRIMARY KEY,
  canonical_url VARCHAR(2048) NOT NULL UNIQUE,
  title VARCHAR(160) NOT NULL,
  description VARCHAR(500) NULL,
  icon_url VARCHAR(2048) NULL,
  manifest_url VARCHAR(2048) NULL,
  theme_color VARCHAR(64) NULL,
  pwa_supported TINYINT(1) NOT NULL DEFAULT 0,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_applications_title (title)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_applications (
  user_id CHAR(36) NOT NULL,
  application_id CHAR(36) NOT NULL,
  category VARCHAR(80) NOT NULL DEFAULT 'Web',
  is_favorite TINYINT(1) NOT NULL DEFAULT 0,
  is_pinned TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  last_opened_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, application_id),
  INDEX idx_user_apps_order (user_id, is_pinned, is_favorite, sort_order),
  INDEX idx_user_apps_recent (user_id, last_opened_at),
  CONSTRAINT fk_user_apps_user FOREIGN KEY (user_id) REFERENCES mtp_users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_apps_app FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mtp_sso_sessions (
  id VARCHAR(128) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  vexa_subject VARCHAR(255) NOT NULL,
  profile_json JSON NOT NULL,
  access_token_enc TEXT NOT NULL,
  refresh_token_enc TEXT NULL,
  access_expires_at DATETIME NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_mtp_sso_sessions_subject (vexa_subject),
  INDEX idx_mtp_sso_sessions_expires (expires_at),
  CONSTRAINT fk_mtp_sso_sessions_user FOREIGN KEY (user_id) REFERENCES mtp_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mtp_sso_login_transactions (
  state VARCHAR(128) PRIMARY KEY,
  verifier VARCHAR(128) NOT NULL,
  challenge VARCHAR(128) NOT NULL,
  created_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  INDEX idx_mtp_login_transactions_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE user_applications ADD COLUMN IF NOT EXISTS last_opened_at TIMESTAMP NULL DEFAULT NULL;
ALTER TABLE user_applications ADD INDEX IF NOT EXISTS idx_user_apps_recent (user_id, last_opened_at);
