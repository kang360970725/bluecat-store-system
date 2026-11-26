CREATE TABLE `v2_attendance_settings` (
    `id` INTEGER NOT NULL,
    `app_id` VARCHAR(32) NOT NULL,
    `app_secret_cipher` VARCHAR(255) NOT NULL,
    `signing_key_cipher` VARCHAR(255) NOT NULL,
    `clock_in_early` INTEGER NOT NULL,
    `clock_out_late` INTEGER NOT NULL,
    `updated_by` VARCHAR(191) NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
