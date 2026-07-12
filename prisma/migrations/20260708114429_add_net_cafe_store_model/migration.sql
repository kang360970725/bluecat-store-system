-- AlterTable
ALTER TABLE `stores` ADD COLUMN `latitude` DECIMAL(10, 6) NULL,
    ADD COLUMN `longitude` DECIMAL(10, 6) NULL,
    ADD COLUMN `machine_count` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `manager_employee_id` VARCHAR(191) NULL,
    ADD COLUMN `responsible_employee_id` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `employees` (
    `id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NULL,
    `employee_no` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `position` VARCHAR(191) NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `created_by` VARCHAR(191) NULL,
    `updated_by` VARCHAR(191) NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `employees_user_id_key`(`user_id`),
    UNIQUE INDEX `employees_employee_no_key`(`employee_no`),
    INDEX `employees_store_id_idx`(`store_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `store_areas` (
    `id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `level` ENUM('LOW', 'MID', 'HIGH') NOT NULL,
    `machine_count` INTEGER NOT NULL DEFAULT 0,
    `gpu_model` VARCHAR(191) NULL,
    `cpu_model` VARCHAR(191) NULL,
    `monitor_model` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `created_by` VARCHAR(191) NULL,
    `updated_by` VARCHAR(191) NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `store_areas_store_id_idx`(`store_id`),
    UNIQUE INDEX `store_areas_store_id_code_key`(`store_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `store_area_prices` (
    `id` VARCHAR(191) NOT NULL,
    `area_id` VARCHAR(191) NOT NULL,
    `tier` ENUM('TEMPORARY', 'NORMAL_MEMBER', 'BLUECAT_MEMBER', 'EXTRAORDINARY_MEMBER', 'APEX_MEMBER', 'PLATINUM_MEMBER', 'BLACK_GOLD_MEMBER', 'MYTHIC_MEMBER') NOT NULL,
    `price` DECIMAL(10, 2) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `created_by` VARCHAR(191) NULL,
    `updated_by` VARCHAR(191) NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `store_area_prices_area_id_idx`(`area_id`),
    UNIQUE INDEX `store_area_prices_area_id_tier_key`(`area_id`, `tier`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `stores_manager_employee_id_idx` ON `stores`(`manager_employee_id`);

-- CreateIndex
CREATE INDEX `stores_responsible_employee_id_idx` ON `stores`(`responsible_employee_id`);

-- AddForeignKey
ALTER TABLE `stores` ADD CONSTRAINT `stores_manager_employee_id_fkey` FOREIGN KEY (`manager_employee_id`) REFERENCES `employees`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stores` ADD CONSTRAINT `stores_responsible_employee_id_fkey` FOREIGN KEY (`responsible_employee_id`) REFERENCES `employees`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employees` ADD CONSTRAINT `employees_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employees` ADD CONSTRAINT `employees_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `store_areas` ADD CONSTRAINT `store_areas_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `store_area_prices` ADD CONSTRAINT `store_area_prices_area_id_fkey` FOREIGN KEY (`area_id`) REFERENCES `store_areas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
