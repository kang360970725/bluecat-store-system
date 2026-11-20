CREATE TABLE `v2_organizations` (
  `id` VARCHAR(191) NOT NULL, `parent_id` VARCHAR(191) NULL,
  `type` ENUM('HEADQUARTERS','REGION','COMPANY') NOT NULL,
  `name` VARCHAR(191) NOT NULL, `code` VARCHAR(191) NOT NULL, `enabled` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL,
  `created_by` VARCHAR(191) NULL, `updated_by` VARCHAR(191) NULL, `deleted_at` DATETIME(3) NULL,
  UNIQUE INDEX `v2_organizations_code_key` (`code`), INDEX `v2_organizations_parent_id_idx` (`parent_id`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `v2_stores` (
  `id` VARCHAR(191) NOT NULL, `organization_id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL, `code` VARCHAR(191) NOT NULL,
  `status` ENUM('PREPARING','OPERATING','SUSPENDED','CLOSED') NOT NULL DEFAULT 'PREPARING',
  `opened_on` DATE NULL, `closed_on` DATE NULL, `business_day_starts_at` VARCHAR(5) NOT NULL DEFAULT '09:00',
  `address` VARCHAR(191) NULL, `phone` VARCHAR(191) NULL, `machine_count` INTEGER NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL,
  `created_by` VARCHAR(191) NULL, `updated_by` VARCHAR(191) NULL, `deleted_at` DATETIME(3) NULL,
  UNIQUE INDEX `v2_stores_code_key` (`code`), INDEX `v2_stores_organization_status` (`organization_id`,`status`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `v2_position_templates` (
  `id` VARCHAR(191) NOT NULL, `name` VARCHAR(191) NOT NULL, `code` VARCHAR(191) NOT NULL,
  `description` TEXT NULL, `sort` INTEGER NOT NULL DEFAULT 0, `enabled` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL,
  `created_by` VARCHAR(191) NULL, `updated_by` VARCHAR(191) NULL, `deleted_at` DATETIME(3) NULL,
  UNIQUE INDEX `v2_position_templates_code_key` (`code`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `v2_store_positions` (
  `id` VARCHAR(191) NOT NULL, `store_id` VARCHAR(191) NOT NULL, `template_id` VARCHAR(191) NULL,
  `source` ENUM('SYSTEM_TEMPLATE','STORE_CUSTOM') NOT NULL, `name` VARCHAR(191) NOT NULL, `code` VARCHAR(191) NOT NULL,
  `description` TEXT NULL, `sort` INTEGER NOT NULL DEFAULT 0, `enabled` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL,
  `created_by` VARCHAR(191) NULL, `updated_by` VARCHAR(191) NULL, `deleted_at` DATETIME(3) NULL,
  INDEX `v2_store_positions_template_id_idx` (`template_id`),
  UNIQUE INDEX `v2_store_position_code` (`store_id`,`code`), UNIQUE INDEX `v2_store_position_template` (`store_id`,`template_id`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `v2_employees` (
  `id` VARCHAR(191) NOT NULL, `employee_no` VARCHAR(191) NOT NULL, `name` VARCHAR(191) NOT NULL,
  `phone` VARCHAR(191) NULL, `id_number_masked` VARCHAR(191) NULL,
  `status` ENUM('PENDING','ACTIVE','LEAVE','TERMINATED') NOT NULL DEFAULT 'PENDING',
  `hired_on` DATE NULL, `terminated_on` DATE NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL,
  `created_by` VARCHAR(191) NULL, `updated_by` VARCHAR(191) NULL, `deleted_at` DATETIME(3) NULL,
  UNIQUE INDEX `v2_employees_employee_no_key` (`employee_no`), INDEX `v2_employees_status_idx` (`status`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `v2_employments` (
  `id` VARCHAR(191) NOT NULL, `employee_id` VARCHAR(191) NOT NULL, `store_id` VARCHAR(191) NOT NULL,
  `position_id` VARCHAR(191) NOT NULL, `started_on` DATE NOT NULL, `ended_on` DATE NULL,
  `is_primary` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL,
  `created_by` VARCHAR(191) NULL, `updated_by` VARCHAR(191) NULL, `deleted_at` DATETIME(3) NULL,
  INDEX `v2_employment_employee_window` (`employee_id`,`started_on`,`ended_on`),
  INDEX `v2_employment_store_position` (`store_id`,`position_id`,`ended_on`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `v2_employment_histories` (
  `id` VARCHAR(191) NOT NULL, `employee_id` VARCHAR(191) NOT NULL, `employment_id` VARCHAR(191) NULL,
  `change_type` ENUM('HIRED','TRANSFERRED','POSITION_CHANGED','STATUS_CHANGED','TERMINATED') NOT NULL,
  `effective_on` DATE NOT NULL, `before_data` JSON NULL, `after_data` JSON NULL, `reason` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `created_by` VARCHAR(191) NULL,
  INDEX `v2_employment_history_employee` (`employee_id`,`effective_on`),
  INDEX `v2_employment_histories_employment_id_idx` (`employment_id`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `v2_organizations` ADD CONSTRAINT `v2_organizations_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `v2_organizations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `v2_stores` ADD CONSTRAINT `v2_stores_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `v2_organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `v2_store_positions` ADD CONSTRAINT `v2_store_positions_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `v2_stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `v2_store_positions` ADD CONSTRAINT `v2_store_positions_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `v2_position_templates`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `v2_employments` ADD CONSTRAINT `v2_employments_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `v2_employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `v2_employments` ADD CONSTRAINT `v2_employments_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `v2_stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `v2_employments` ADD CONSTRAINT `v2_employments_position_id_fkey` FOREIGN KEY (`position_id`) REFERENCES `v2_store_positions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `v2_employment_histories` ADD CONSTRAINT `v2_employment_histories_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `v2_employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `v2_employment_histories` ADD CONSTRAINT `v2_employment_histories_employment_id_fkey` FOREIGN KEY (`employment_id`) REFERENCES `v2_employments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
