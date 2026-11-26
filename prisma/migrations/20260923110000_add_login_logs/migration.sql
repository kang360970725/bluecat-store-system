CREATE TABLE `login_logs` (
  `id` VARCHAR(191) NOT NULL,
  `account_type` VARCHAR(191) NOT NULL,
  `account_id` VARCHAR(191) NOT NULL,
  `username` VARCHAR(191) NOT NULL,
  `display_name` VARCHAR(191) NOT NULL,
  `ip_address` VARCHAR(191) NULL,
  `user_agent` TEXT NULL,
  `logged_in_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `login_logs_account_type_account_id_logged_in_at_idx`(`account_type`, `account_id`, `logged_in_at`),
  INDEX `login_logs_logged_in_at_idx`(`logged_in_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
