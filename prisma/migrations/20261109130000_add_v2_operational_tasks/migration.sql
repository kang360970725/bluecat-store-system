-- CreateTable
CREATE TABLE `v2_operational_tasks` (
    `id` VARCHAR(191) NOT NULL,
    `batch_id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `target_key` VARCHAR(191) NOT NULL,
    `target_name` VARCHAR(191) NOT NULL,
    `title` VARCHAR(120) NOT NULL,
    `description` TEXT NOT NULL,
    `due_at` DATETIME(3) NOT NULL,
    `status` ENUM('PENDING', 'CLAIMED', 'SUBMITTED', 'DONE') NOT NULL DEFAULT 'PENDING',
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `claimer_id` VARCHAR(191) NULL,
    `claimer_name` VARCHAR(191) NULL,
    `claimed_at` DATETIME(3) NULL,
    `submission` TEXT NULL,
    `submitted_at` DATETIME(3) NULL,
    `reviewed_by` VARCHAR(191) NULL,
    `reviewed_at` DATETIME(3) NULL,

    INDEX `v2_operational_tasks_target_idx`(`store_id`, `target_key`, `due_at`),
    INDEX `v2_operational_tasks_created_at_idx`(`created_at`),
    UNIQUE INDEX `v2_operational_tasks_dispatch_key`(`created_by`, `batch_id`, `store_id`, `target_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `v2_operational_tasks` ADD CONSTRAINT `v2_operational_tasks_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `v2_stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

