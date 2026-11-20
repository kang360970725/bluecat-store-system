CREATE TABLE `v2_employee_leaves` (
  `id` VARCHAR(191) NOT NULL, `employee_id` VARCHAR(191) NOT NULL, `store_id` VARCHAR(191) NOT NULL,
  `type` ENUM('ANNUAL','SICK','PERSONAL','COMPENSATORY','OTHER') NOT NULL,
  `status` ENUM('PENDING','APPROVED','REJECTED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  `starts_at` DATETIME(3) NOT NULL, `ends_at` DATETIME(3) NOT NULL, `reason` TEXT NULL,
  `reviewed_at` DATETIME(3) NULL, `reviewed_by` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL,
  `created_by` VARCHAR(191) NULL, `updated_by` VARCHAR(191) NULL, `deleted_at` DATETIME(3) NULL,
  INDEX `v2_leave_employee_window` (`employee_id`,`starts_at`,`ends_at`),
  INDEX `v2_leave_store_status` (`store_id`,`status`,`starts_at`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `v2_store_operating_profiles` (
  `id` VARCHAR(191) NOT NULL, `store_id` VARCHAR(191) NOT NULL, `legal_entity_name` VARCHAR(191) NULL,
  `usable_area_sqm` DECIMAL(10,2) NULL, `seat_count` INTEGER NOT NULL DEFAULT 0,
  `lease_starts_on` DATE NULL, `lease_ends_on` DATE NULL, `notes` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL,
  `created_by` VARCHAR(191) NULL, `updated_by` VARCHAR(191) NULL,
  UNIQUE INDEX `v2_store_operating_profiles_store_id_key` (`store_id`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `v2_cost_item_templates` (
  `id` VARCHAR(191) NOT NULL, `name` VARCHAR(191) NOT NULL, `code` VARCHAR(191) NOT NULL, `category` VARCHAR(191) NOT NULL,
  `default_method` ENUM('FIXED','RATE','FORMULA','MANUAL') NOT NULL,
  `default_frequency` ENUM('MONTHLY','QUARTERLY','YEARLY','ONE_TIME') NOT NULL,
  `description` TEXT NULL, `sort` INTEGER NOT NULL DEFAULT 0, `enabled` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL,
  `created_by` VARCHAR(191) NULL, `updated_by` VARCHAR(191) NULL, `deleted_at` DATETIME(3) NULL,
  UNIQUE INDEX `v2_cost_item_templates_code_key` (`code`), INDEX `v2_cost_template_category` (`category`,`sort`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `v2_store_cost_configs` (
  `id` VARCHAR(191) NOT NULL, `store_id` VARCHAR(191) NOT NULL, `template_id` VARCHAR(191) NULL,
  `name` VARCHAR(191) NOT NULL, `code` VARCHAR(191) NOT NULL, `category` VARCHAR(191) NOT NULL,
  `method` ENUM('FIXED','RATE','FORMULA','MANUAL') NOT NULL,
  `frequency` ENUM('MONTHLY','QUARTERLY','YEARLY','ONE_TIME') NOT NULL,
  `fixed_amount` DECIMAL(14,2) NULL, `rate` DECIMAL(9,6) NULL, `formula` TEXT NULL,
  `effective_from` DATE NOT NULL, `effective_to` DATE NULL, `enabled` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL,
  `created_by` VARCHAR(191) NULL, `updated_by` VARCHAR(191) NULL, `deleted_at` DATETIME(3) NULL,
  INDEX `v2_cost_store_window` (`store_id`,`effective_from`,`effective_to`), INDEX `v2_store_cost_configs_template_id_idx` (`template_id`),
  UNIQUE INDEX `v2_cost_store_version` (`store_id`,`code`,`effective_from`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `v2_store_investments` (
  `id` VARCHAR(191) NOT NULL, `store_id` VARCHAR(191) NOT NULL,
  `type` ENUM('INITIAL','ADDITIONAL','RENOVATION','EQUIPMENT','OTHER') NOT NULL,
  `category` VARCHAR(191) NOT NULL, `name` VARCHAR(191) NOT NULL, `amount` DECIMAL(14,2) NOT NULL,
  `occurred_on` DATE NOT NULL, `description` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL,
  `created_by` VARCHAR(191) NULL, `updated_by` VARCHAR(191) NULL, `deleted_at` DATETIME(3) NULL,
  INDEX `v2_investment_store_date` (`store_id`,`occurred_on`,`type`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `v2_store_assets` (
  `id` VARCHAR(191) NOT NULL, `store_id` VARCHAR(191) NOT NULL, `asset_no` VARCHAR(191) NOT NULL,
  `category` VARCHAR(191) NOT NULL, `name` VARCHAR(191) NOT NULL, `brand` VARCHAR(191) NULL, `model` VARCHAR(191) NULL,
  `quantity` INTEGER NOT NULL DEFAULT 1, `purchase_price` DECIMAL(14,2) NULL, `purchased_on` DATE NULL,
  `expected_replacement_months` INTEGER NULL,
  `status` ENUM('ACTIVE','REPAIRING','RETIRED','DISPOSED') NOT NULL DEFAULT 'ACTIVE', `notes` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL,
  `created_by` VARCHAR(191) NULL, `updated_by` VARCHAR(191) NULL, `deleted_at` DATETIME(3) NULL,
  INDEX `v2_asset_store_category` (`store_id`,`category`,`status`),
  UNIQUE INDEX `v2_asset_store_no` (`store_id`,`asset_no`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `v2_employee_leaves` ADD CONSTRAINT `v2_employee_leaves_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `v2_employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `v2_employee_leaves` ADD CONSTRAINT `v2_employee_leaves_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `v2_stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `v2_store_operating_profiles` ADD CONSTRAINT `v2_store_operating_profiles_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `v2_stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `v2_store_cost_configs` ADD CONSTRAINT `v2_store_cost_configs_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `v2_stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `v2_store_cost_configs` ADD CONSTRAINT `v2_store_cost_configs_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `v2_cost_item_templates`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `v2_store_investments` ADD CONSTRAINT `v2_store_investments_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `v2_stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `v2_store_assets` ADD CONSTRAINT `v2_store_assets_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `v2_stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
