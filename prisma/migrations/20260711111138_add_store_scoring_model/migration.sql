-- CreateTable
CREATE TABLE `score_items` (
    `id` VARCHAR(191) NOT NULL,
    `category_code` VARCHAR(191) NOT NULL,
    `category_name` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `formula_note` VARCHAR(191) NULL,
    `max_score` DECIMAL(10, 2) NULL,
    `min_score` DECIMAL(10, 2) NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `created_by` VARCHAR(191) NULL,
    `updated_by` VARCHAR(191) NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `score_items_code_key`(`code`),
    INDEX `score_items_category_code_idx`(`category_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `store_score_entries` (
    `id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `item_id` VARCHAR(191) NOT NULL,
    `month` DATE NOT NULL,
    `raw_value` DECIMAL(12, 2) NULL,
    `score` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `remark` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `created_by` VARCHAR(191) NULL,
    `updated_by` VARCHAR(191) NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `store_score_entries_month_idx`(`month`),
    INDEX `store_score_entries_item_id_idx`(`item_id`),
    UNIQUE INDEX `store_score_entries_store_id_item_id_month_key`(`store_id`, `item_id`, `month`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `store_score_entries` ADD CONSTRAINT `store_score_entries_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `store_score_entries` ADD CONSTRAINT `store_score_entries_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `score_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
