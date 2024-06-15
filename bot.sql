CREATE TABLE IF NOT EXISTS `users` (
    `user_id` BIGINT PRIMARY KEY,
    `username` VARCHAR(255) NOT NULL,
    `score` INT DEFAULT 0,
    `register_date` DATETIME NOT NULL,
    `user_group` TINYINT DEFAULT 1,
    `expire_time` DATETIME DEFAULT NULL
);


CREATE TABLE IF NOT EXISTS `invites` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `user_id` BIGINT NOT NULL,
    `code` VARCHAR(255) NOT NULL,
    `invite_count` INT DEFAULT 0,
    UNIQUE KEY `unique_code` (`code`),
    FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS `invite_logs` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `inviter_id` BIGINT NOT NULL,
    `invited_id` BIGINT NOT NULL,
    `invite_date` DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`inviter_id`) REFERENCES `users`(`user_id`) ON DELETE CASCADE,
    FOREIGN KEY (`invited_id`) REFERENCES `users`(`user_id`) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS `user_checkins` (
    `user_id` BIGINT PRIMARY KEY,
    `last_checkin_time` DATETIME NOT NULL,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS `active_codes` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `code` VARCHAR(255) NOT NULL,
    `type` TINYINT NOT NULL,
    `points` INT DEFAULT 0,
    `expire_days` INT DEFAULT NULL,
    `used` TINYINT DEFAULT 0,
    UNIQUE KEY `unique_code` (`code`)
);
