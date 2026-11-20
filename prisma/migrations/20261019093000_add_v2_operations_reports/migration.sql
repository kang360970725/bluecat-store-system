CREATE TABLE `v2_operations_reports` (
  `id` VARCHAR(191) NOT NULL,
  `store_id` VARCHAR(191) NOT NULL,
  `report_type` VARCHAR(16) NOT NULL,
  `period_key` VARCHAR(16) NOT NULL,
  `period_start` DATE NOT NULL,
  `period_end` DATE NOT NULL,
  `status` VARCHAR(16) NOT NULL DEFAULT 'PARTIAL',
  `payload` JSON NOT NULL,
  `source_summary` JSON NULL,
  `error_reason` TEXT NULL,
  `attempt_count` INTEGER NOT NULL DEFAULT 1,
  `generated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `generated_by` VARCHAR(191) NULL,
  `resynced` BOOLEAN NOT NULL DEFAULT false,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `v2_operations_report_period_key` (`store_id`, `report_type`, `period_key`),
  INDEX `v2_operations_reports_report_type_period_start_status_idx` (`report_type`, `period_start`, `status`),
  CONSTRAINT `v2_operations_reports_store_id_fkey`
    FOREIGN KEY (`store_id`) REFERENCES `v2_stores` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
