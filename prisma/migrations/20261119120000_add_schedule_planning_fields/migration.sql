ALTER TABLE `v2_schedule_assignments`
  MODIFY `shift_id` VARCHAR(191) NULL,
  ADD COLUMN `is_rest` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `overtime` BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX `v2_sched_period_employee_date_rest_idx`
  ON `v2_schedule_assignments`(`period_id`, `employee_id`, `work_date`, `is_rest`);

CREATE TABLE `v2_schedule_successions` (
  `id` VARCHAR(191) NOT NULL,
  `store_id` VARCHAR(191) NOT NULL,
  `predecessor_employee_id` VARCHAR(191) NOT NULL,
  `successor_employment_id` VARCHAR(191) NOT NULL,
  `effective_from` DATE NOT NULL,
  `created_by` VARCHAR(191) NULL,
  `updated_by` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `v2_sched_succ_store_predecessor_key` (`store_id`, `predecessor_employee_id`),
  INDEX `v2_sched_succ_successor_effective_idx` (`successor_employment_id`, `effective_from`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO `v2_permissions`
  (`id`, `code`, `name`, `module`, `description`, `created_at`, `updated_at`)
VALUES
  ('v2_perm_schedule_view', 'schedule:view', '查看门店排班', 'schedule', '查看授权门店的排班周期与排岗', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('v2_perm_schedule_update', 'schedule:update', '维护门店排班', 'schedule', '维护授权门店的班次、排岗、工作继承与加班', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));

INSERT IGNORE INTO `v2_role_permissions` (`role_id`, `permission_id`, `created_at`)
SELECT `role`.`id`, `permission`.`id`, CURRENT_TIMESTAMP(3)
FROM `v2_roles` AS `role`
JOIN `v2_permissions` AS `permission`
  ON `permission`.`code` IN ('schedule:view', 'schedule:update')
WHERE `role`.`code` = 'store_manager'
  AND `role`.`deleted_at` IS NULL;
