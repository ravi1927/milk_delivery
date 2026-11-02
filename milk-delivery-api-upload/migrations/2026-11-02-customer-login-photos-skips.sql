-- Milk delivery: customer logins, sign-in log, delivery photos, skip requests.
-- Apply once in phpMyAdmin (or the mysql client) on database milkDeliverymanagement.
-- Additive only: adds role value 'customer', one varchar column, and three tables.
-- Does not drop tables, does not delete rows, and does not touch a relational customers table.
-- customer_record_id stores app_records.record_id (varchar, for example c_1791710244128), not customers.id.
-- Safe to run again: each step checks information_schema before altering.

-- 1. Allow role 'customer' on the single users table.
ALTER TABLE users MODIFY COLUMN role ENUM('admin','delivery','customer') NOT NULL;

-- 2. Link a customer login to the app customer record id.
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'customer_record_id'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE users ADD COLUMN customer_record_id VARCHAR(100) NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = 'uq_users_customer_record'
);
SET @sql := IF(@idx_exists = 0,
  'ALTER TABLE users ADD UNIQUE KEY uq_users_customer_record (customer_record_id)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. Sign-ins (who, role, time, success/fail) plus the current password hash.
CREATE TABLE IF NOT EXISTS login (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(64) NULL,
  role ENUM('admin','delivery','customer') NULL,
  password_hash VARCHAR(255) NULL,
  success TINYINT(1) NOT NULL DEFAULT 0,
  event ENUM('signin','password') NOT NULL DEFAULT 'signin',
  signed_in_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_login_user (user_id),
  INDEX idx_login_signed (signed_in_at)
) ENGINE=InnoDB;

-- 4. Server-side delivery proof images. created_at drives the 30-day cleanup.
CREATE TABLE IF NOT EXISTS delivery_photos (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  delivery_id VARCHAR(100) NOT NULL,
  stored_name VARCHAR(190) NOT NULL,
  url VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_delivery_photos_created (created_at),
  INDEX idx_delivery_photos_delivery (delivery_id)
) ENGINE=InnoDB;

-- 5. Customer skip requests. Admin marks seen=1 after the alert. The row still hides that stop.
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
