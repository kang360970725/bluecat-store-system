ALTER TABLE `v2_product_display_categories`
  ADD COLUMN `active` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `inactive_at` DATETIME(3) NULL;

CREATE INDEX `v2_product_display_categories_store_id_active_idx`
  ON `v2_product_display_categories`(`store_id`, `active`);
