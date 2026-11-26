ALTER TABLE `v2_position_templates`
  ADD COLUMN `monthly_base_salary` DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN `monthly_performance_salary` DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN `hourly_rate` DECIMAL(14,2) NOT NULL DEFAULT 0;

ALTER TABLE `v2_employments`
  ADD COLUMN `compensation_type` VARCHAR(12) NOT NULL DEFAULT 'MONTHLY';

ALTER TABLE `v2_payroll_batches`
  ADD COLUMN `monthly_proration_days` DECIMAL(6,2) NOT NULL DEFAULT 26 AFTER `formula_version`;

ALTER TABLE `v2_organization_positions`
  ADD COLUMN `requires_p_grade` BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE `v2_organization_employments`
  ADD COLUMN `cost_store_id` VARCHAR(191) NULL,
  ADD COLUMN `grade` VARCHAR(12) NULL,
  ADD COLUMN `compensation_type` VARCHAR(12) NOT NULL DEFAULT 'MONTHLY',
  ADD INDEX `v2_organization_employments_cost_store_id_ended_on_idx` (`cost_store_id`, `ended_on`),
  ADD CONSTRAINT `v2_organization_employments_cost_store_id_fkey`
    FOREIGN KEY (`cost_store_id`) REFERENCES `v2_stores`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE `v2_position_templates` p
LEFT JOIN `v2_payroll_profile_templates` t
  ON t.`employee_type` = 'STORE_STAFF'
 AND t.`enabled` = true
 AND t.`position_keyword` IS NOT NULL
 AND p.`name` LIKE CONCAT('%', t.`position_keyword`, '%')
SET p.`monthly_base_salary` = COALESCE(t.`base_salary`, 0),
    p.`monthly_performance_salary` = COALESCE(t.`performance_base`, 0);

INSERT IGNORE INTO `v2_organization_positions`
  (`id`,`organization_id`,`name`,`code`,`description`,`sort`,`enabled`,`requires_p_grade`,`created_at`,`updated_at`)
SELECT 'hq_position_store_manager', o.`id`, '店长职能岗', 'HEAD_OFFICE_STORE_MANAGER',
       '总部职能岗位；必须选择P等级，工资成本归属所管理门店', 5, true, true, NOW(3), NOW(3)
FROM `v2_organizations` o
WHERE o.`type` = 'HEADQUARTERS' AND o.`deleted_at` IS NULL
LIMIT 1;

INSERT IGNORE INTO `v2_organization_employments`
  (`id`,`employee_id`,`organization_id`,`position_id`,`cost_store_id`,`grade`,`compensation_type`,
   `started_on`,`ended_on`,`is_primary`,`created_at`,`updated_at`,`created_by`,`updated_by`)
SELECT CONCAT('mgr_', e.`id`), e.`employee_id`, hp.`organization_id`, hp.`id`, e.`store_id`,
       COALESCE((SELECT pp.`grade` FROM `v2_employee_payroll_profiles` pp
                 WHERE pp.`employee_id` = e.`employee_id` AND pp.`employee_type` = 'STORE_MANAGER'
                 ORDER BY pp.`effective_from` DESC LIMIT 1), 'P0'),
       'MONTHLY', e.`started_on`, e.`ended_on`, e.`is_primary`, NOW(3), NOW(3), e.`created_by`, e.`updated_by`
FROM `v2_employments` e
JOIN `v2_store_positions` sp ON sp.`id` = e.`position_id`
JOIN `v2_organization_positions` hp ON hp.`code` = 'HEAD_OFFICE_STORE_MANAGER'
WHERE sp.`name` LIKE '%店长%' AND e.`deleted_at` IS NULL;

UPDATE `v2_employments` e
JOIN `v2_store_positions` sp ON sp.`id` = e.`position_id`
SET e.`ended_on` = COALESCE(e.`ended_on`, CURRENT_DATE()), e.`updated_at` = NOW(3)
WHERE sp.`name` LIKE '%店长%' AND e.`deleted_at` IS NULL AND e.`ended_on` IS NULL;
