CREATE TABLE `v2_wecom_push_logs` (
  `id` VARCHAR(191) NOT NULL,
  `config_id` VARCHAR(191) NOT NULL,
  `report_type` VARCHAR(191) NOT NULL,
  `report_month` VARCHAR(191) NOT NULL,
  `store_ids` JSON NOT NULL,
  `snapshot` JSON NOT NULL,
  `status` VARCHAR(191) NOT NULL,
  `image_bytes` INTEGER NULL,
  `image_md5` VARCHAR(191) NULL,
  `error_message` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `sent_at` DATETIME(3) NULL,
  INDEX `v2_wecom_push_logs_config_id_created_at_idx` (`config_id`, `created_at`),
  INDEX `v2_wecom_push_logs_status_created_at_idx` (`status`, `created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `v2_wecom_push_logs` ADD CONSTRAINT `v2_wecom_push_logs_config_id_fkey` FOREIGN KEY (`config_id`) REFERENCES `v2_wecom_webhook_configs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
