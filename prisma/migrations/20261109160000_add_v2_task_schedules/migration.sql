-- AlterTable
ALTER TABLE `v2_operational_tasks` ADD COLUMN `schedule_id` VARCHAR(191) NULL,
    ADD COLUMN `scheduled_for` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `v2_operational_task_schedules` (
    `id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `target_key` VARCHAR(191) NOT NULL,
    `target_name` VARCHAR(191) NOT NULL,
    `title` VARCHAR(120) NOT NULL,
    `description` TEXT NOT NULL,
    `cadence` ENUM('DAILY', 'WEEKLY', 'MONTHLY') NOT NULL,
    `first_run_at` DATETIME(3) NOT NULL,
    `next_run_at` DATETIME(3) NOT NULL,
    `due_hours` INTEGER NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `pause_reason` VARCHAR(191) NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `scheduled_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `v2_operational_task_schedules_enabled_next_run_at_idx`(`enabled`, `next_run_at`),
    INDEX `v2_operational_task_schedules_store_id_created_at_idx`(`store_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `v2_operational_task_schedule_slot_key` ON `v2_operational_tasks`(`schedule_id`, `scheduled_for`);

-- AddForeignKey
ALTER TABLE `v2_operational_tasks` ADD CONSTRAINT `v2_operational_tasks_schedule_id_fkey` FOREIGN KEY (`schedule_id`) REFERENCES `v2_operational_task_schedules`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `v2_operational_task_schedules` ADD CONSTRAINT `v2_operational_task_schedules_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `v2_stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

