ALTER TABLE `v2_operational_tasks`
  ADD COLUMN `review_mode` ENUM('REQUIRED', 'AUTO_COMPLETE') NOT NULL DEFAULT 'REQUIRED';

ALTER TABLE `v2_operational_task_schedules`
  ADD COLUMN `batch_id` VARCHAR(64) NULL,
  ADD COLUMN `review_mode` ENUM('REQUIRED', 'AUTO_COMPLETE') NOT NULL DEFAULT 'REQUIRED';

UPDATE `v2_operational_task_schedules`
SET `batch_id` = `id`
WHERE `batch_id` IS NULL;

ALTER TABLE `v2_operational_task_schedules`
  MODIFY `batch_id` VARCHAR(64) NOT NULL,
  ADD UNIQUE INDEX `v2_operational_task_schedules_batch_target_key`
    (`created_by`, `batch_id`, `store_id`, `target_key`);

ALTER TABLE `v2_operational_task_evidence`
  ADD COLUMN `checklist_item_id` VARCHAR(64) NULL,
  ADD COLUMN `byte_size` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `width` INTEGER NULL,
  ADD COLUMN `height` INTEGER NULL,
  ADD INDEX `v2_operational_task_evidence_task_item_idx`
    (`task_id`, `checklist_item_id`);

UPDATE `v2_operational_task_evidence`
SET `byte_size` = OCTET_LENGTH(`image`)
WHERE `byte_size` = 0;

CREATE TABLE `v2_operational_task_executor_groups` (
  `id` VARCHAR(191) NOT NULL,
  `store_id` VARCHAR(191) NOT NULL,
  `code` VARCHAR(40) NOT NULL,
  `name` VARCHAR(80) NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `created_by` VARCHAR(191) NULL,
  `updated_by` VARCHAR(191) NULL,
  UNIQUE INDEX `v2_operational_task_executor_groups_store_id_code_key` (`store_id`, `code`),
  INDEX `v2_operational_task_executor_groups_store_id_enabled_idx` (`store_id`, `enabled`),
  PRIMARY KEY (`id`),
  CONSTRAINT `v2_operational_task_executor_groups_store_id_fkey`
    FOREIGN KEY (`store_id`) REFERENCES `v2_stores` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `v2_operational_task_executor_group_members` (
  `id` VARCHAR(191) NOT NULL,
  `group_id` VARCHAR(191) NOT NULL,
  `employment_id` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `created_by` VARCHAR(191) NULL,
  UNIQUE INDEX `v2_operational_task_executor_group_members_group_employment_key` (`group_id`, `employment_id`),
  INDEX `v2_operational_task_executor_group_members_employment_id_idx` (`employment_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `v2_operational_task_executor_group_members_group_id_fkey`
    FOREIGN KEY (`group_id`) REFERENCES `v2_operational_task_executor_groups` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `v2_operational_task_executor_group_members_employment_id_fkey`
    FOREIGN KEY (`employment_id`) REFERENCES `v2_employments` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `v2_operational_task_evidence_drafts` (
  `id` VARCHAR(191) NOT NULL,
  `task_id` VARCHAR(191) NOT NULL,
  `employee_id` VARCHAR(191) NOT NULL,
  `checklist_item_id` VARCHAR(64) NULL,
  `image` MEDIUMBLOB NOT NULL,
  `byte_size` INTEGER NOT NULL,
  `width` INTEGER NULL,
  `height` INTEGER NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `v2_operational_task_evidence_drafts_task_employee_expiry_idx` (`task_id`, `employee_id`, `expires_at`),
  INDEX `v2_operational_task_evidence_drafts_expires_at_idx` (`expires_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `v2_operational_task_evidence_drafts_task_id_fkey`
    FOREIGN KEY (`task_id`) REFERENCES `v2_operational_tasks` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `v2_operational_task_evidence_drafts_employee_id_fkey`
    FOREIGN KEY (`employee_id`) REFERENCES `v2_employees` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
