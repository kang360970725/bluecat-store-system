-- CreateTable
CREATE TABLE `v2_operational_task_extensions` (
    `id` VARCHAR(191) NOT NULL,
    `task_id` VARCHAR(191) NOT NULL,
    `pending_key` VARCHAR(191) NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `reason` TEXT NOT NULL,
    `requested_by` VARCHAR(191) NOT NULL,
    `previous_due_at` DATETIME(3) NOT NULL,
    `previous_claimer_id` VARCHAR(191) NULL,
    `previous_claimer_name` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `new_due_at` DATETIME(3) NULL,
    `reviewed_by` VARCHAR(191) NULL,
    `reviewed_at` DATETIME(3) NULL,
    `review_note` TEXT NULL,

    UNIQUE INDEX `v2_operational_task_extensions_pending_key_key`(`pending_key`),
    INDEX `v2_operational_task_extensions_task_id_created_at_idx`(`task_id`, `created_at`),
    INDEX `v2_operational_task_extensions_status_created_at_idx`(`status`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `v2_operational_task_extensions` ADD CONSTRAINT `v2_operational_task_extensions_task_id_fkey` FOREIGN KEY (`task_id`) REFERENCES `v2_operational_tasks`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

