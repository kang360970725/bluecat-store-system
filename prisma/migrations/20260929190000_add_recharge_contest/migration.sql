CREATE TABLE `v2_recharge_contests` (
  `id` VARCHAR(191) NOT NULL,
  `code` VARCHAR(64) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `starts_at` DATETIME(3) NOT NULL,
  `ends_at` DATETIME(3) NOT NULL,
  `rules` JSON NOT NULL,
  `status` VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
  `last_synced_at` DATETIME(3) NULL,
  `last_full_synced_at` DATETIME(3) NULL,
  `last_sync_error` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `v2_recharge_contests_code_key`(`code`),
  INDEX `v2_recharge_contests_status_starts_at_ends_at_idx`(`status`, `starts_at`, `ends_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `v2_recharge_contest_entries` (
  `id` VARCHAR(191) NOT NULL,
  `contest_id` VARCHAR(191) NOT NULL,
  `store_id` VARCHAR(191) NOT NULL,
  `external_store_id` VARCHAR(64) NOT NULL,
  `source_key` VARCHAR(128) NOT NULL,
  `source_record_id` VARCHAR(128) NULL,
  `transaction_no` VARCHAR(128) NULL,
  `occurred_at` DATETIME(3) NOT NULL,
  `category` VARCHAR(64) NOT NULL,
  `card_ref` VARCHAR(128) NULL,
  `principal` DECIMAL(14,2) NOT NULL,
  `reward` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `score` INTEGER NOT NULL,
  `payment_source` VARCHAR(128) NULL,
  `payment_method` VARCHAR(128) NULL,
  `operator_label` VARCHAR(128) NULL,
  `source_payload` JSON NOT NULL,
  `source_hash` VARCHAR(64) NOT NULL,
  `captured_at` DATETIME(3) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `v2_recharge_contest_entry_source_key`(`contest_id`, `source_key`),
  INDEX `v2_recharge_contest_entries_contest_id_store_id_occurred_at_idx`(`contest_id`, `store_id`, `occurred_at`),
  INDEX `v2_recharge_contest_entries_external_store_id_occurred_at_idx`(`external_store_id`, `occurred_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `v2_recharge_contest_sync_runs` (
  `id` VARCHAR(191) NOT NULL,
  `contest_id` VARCHAR(191) NOT NULL,
  `bucket_at` DATETIME(3) NOT NULL,
  `range_start` DATETIME(3) NOT NULL,
  `range_end` DATETIME(3) NOT NULL,
  `mode` VARCHAR(24) NOT NULL,
  `status` VARCHAR(24) NOT NULL DEFAULT 'RUNNING',
  `record_count` INTEGER NOT NULL DEFAULT 0,
  `error_reason` TEXT NULL,
  `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `finished_at` DATETIME(3) NULL,
  UNIQUE INDEX `v2_recharge_contest_sync_bucket`(`contest_id`, `bucket_at`),
  INDEX `v2_recharge_contest_sync_runs_contest_id_started_at_idx`(`contest_id`, `started_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `v2_recharge_contest_entries` ADD CONSTRAINT `v2_recharge_contest_entries_contest_id_fkey` FOREIGN KEY (`contest_id`) REFERENCES `v2_recharge_contests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `v2_recharge_contest_entries` ADD CONSTRAINT `v2_recharge_contest_entries_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `v2_stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `v2_recharge_contest_sync_runs` ADD CONSTRAINT `v2_recharge_contest_sync_runs_contest_id_fkey` FOREIGN KEY (`contest_id`) REFERENCES `v2_recharge_contests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
