-- DropForeignKey
ALTER TABLE `v2_attendance_punches` DROP FOREIGN KEY `v2_attendance_punches_assignment_id_fkey`;

-- DropIndex
DROP INDEX `v2_attendance_punches_assignment_id_key` ON `v2_attendance_punches`;

-- AlterTable
ALTER TABLE `v2_attendance_punches` ADD COLUMN `kind` ENUM('IN', 'OUT') NOT NULL DEFAULT 'IN',
    MODIFY `terminal_id` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `v2_attendance_corrections` (
    `id` VARCHAR(191) NOT NULL,
    `assignment_id` VARCHAR(191) NOT NULL,
    `kind` ENUM('IN', 'OUT') NOT NULL,
    `pending_key` VARCHAR(191) NULL,
    `requested_time` DATETIME(3) NOT NULL,
    `reason` TEXT NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `reviewed_at` DATETIME(3) NULL,
    `reviewed_by` VARCHAR(191) NULL,
    `review_note` TEXT NULL,

    UNIQUE INDEX `v2_attendance_corrections_pending_key_key`(`pending_key`),
    INDEX `v2_attendance_corrections_assignment_id_kind_created_at_idx`(`assignment_id`, `kind`, `created_at`),
    INDEX `v2_attendance_corrections_status_created_at_idx`(`status`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `v2_attendance_punch_assignment_kind_key` ON `v2_attendance_punches`(`assignment_id`, `kind`);

-- AddForeignKey
ALTER TABLE `v2_attendance_punches` ADD CONSTRAINT `v2_attendance_punches_assignment_id_fkey` FOREIGN KEY (`assignment_id`) REFERENCES `v2_schedule_assignments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `v2_attendance_corrections` ADD CONSTRAINT `v2_attendance_corrections_assignment_id_fkey` FOREIGN KEY (`assignment_id`) REFERENCES `v2_schedule_assignments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
