CREATE TABLE `v2_attendance_wifi_networks` (
    `id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `bssid` CHAR(17) NOT NULL,
    `label` VARCHAR(100) NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `updated_by` VARCHAR(191) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `v2_attendance_wifi_networks_store_id_bssid_key`(`store_id`, `bssid`),
    INDEX `v2_attendance_wifi_networks_bssid_enabled_deleted_at_idx`(`bssid`, `enabled`, `deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `v2_attendance_punches`
    ADD COLUMN `wifi_network_id` VARCHAR(191) NULL,
    ADD INDEX `v2_attendance_punches_wifi_network_id_idx`(`wifi_network_id`);

ALTER TABLE `v2_attendance_wifi_networks`
    ADD CONSTRAINT `v2_attendance_wifi_networks_store_id_fkey`
    FOREIGN KEY (`store_id`) REFERENCES `v2_stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `v2_attendance_punches`
    ADD CONSTRAINT `v2_attendance_punches_wifi_network_id_fkey`
    FOREIGN KEY (`wifi_network_id`) REFERENCES `v2_attendance_wifi_networks`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
