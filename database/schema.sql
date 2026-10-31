-- ============================================================
-- Rakshak Portal - database schema
-- Works on MySQL 8.x and MariaDB 10.5+.
-- Safe to run repeatedly (every statement is IF NOT EXISTS).
-- The database itself must already exist (or be created by
-- `npm run db:init`, which will try to create it for you).
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username    VARCHAR(30)  NOT NULL,
  email       VARCHAR(254) NOT NULL,
  password    VARCHAR(100) NOT NULL,              -- bcrypt hash, never plain text
  full_name   VARCHAR(100) NOT NULL,
  mobile      VARCHAR(20)  NOT NULL,
  role        ENUM('citizen','officer','admin') NOT NULL DEFAULT 'citizen',
  is_active   TINYINT(1)   NOT NULL DEFAULT 1,
  last_login  TIMESTAMP    NULL DEFAULT NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS firs (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  fir_number         VARCHAR(30)  NOT NULL,
  user_id            INT UNSIGNED NOT NULL,
  complainant_name   VARCHAR(100) NOT NULL,
  mobile             VARCHAR(20)  NOT NULL,
  email              VARCHAR(254) NULL,
  address            VARCHAR(500) NOT NULL,
  crime_type         VARCHAR(30)  NOT NULL,
  incident_details   TEXT         NOT NULL,
  incident_date      DATE         NOT NULL,
  location           VARCHAR(255) NOT NULL,
  status             ENUM('Pending','Active','Closed') NOT NULL DEFAULT 'Pending',
  notes              TEXT         NULL,             -- internal officer notes (hidden from citizens)
  assigned_officer   INT UNSIGNED NULL,
  created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_firs_number (fir_number),
  KEY idx_firs_user (user_id),
  KEY idx_firs_status (status),
  KEY idx_firs_created (created_at),
  CONSTRAINT fk_firs_user    FOREIGN KEY (user_id)          REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_firs_officer FOREIGN KEY (assigned_officer) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS case_updates (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  fir_id       INT UNSIGNED NOT NULL,
  updated_by   INT UNSIGNED NULL,
  update_type  VARCHAR(50)  NOT NULL,
  description  VARCHAR(500) NOT NULL,
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_case_updates_fir (fir_id),
  CONSTRAINT fk_case_updates_fir  FOREIGN KEY (fir_id)     REFERENCES firs (id)  ON DELETE CASCADE,
  CONSTRAINT fk_case_updates_user FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS complaints (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  complaint_number  VARCHAR(30)  NOT NULL,
  user_id           INT UNSIGNED NOT NULL,
  complainant_name  VARCHAR(100) NOT NULL,
  contact           VARCHAR(20)  NOT NULL,
  complaint_type    VARCHAR(30)  NOT NULL,
  details           TEXT         NOT NULL,
  status            ENUM('Pending','Active','Closed') NOT NULL DEFAULT 'Pending',
  resolution        TEXT         NULL,
  created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_complaints_number (complaint_number),
  KEY idx_complaints_user (user_id),
  KEY idx_complaints_status (status),
  KEY idx_complaints_created (created_at),
  CONSTRAINT fk_complaints_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS emergency_alerts (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  alert_number  VARCHAR(30)  NOT NULL,
  user_id       INT UNSIGNED NOT NULL,
  latitude      DECIMAL(10,7) NULL,
  longitude     DECIMAL(10,7) NULL,
  details       VARCHAR(1000) NULL,
  status        ENUM('Active','Resolved') NOT NULL DEFAULT 'Active',
  resolved_by   INT UNSIGNED NULL,
  resolved_at   TIMESTAMP    NULL DEFAULT NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_alerts_number (alert_number),
  KEY idx_alerts_status (status),
  KEY idx_alerts_created (created_at),
  CONSTRAINT fk_alerts_user     FOREIGN KEY (user_id)     REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_alerts_resolver FOREIGN KEY (resolved_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NOT NULL,
  type        VARCHAR(50)  NOT NULL,
  message     VARCHAR(500) NOT NULL,
  is_read     TINYINT(1)   NOT NULL DEFAULT 0,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notifications_user (user_id, created_at),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NULL,
  action      VARCHAR(50)  NOT NULL,
  details     VARCHAR(1000) NULL,
  ip_address  VARCHAR(45)  NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_user (user_id),
  KEY idx_audit_action (action),
  KEY idx_audit_created (created_at),
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
