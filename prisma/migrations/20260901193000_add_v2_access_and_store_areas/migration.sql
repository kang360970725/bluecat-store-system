-- V2 account status and data-scope enums are stored as MySQL ENUMs by Prisma.
CREATE TABLE `v2_store_areas` (
  `id` VARCHAR(191) NOT NULL,
  `store_id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `code` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `sort` INTEGER NOT NULL DEFAULT 0,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `created_by` VARCHAR(191) NULL,
  `updated_by` VARCHAR(191) NULL,
  `deleted_at` DATETIME(3) NULL,
  UNIQUE INDEX `v2_store_areas_store_id_code_key`(`store_id`, `code`),
  INDEX `v2_store_areas_store_id_sort_idx`(`store_id`, `sort`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `v2_store_assets` ADD COLUMN `area_id` VARCHAR(191) NULL;
CREATE INDEX `v2_store_assets_area_id_idx` ON `v2_store_assets`(`area_id`);

CREATE TABLE `v2_accounts` (
  `id` VARCHAR(191) NOT NULL,
  `employee_id` VARCHAR(191) NULL,
  `username` VARCHAR(191) NOT NULL,
  `password_hash` VARCHAR(191) NOT NULL,
  `display_name` VARCHAR(191) NOT NULL,
  `status` ENUM('ACTIVE', 'LOCKED', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
  `data_scope` ENUM('ALL_STORES', 'ASSIGNED_STORES', 'EMPLOYEE_STORE') NOT NULL DEFAULT 'EMPLOYEE_STORE',
  `last_login_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `created_by` VARCHAR(191) NULL,
  `updated_by` VARCHAR(191) NULL,
  `deleted_at` DATETIME(3) NULL,
  UNIQUE INDEX `v2_accounts_employee_id_key`(`employee_id`),
  UNIQUE INDEX `v2_accounts_username_key`(`username`),
  INDEX `v2_accounts_status_idx`(`status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `v2_roles` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `code` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,
  UNIQUE INDEX `v2_roles_code_key`(`code`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `v2_permissions` (
  `id` VARCHAR(191) NOT NULL,
  `code` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `module` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `v2_permissions_code_key`(`code`),
  INDEX `v2_permissions_module_idx`(`module`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `v2_account_roles` (
  `account_id` VARCHAR(191) NOT NULL,
  `role_id` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `created_by` VARCHAR(191) NULL,
  INDEX `v2_account_roles_role_id_idx`(`role_id`),
  PRIMARY KEY (`account_id`, `role_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `v2_role_permissions` (
  `role_id` VARCHAR(191) NOT NULL,
  `permission_id` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `v2_role_permissions_permission_id_idx`(`permission_id`),
  PRIMARY KEY (`role_id`, `permission_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `v2_account_store_scopes` (
  `account_id` VARCHAR(191) NOT NULL,
  `store_id` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `created_by` VARCHAR(191) NULL,
  INDEX `v2_account_store_scopes_store_id_idx`(`store_id`),
  PRIMARY KEY (`account_id`, `store_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `v2_store_areas` ADD CONSTRAINT `v2_store_areas_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `v2_stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `v2_store_assets` ADD CONSTRAINT `v2_store_assets_area_id_fkey` FOREIGN KEY (`area_id`) REFERENCES `v2_store_areas`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `v2_accounts` ADD CONSTRAINT `v2_accounts_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `v2_employees`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `v2_account_roles` ADD CONSTRAINT `v2_account_roles_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `v2_accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `v2_account_roles` ADD CONSTRAINT `v2_account_roles_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `v2_roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `v2_role_permissions` ADD CONSTRAINT `v2_role_permissions_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `v2_roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `v2_role_permissions` ADD CONSTRAINT `v2_role_permissions_permission_id_fkey` FOREIGN KEY (`permission_id`) REFERENCES `v2_permissions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `v2_account_store_scopes` ADD CONSTRAINT `v2_account_store_scopes_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `v2_accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `v2_account_store_scopes` ADD CONSTRAINT `v2_account_store_scopes_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `v2_stores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
