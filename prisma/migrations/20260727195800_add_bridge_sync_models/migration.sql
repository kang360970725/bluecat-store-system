-- CreateTable
CREATE TABLE `store_external_mappings` (
    `id` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NOT NULL DEFAULT '54laoban',
    `external_store_id` VARCHAR(191) NOT NULL,
    `external_branch_id` VARCHAR(191) NULL,
    `external_name` VARCHAR(191) NULL,
    `store_id` VARCHAR(191) NULL,
    `match_status` ENUM('AUTO_MATCHED', 'MANUAL_MATCHED', 'UNMATCHED') NOT NULL DEFAULT 'UNMATCHED',
    `last_seen_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `store_external_mappings_store_id_idx`(`store_id`),
    UNIQUE INDEX `store_external_mappings_provider_external_store_id_key`(`provider`, `external_store_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `performance_sync_logs` (
    `id` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NOT NULL DEFAULT '54laoban',
    `sync_type` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `params_json` JSON NULL,
    `result_json` JSON NULL,
    `error_reason` TEXT NULL,
    `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finished_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `performance_sync_logs_provider_sync_type_started_at_idx`(`provider`, `sync_type`, `started_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `store_external_mappings` ADD CONSTRAINT `store_external_mappings_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
