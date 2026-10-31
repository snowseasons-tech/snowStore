-- Which member used which app, for central analytics. Runs on MariaDB and MySQL 8.
-- user_hash is a SHA-256 of the member id. Never store a raw member id, JWT or email here.
CREATE TABLE IF NOT EXISTS app_access_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_hash CHAR(64) NOT NULL,
    app_name VARCHAR(100) NOT NULL,
    action ENUM('view', 'download', 'update_check') NOT NULL DEFAULT 'view',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_app_time (app_name, created_at),
    INDEX idx_user_time (user_hash, created_at)
);
