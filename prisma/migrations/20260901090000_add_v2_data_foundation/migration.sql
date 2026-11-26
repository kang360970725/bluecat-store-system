CREATE TABLE IF NOT EXISTS `v2_ingest_batches` (
  `id` VARCHAR(191) NOT NULL, `source_system` VARCHAR(191) NOT NULL,
  `endpoint` VARCHAR(191) NOT NULL, `external_store_id` VARCHAR(191) NOT NULL,
  `request_params` JSON NOT NULL, `response_body` JSON NOT NULL,
  `business_start_at` DATETIME(3) NOT NULL, `business_end_at` DATETIME(3) NOT NULL,
  `fetched_at` DATETIME(3) NOT NULL,
  `status` ENUM('RECEIVED','COMPLETED','FAILED') NOT NULL DEFAULT 'RECEIVED',
  `page_count` INTEGER NULL, `record_count` INTEGER NOT NULL DEFAULT 0,
  `content_hash` VARCHAR(64) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `v2_ingest_batch_identity` (`source_system`,`endpoint`,`external_store_id`,`content_hash`),
  INDEX `v2_ingest_batch_window` (`external_store_id`,`business_start_at`,`business_end_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `v2_raw_records` (
  `id` VARCHAR(191) NOT NULL, `batch_id` VARCHAR(191) NOT NULL,
  `source_system` VARCHAR(64) NOT NULL, `source_module` VARCHAR(64) NOT NULL,
  `external_store_id` VARCHAR(64) NOT NULL, `source_record_id` VARCHAR(191) NULL,
  `stable_key` VARCHAR(128) NOT NULL, `payload` JSON NOT NULL, `payload_hash` VARCHAR(64) NOT NULL,
  `occurred_at` DATETIME(3) NULL, `settled_at` DATETIME(3) NULL,
  `source_updated_at` DATETIME(3) NULL, `fetched_at` DATETIME(3) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `v2_raw_record_version` (`source_system`,`source_module`,`external_store_id`,`stable_key`,`payload_hash`),
  INDEX `v2_raw_records_batch_id_idx` (`batch_id`),
  INDEX `v2_raw_record_business_time` (`external_store_id`,`occurred_at`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `v2_rule_definitions` (
  `id` VARCHAR(191) NOT NULL, `code` VARCHAR(191) NOT NULL, `version` INTEGER NOT NULL,
  `name` VARCHAR(191) NOT NULL, `description` TEXT NOT NULL, `config` JSON NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `v2_rule_version` (`code`,`version`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `v2_business_events` (
  `id` VARCHAR(191) NOT NULL, `raw_record_id` VARCHAR(191) NOT NULL, `rule_id` VARCHAR(191) NOT NULL,
  `external_store_id` VARCHAR(191) NOT NULL,
  `event_type` ENUM('RECHARGE_PRINCIPAL','RECHARGE_DIRECT_REWARD','MARKETING_CREDIT','PRODUCT_SALE','PRODUCT_REFUND','OTA_REDEEM','OTA_REVERSE','NET_FEE_SETTLEMENT','LEASE_INCOME','OTHER_INCOME') NOT NULL,
  `business_key` VARCHAR(191) NOT NULL, `amount` DECIMAL(14,2) NOT NULL,
  `decision` ENUM('INCLUDED','EXCLUDED') NOT NULL, `decision_reason` VARCHAR(500) NOT NULL,
  `occurred_at` DATETIME(3) NOT NULL, `settled_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `v2_event_identity` (`rule_id`,`raw_record_id`,`event_type`,`business_key`),
  INDEX `v2_event_window` (`external_store_id`,`occurred_at`,`decision`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `v2_event_links` (
  `id` VARCHAR(191) NOT NULL, `from_event_id` VARCHAR(191) NOT NULL, `to_event_id` VARCHAR(191) NOT NULL,
  `link_type` ENUM('DUPLICATE_OF','REPRESENTS_SAME_BUSINESS','REVERSAL_OF') NOT NULL,
  `rule_code` VARCHAR(191) NOT NULL, `reason` VARCHAR(500) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `v2_event_link_identity` (`from_event_id`,`to_event_id`,`link_type`),
  INDEX `v2_event_links_to_event_id_idx` (`to_event_id`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `v2_reconciliation_runs` (
  `id` VARCHAR(191) NOT NULL, `external_store_id` VARCHAR(191) NOT NULL,
  `business_start_at` DATETIME(3) NOT NULL, `business_end_at` DATETIME(3) NOT NULL,
  `rule_set_version` VARCHAR(191) NOT NULL, `authoritative_amount` DECIMAL(14,2) NULL,
  `included_amount` DECIMAL(14,2) NOT NULL, `excluded_amount` DECIMAL(14,2) NOT NULL,
  `difference_amount` DECIMAL(14,2) NULL,
  `status` ENUM('DRAFT','PASSED','NEEDS_REVIEW') NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL,
  INDEX `v2_reconciliation_window` (`external_store_id`,`business_start_at`,`business_end_at`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `v2_metric_facts` (
  `id` VARCHAR(191) NOT NULL, `reconciliation_id` VARCHAR(191) NOT NULL,
  `event_id` VARCHAR(191) NOT NULL, `rule_id` VARCHAR(191) NOT NULL,
  `metric_code` VARCHAR(191) NOT NULL, `amount` DECIMAL(14,2) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `v2_metric_fact_identity` (`reconciliation_id`,`event_id`,`metric_code`),
  INDEX `v2_metric_facts_metric_code_idx` (`metric_code`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `v2_reconciliation_items` (
  `id` VARCHAR(191) NOT NULL, `reconciliation_id` VARCHAR(191) NOT NULL,
  `source_module` VARCHAR(191) NOT NULL,
  `event_type` ENUM('RECHARGE_PRINCIPAL','RECHARGE_DIRECT_REWARD','MARKETING_CREDIT','PRODUCT_SALE','PRODUCT_REFUND','OTA_REDEEM','OTA_REVERSE','NET_FEE_SETTLEMENT','LEASE_INCOME','OTHER_INCOME') NOT NULL,
  `decision` ENUM('INCLUDED','EXCLUDED') NOT NULL, `rule_code` VARCHAR(191) NOT NULL,
  `reason` VARCHAR(500) NOT NULL, `record_count` INTEGER NOT NULL, `amount` DECIMAL(14,2) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `v2_reconciliation_item_decision` (`reconciliation_id`,`decision`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `v2_raw_records` ADD CONSTRAINT `v2_raw_records_batch_id_fkey` FOREIGN KEY (`batch_id`) REFERENCES `v2_ingest_batches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `v2_business_events` ADD CONSTRAINT `v2_business_events_raw_record_id_fkey` FOREIGN KEY (`raw_record_id`) REFERENCES `v2_raw_records`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `v2_business_events` ADD CONSTRAINT `v2_business_events_rule_id_fkey` FOREIGN KEY (`rule_id`) REFERENCES `v2_rule_definitions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `v2_event_links` ADD CONSTRAINT `v2_event_links_from_event_id_fkey` FOREIGN KEY (`from_event_id`) REFERENCES `v2_business_events`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `v2_event_links` ADD CONSTRAINT `v2_event_links_to_event_id_fkey` FOREIGN KEY (`to_event_id`) REFERENCES `v2_business_events`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `v2_metric_facts` ADD CONSTRAINT `v2_metric_facts_reconciliation_id_fkey` FOREIGN KEY (`reconciliation_id`) REFERENCES `v2_reconciliation_runs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `v2_metric_facts` ADD CONSTRAINT `v2_metric_facts_event_id_fkey` FOREIGN KEY (`event_id`) REFERENCES `v2_business_events`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `v2_metric_facts` ADD CONSTRAINT `v2_metric_facts_rule_id_fkey` FOREIGN KEY (`rule_id`) REFERENCES `v2_rule_definitions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `v2_reconciliation_items` ADD CONSTRAINT `v2_reconciliation_items_reconciliation_id_fkey` FOREIGN KEY (`reconciliation_id`) REFERENCES `v2_reconciliation_runs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
