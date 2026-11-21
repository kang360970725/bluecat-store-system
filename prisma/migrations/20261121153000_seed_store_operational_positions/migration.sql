-- Remove unused acceptance-only templates after their generated store positions
-- have been cleaned. Templates that still have a live position are retained.
UPDATE `v2_position_templates` AS `template`
SET `enabled` = false,
    `deleted_at` = CURRENT_TIMESTAMP(3),
    `updated_at` = CURRENT_TIMESTAMP(3),
    `updated_by` = 'SYSTEM_OPERATIONAL_POSITION_SEED'
WHERE `template`.`name` LIKE '测试·%'
  AND `template`.`deleted_at` IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM `v2_store_positions` AS `position`
    WHERE `position`.`template_id` = `template`.`id`
      AND `position`.`deleted_at` IS NULL
  );

-- These are the confirmed ordinary store jobs. Compensation values preserve the
-- existing payroll-template values; hourly compensation remains unconfigured.
INSERT INTO `v2_position_templates`
  (`id`, `name`, `code`, `description`, `sort`, `enabled`,
   `monthly_base_salary`, `monthly_performance_salary`, `hourly_rate`, `role_id`,
   `created_at`, `updated_at`, `created_by`, `updated_by`)
SELECT
  `defaults`.`id`, `defaults`.`name`, `defaults`.`code`, `defaults`.`description`,
  `defaults`.`sort`, true, `defaults`.`base_salary`, `defaults`.`performance_salary`,
  0, `role`.`id`, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3),
  'SYSTEM_OPERATIONAL_POSITION_SEED', 'SYSTEM_OPERATIONAL_POSITION_SEED'
FROM (
  SELECT 'sys_pos_cashier' AS `id`, '收银' AS `name`, 'STORE_CASHIER' AS `code`,
         '门店收银岗位；薪资沿用原前台岗位标准' AS `description`, 21 AS `sort`,
         1500 AS `base_salary`, 1200 AS `performance_salary`
  UNION ALL
  SELECT 'sys_pos_field', '外场', 'STORE_FIELD', '门店外场岗位', 22, 1500, 1200
  UNION ALL
  SELECT 'sys_pos_service', '客服', 'STORE_SERVICE', '门店客服岗位', 23, 1500, 1200
  UNION ALL
  SELECT 'sys_pos_bar', '吧员', 'STORE_BAR', '门店吧员岗位', 24, 1800, 1200
  UNION ALL
  SELECT 'sys_pos_mobile', '机动岗', 'STORE_MOBILE', '门店机动岗位', 25, 1800, 1200
) AS `defaults`
JOIN `v2_roles` AS `role`
  ON `role`.`code` = 'store_staff'
 AND `role`.`enabled` = true
 AND `role`.`deleted_at` IS NULL
WHERE NOT EXISTS (
  SELECT 1
  FROM `v2_position_templates` AS `existing`
  WHERE `existing`.`deleted_at` IS NULL
    AND (`existing`.`name` = `defaults`.`name` OR `existing`.`code` = `defaults`.`code`)
);

-- Every active store inherits the central templates. Store-specific positions
-- remain untouched and closed stores stay excluded from ordinary selectors.
INSERT INTO `v2_store_positions`
  (`id`, `store_id`, `template_id`, `source`, `name`, `code`, `description`,
   `sort`, `enabled`, `created_at`, `updated_at`, `created_by`, `updated_by`)
SELECT
  UUID(), `store`.`id`, `template`.`id`, 'SYSTEM_TEMPLATE', `template`.`name`,
  `template`.`code`, `template`.`description`, `template`.`sort`, true,
  CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3),
  'SYSTEM_OPERATIONAL_POSITION_SEED', 'SYSTEM_OPERATIONAL_POSITION_SEED'
FROM `v2_stores` AS `store`
JOIN `v2_position_templates` AS `template`
  ON `template`.`code` IN (
    'STORE_CASHIER', 'STORE_FIELD', 'STORE_SERVICE', 'STORE_BAR', 'STORE_MOBILE'
  )
 AND `template`.`enabled` = true
 AND `template`.`deleted_at` IS NULL
WHERE `store`.`status` <> 'CLOSED'
  AND `store`.`deleted_at` IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM `v2_store_positions` AS `existing`
    WHERE `existing`.`store_id` = `store`.`id`
      AND `existing`.`deleted_at` IS NULL
      AND (
        `existing`.`template_id` = `template`.`id`
        OR `existing`.`code` = `template`.`code`
        OR `existing`.`name` = `template`.`name`
      )
  );
