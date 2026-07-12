-- AlterTable
ALTER TABLE `store_performance_targets` ADD COLUMN `net_fee_target` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `product_target` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `split_status` ENUM('PENDING', 'ACTIVE') NOT NULL DEFAULT 'PENDING';

-- CreateTable
CREATE TABLE `work_shifts` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `start_time` VARCHAR(191) NULL,
    `end_time` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `work_shifts_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `employee_schedules` (
    `id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `employee_id` VARCHAR(191) NOT NULL,
    `shift_id` VARCHAR(191) NOT NULL,
    `work_date` DATE NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `employee_schedules_store_id_work_date_idx`(`store_id`, `work_date`),
    INDEX `employee_schedules_employee_id_idx`(`employee_id`),
    INDEX `employee_schedules_shift_id_idx`(`shift_id`),
    UNIQUE INDEX `employee_schedules_store_id_employee_id_shift_id_work_date_key`(`store_id`, `employee_id`, `shift_id`, `work_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `store_performance_split_plans` (
    `id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `target_id` VARCHAR(191) NOT NULL,
    `month` DATE NOT NULL,
    `net_fee_target` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `product_target` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `weekend_increase_rate` DECIMAL(5, 4) NOT NULL DEFAULT 0.15,
    `status` ENUM('PENDING', 'ACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `created_by` VARCHAR(191) NULL,
    `updated_by` VARCHAR(191) NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `store_performance_split_plans_target_id_key`(`target_id`),
    INDEX `store_performance_split_plans_month_idx`(`month`),
    UNIQUE INDEX `store_performance_split_plans_store_id_month_key`(`store_id`, `month`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `store_performance_split_items` (
    `id` VARCHAR(191) NOT NULL,
    `plan_id` VARCHAR(191) NOT NULL,
    `shift_id` VARCHAR(191) NOT NULL,
    `work_date` DATE NOT NULL,
    `net_fee_target` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `product_target` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `store_performance_split_items_work_date_idx`(`work_date`),
    INDEX `store_performance_split_items_shift_id_idx`(`shift_id`),
    UNIQUE INDEX `store_performance_split_items_plan_id_shift_id_work_date_key`(`plan_id`, `shift_id`, `work_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `store_performance_shift_actual_snapshots` (
    `id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `split_item_id` VARCHAR(191) NULL,
    `shift_id` VARCHAR(191) NOT NULL,
    `work_date` DATE NOT NULL,
    `net_fee_actual` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `product_actual` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `source` VARCHAR(191) NOT NULL DEFAULT 'realtime',
    `synced_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `store_performance_shift_actual_snapshots_work_date_idx`(`work_date`),
    INDEX `store_performance_shift_actual_snapshots_split_item_id_idx`(`split_item_id`),
    UNIQUE INDEX `store_performance_shift_actual_snapshots_store_id_shift_id_w_key`(`store_id`, `shift_id`, `work_date`, `source`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `employee_schedules` ADD CONSTRAINT `employee_schedules_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employee_schedules` ADD CONSTRAINT `employee_schedules_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employee_schedules` ADD CONSTRAINT `employee_schedules_shift_id_fkey` FOREIGN KEY (`shift_id`) REFERENCES `work_shifts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `store_performance_split_plans` ADD CONSTRAINT `store_performance_split_plans_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `store_performance_split_plans` ADD CONSTRAINT `store_performance_split_plans_target_id_fkey` FOREIGN KEY (`target_id`) REFERENCES `store_performance_targets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `store_performance_split_items` ADD CONSTRAINT `store_performance_split_items_plan_id_fkey` FOREIGN KEY (`plan_id`) REFERENCES `store_performance_split_plans`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `store_performance_split_items` ADD CONSTRAINT `store_performance_split_items_shift_id_fkey` FOREIGN KEY (`shift_id`) REFERENCES `work_shifts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `store_performance_shift_actual_snapshots` ADD CONSTRAINT `store_performance_shift_actual_snapshots_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `store_performance_shift_actual_snapshots` ADD CONSTRAINT `store_performance_shift_actual_snapshots_split_item_id_fkey` FOREIGN KEY (`split_item_id`) REFERENCES `store_performance_split_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `store_performance_shift_actual_snapshots` ADD CONSTRAINT `store_performance_shift_actual_snapshots_shift_id_fkey` FOREIGN KEY (`shift_id`) REFERENCES `work_shifts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
