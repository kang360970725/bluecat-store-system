CREATE TABLE `v2_ota_products` (
  `id` VARCHAR(191) NOT NULL, `store_id` VARCHAR(191) NOT NULL,
  `platform` VARCHAR(32) NOT NULL, `external_product_id` VARCHAR(128) NOT NULL,
  `name` VARCHAR(191) NOT NULL, `amount` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `status` VARCHAR(64) NULL, `is_brush` BOOLEAN NOT NULL DEFAULT false,
  `source_payload` JSON NULL, `captured_at` DATETIME(3) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `v2_ota_product_source_key`(`store_id`,`platform`,`external_product_id`),
  INDEX `v2_ota_products_store_id_is_brush_idx`(`store_id`,`is_brush`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `v2_ota_redemptions` (
  `id` VARCHAR(191) NOT NULL, `store_id` VARCHAR(191) NOT NULL, `product_id` VARCHAR(191) NULL,
  `store_shift_id` VARCHAR(191) NULL, `external_store_id` VARCHAR(64) NOT NULL,
  `external_order_id` VARCHAR(128) NOT NULL, `external_product_id` VARCHAR(128) NOT NULL,
  `platform` VARCHAR(32) NOT NULL, `product_name` VARCHAR(191) NOT NULL,
  `business_date` DATE NOT NULL, `operated_at` DATETIME(3) NOT NULL,
  `operator_label` VARCHAR(191) NULL, `use_source` VARCHAR(64) NULL, `status` VARCHAR(64) NULL,
  `amount` DECIMAL(14,2) NOT NULL DEFAULT 0, `source_hash` VARCHAR(64) NOT NULL,
  `source_payload` JSON NULL, `captured_at` DATETIME(3) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `v2_ota_redemption_source_key`(`external_store_id`,`external_order_id`),
  INDEX `v2_ota_redemptions_store_id_business_date_idx`(`store_id`,`business_date`),
  INDEX `v2_ota_redemptions_store_shift_id_business_date_idx`(`store_shift_id`,`business_date`),
  INDEX `v2_ota_redemptions_product_id_business_date_idx`(`product_id`,`business_date`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `v2_ota_products` ADD CONSTRAINT `v2_ota_products_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `v2_stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `v2_ota_redemptions` ADD CONSTRAINT `v2_ota_redemptions_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `v2_stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `v2_ota_redemptions` ADD CONSTRAINT `v2_ota_redemptions_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `v2_ota_products`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `v2_ota_redemptions` ADD CONSTRAINT `v2_ota_redemptions_store_shift_id_fkey` FOREIGN KEY (`store_shift_id`) REFERENCES `v2_store_shifts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
