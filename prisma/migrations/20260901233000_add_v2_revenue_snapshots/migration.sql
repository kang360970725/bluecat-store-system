CREATE TABLE `v2_revenue_snapshots` (
  `id` VARCHAR(191) NOT NULL,
  `store_id` VARCHAR(191) NOT NULL,
  `kind` ENUM('SETTLED_DAILY', 'LIVE_TODAY') NOT NULL,
  `business_date` DATE NOT NULL,
  `external_store_id` VARCHAR(64) NOT NULL,
  `external_store_name` VARCHAR(191) NULL,
  `subtotal` DECIMAL(14, 2) NULL,
  `net_fee_income` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  `product_sales` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  `rental` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  `tips` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  `voucher_sales` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  `equity_sales` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  `other_income` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  `other_expense` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  `other_net` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  `cash_amount` DECIMAL(14, 2) NULL,
  `online_amount` DECIMAL(14, 2) NULL,
  `captured_at` DATETIME(3) NOT NULL,
  `source_hash` VARCHAR(64) NOT NULL,
  `source_payload` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `v2_revenue_store_date_kind_key`(`store_id`, `business_date`, `kind`),
  INDEX `v2_revenue_snapshots_business_date_kind_idx`(`business_date`, `kind`),
  INDEX `v2_revenue_snapshots_external_store_id_business_date_idx`(`external_store_id`, `business_date`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `v2_revenue_snapshots`
  ADD CONSTRAINT `v2_revenue_snapshots_store_id_fkey`
  FOREIGN KEY (`store_id`) REFERENCES `v2_stores`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE `v2_shift_revenue_snapshots` (
  `id` VARCHAR(191) NOT NULL,
  `store_id` VARCHAR(191) NOT NULL,
  `store_shift_id` VARCHAR(191) NULL,
  `source_system` VARCHAR(64) NOT NULL DEFAULT 'X_MANAGER',
  `external_store_id` VARCHAR(64) NOT NULL,
  `external_store_name` VARCHAR(191) NULL,
  `external_shift_id` VARCHAR(64) NOT NULL,
  `business_date` DATE NOT NULL,
  `shift_started_at` DATETIME(3) NOT NULL,
  `shift_ended_at` DATETIME(3) NOT NULL,
  `handed_over_at` DATETIME(3) NOT NULL,
  `operator_label` VARCHAR(191) NULL,
  `terminal_label` VARCHAR(191) NULL,
  `total_income` DECIMAL(14, 2) NOT NULL,
  `net_fee_income` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  `product_sales` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  `rental` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  `other_net` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  `captured_at` DATETIME(3) NOT NULL,
  `source_hash` VARCHAR(64) NOT NULL,
  `source_payload` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `v2_shift_revenue_source_key`(`source_system`, `external_store_id`, `external_shift_id`),
  INDEX `v2_shift_revenue_snapshots_store_id_business_date_idx`(`store_id`, `business_date`),
  INDEX `v2_shift_revenue_snapshots_store_shift_id_business_date_idx`(`store_shift_id`, `business_date`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `v2_shift_revenue_snapshots`
  ADD CONSTRAINT `v2_shift_revenue_snapshots_store_id_fkey`
  FOREIGN KEY (`store_id`) REFERENCES `v2_stores`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `v2_shift_revenue_snapshots_store_shift_id_fkey`
  FOREIGN KEY (`store_shift_id`) REFERENCES `v2_store_shifts`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
