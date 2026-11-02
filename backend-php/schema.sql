CREATE DATABASE IF NOT EXISTS milkDeliverymanagement CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE milkDeliverymanagement;

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin','delivery','customer') NOT NULL,
  area_id VARCHAR(64) NULL,
  -- App customer id from app_records.record_id (for example c_1791710244128). Not customers.id.
  customer_record_id VARCHAR(100) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_customer_record (customer_record_id)
) ENGINE=InnoDB;

-- Sign-in history. password_hash is the current hash, kept in step with users.password_hash.
CREATE TABLE IF NOT EXISTS login (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(64) NULL,
  role ENUM('admin','delivery','customer') NULL,
  password_hash VARCHAR(255) NULL,
  success TINYINT(1) NOT NULL DEFAULT 0,
  event ENUM('signin','password') NOT NULL DEFAULT 'signin',
  signed_in_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_login_user (user_id),
  INDEX idx_login_signed (signed_in_at),
  CONSTRAINT fk_login_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Delivery proof files. created_at is what the 30-day admin cleanup uses.
CREATE TABLE IF NOT EXISTS delivery_photos (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  delivery_id VARCHAR(100) NOT NULL,
  stored_name VARCHAR(190) NOT NULL,
  url VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_delivery_photos_created (created_at),
  INDEX idx_delivery_photos_delivery (delivery_id)
) ENGINE=InnoDB;

-- Customer skip requests. Default is every date is a delivery day; a row removes that stop.
CREATE TABLE IF NOT EXISTS skip_requests (
  id VARCHAR(64) PRIMARY KEY,
  customer_record_id VARCHAR(100) NOT NULL,
  skip_date DATE NOT NULL,
  reason VARCHAR(500) NOT NULL,
  seen TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_skip_customer_date (customer_record_id, skip_date),
  INDEX idx_skip_date (skip_date),
  INDEX idx_skip_unseen (seen, created_at)
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
