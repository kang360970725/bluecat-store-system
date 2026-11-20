CREATE TABLE `v2_wecom_webhook_configs` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `webhook_encrypted` TEXT NOT NULL,
  `webhook_masked` VARCHAR(191) NOT NULL,
  `report_type` VARCHAR(191) NOT NULL DEFAULT 'ALL',
  `store_ids` JSON NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `last_tested_at` DATETIME(3) NULL,
  `last_test_status` VARCHAR(191) NULL,
  `last_test_message` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `created_by` VARCHAR(191) NULL,
  `updated_by` VARCHAR(191) NULL,
  `deleted_at` DATETIME(3) NULL,
  INDEX `v2_wecom_webhook_configs_enabled_deleted_at_idx` (`enabled`, `deleted_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
