-- CreateTable
CREATE TABLE `store_performance_targets` (
    `id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `month` DATE NOT NULL,
    `target_revenue` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `management_fee` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `rent` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `property_trash_fee` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `utilities` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `drink_material` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `meal_material` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `welfare` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `salary` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `franchise_fee` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `base_operation_software` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `store_operation` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `advertising_material` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `finance_tax` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `withdrawal_fee` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `created_by` VARCHAR(191) NULL,
    `updated_by` VARCHAR(191) NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `store_performance_targets_month_idx`(`month`),
    UNIQUE INDEX `store_performance_targets_store_id_month_key`(`store_id`, `month`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `store_performance_actual_snapshots` (
    `id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `month` DATE NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `source` VARCHAR(191) NOT NULL DEFAULT 'third_party',
    `synced_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `store_performance_actual_snapshots_month_idx`(`month`),
    UNIQUE INDEX `store_performance_actual_snapshots_store_id_month_source_key`(`store_id`, `month`, `source`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `store_performance_estimate_snapshots` (
    `id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `month` DATE NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `source` VARCHAR(191) NOT NULL DEFAULT 'split_plan',
    `synced_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `store_performance_estimate_snapshots_month_idx`(`month`),
    UNIQUE INDEX `store_performance_estimate_snapshots_store_id_month_source_key`(`store_id`, `month`, `source`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `store_performance_targets` ADD CONSTRAINT `store_performance_targets_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `store_performance_actual_snapshots` ADD CONSTRAINT `store_performance_actual_snapshots_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `store_performance_estimate_snapshots` ADD CONSTRAINT `store_performance_estimate_snapshots_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
