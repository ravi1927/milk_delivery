CREATE DATABASE IF NOT EXISTS milkDeliverymanagement CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE milkDeliverymanagement;

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin','delivery') NOT NULL,
  area_id VARCHAR(64) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS app_records (
  resource ENUM('areas','customers','deliveries','substitutions','leave_requests','bills') NOT NULL,
  record_id VARCHAR(100) NOT NULL,
  payload JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(resource, record_id),
  INDEX idx_resource_updated(resource, updated_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS api_sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_session_user(user_id),
  CONSTRAINT fk_session_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  bill_id VARCHAR(100) NOT NULL,
  message_id VARCHAR(190) NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  error_text TEXT NULL,
  payload JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wa_bill(bill_id),
  INDEX idx_wa_message(message_id)
) ENGINE=InnoDB;

-- Create the first admin password hash using:
-- php -r "echo password_hash('CHANGE_ME_NOW', PASSWORD_DEFAULT), PHP_EOL;"
-- Then insert: INSERT INTO users(id,name,email,password_hash,role) VALUES ('admin1','Admin User','admin@example.com','PASTE_HASH','admin');
