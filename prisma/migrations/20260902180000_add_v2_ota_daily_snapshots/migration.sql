CREATE TABLE `v2_ota_daily_snapshots` (
  `id` VARCHAR(191) NOT NULL,
  `store_id` VARCHAR(191) NOT NULL,
  `business_date` DATE NOT NULL,
  `external_store_id` VARCHAR(64) NOT NULL,
  `external_store_name` VARCHAR(191) NULL,
  `total_amount` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `meituan_amount` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `douyin_amount` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `amap_amount` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `bar_amount` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `xmini_amount` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `self_service_amount` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `official_amount` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `captured_at` DATETIME(3) NOT NULL,
  `source_hash` VARCHAR(64) NOT NULL,
  `source_payload` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `v2_ota_daily_store_date_key`(`store_id`, `business_date`),
  INDEX `v2_ota_daily_snapshots_business_date_idx`(`business_date`),
  INDEX `v2_ota_daily_snapshots_external_store_id_business_date_idx`(`external_store_id`, `business_date`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `v2_ota_daily_snapshots`
  ADD CONSTRAINT `v2_ota_daily_snapshots_store_id_fkey`
  FOREIGN KEY (`store_id`) REFERENCES `v2_stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
