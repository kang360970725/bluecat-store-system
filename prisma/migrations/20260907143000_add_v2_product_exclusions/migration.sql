CREATE TABLE `v2_product_display_categories` (
  `id` VARCHAR(191) NOT NULL, `store_id` VARCHAR(191) NOT NULL, `external_category_id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(191) NOT NULL, `excluded` BOOLEAN NOT NULL DEFAULT false, `captured_at` DATETIME(3) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `v2_product_category_source_key`(`store_id`, `external_category_id`),
  INDEX `v2_product_display_categories_store_id_excluded_idx`(`store_id`, `excluded`), PRIMARY KEY (`id`),
  CONSTRAINT `v2_product_display_categories_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `v2_stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `v2_product_exclusion_snapshots` (
  `id` VARCHAR(191) NOT NULL, `store_id` VARCHAR(191) NOT NULL, `shift_revenue_snapshot_id` VARCHAR(191) NULL,
  `business_date` DATE NOT NULL, `kind` VARCHAR(32) NOT NULL, `source_key` VARCHAR(128) NOT NULL,
  `excluded_amount` DECIMAL(14,2) NOT NULL DEFAULT 0, `category_ids` JSON NOT NULL, `captured_at` DATETIME(3) NOT NULL,
  `source_payload` JSON NULL, `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `v2_product_exclusion_snapshot_key`(`store_id`, `business_date`, `kind`, `source_key`),
  INDEX `v2_product_exclusion_snapshots_store_id_business_date_kind_idx`(`store_id`, `business_date`, `kind`),
  INDEX `v2_product_exclusion_snapshots_shift_revenue_snapshot_id_idx`(`shift_revenue_snapshot_id`), PRIMARY KEY (`id`),
  CONSTRAINT `v2_product_exclusion_snapshots_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `v2_stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `v2_product_exclusion_snapshots_shift_revenue_snapshot_id_fkey` FOREIGN KEY (`shift_revenue_snapshot_id`) REFERENCES `v2_shift_revenue_snapshots`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
