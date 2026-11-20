ALTER TABLE `v2_position_templates`
  ADD COLUMN `role_id` VARCHAR(191) NULL,
  ADD INDEX `v2_position_templates_role_id_idx` (`role_id`),
  ADD CONSTRAINT `v2_position_templates_role_id_fkey`
    FOREIGN KEY (`role_id`) REFERENCES `v2_roles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `v2_organization_positions`
  ADD COLUMN `role_id` VARCHAR(191) NULL,
  ADD INDEX `v2_organization_positions_role_id_idx` (`role_id`),
  ADD CONSTRAINT `v2_organization_positions_role_id_fkey`
    FOREIGN KEY (`role_id`) REFERENCES `v2_roles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE `v2_position_templates`
SET `role_id` = (SELECT `id` FROM `v2_roles` WHERE `code` = 'store_staff' AND `deleted_at` IS NULL LIMIT 1)
WHERE `deleted_at` IS NULL;

UPDATE `v2_organization_positions`
SET `role_id` = CASE
  WHEN `code` = 'HEAD_OFFICE_STORE_MANAGER'
    THEN (SELECT `id` FROM `v2_roles` WHERE `code` = 'store_manager' AND `deleted_at` IS NULL LIMIT 1)
  ELSE (SELECT `id` FROM `v2_roles` WHERE `code` = 'store_staff' AND `deleted_at` IS NULL LIMIT 1)
END
WHERE `deleted_at` IS NULL;

DELETE ar FROM `v2_account_roles` ar
JOIN `v2_accounts` a ON a.`id` = ar.`account_id`
JOIN `v2_roles` r ON r.`id` = ar.`role_id`
WHERE a.`employee_id` IS NOT NULL AND r.`code` <> 'super_admin';

INSERT IGNORE INTO `v2_account_roles` (`account_id`,`role_id`,`created_at`,`created_by`)
SELECT a.`id`, op.`role_id`, NOW(3), 'SYSTEM_POSITION_ROLE_MIGRATION'
FROM `v2_accounts` a
JOIN `v2_organization_employments` oe ON oe.`employee_id` = a.`employee_id`
  AND oe.`ended_on` IS NULL AND oe.`deleted_at` IS NULL
JOIN `v2_organization_positions` op ON op.`id` = oe.`position_id`
WHERE a.`deleted_at` IS NULL AND op.`role_id` IS NOT NULL;

INSERT IGNORE INTO `v2_account_roles` (`account_id`,`role_id`,`created_at`,`created_by`)
SELECT a.`id`, pt.`role_id`, NOW(3), 'SYSTEM_POSITION_ROLE_MIGRATION'
FROM `v2_accounts` a
JOIN `v2_employments` e ON e.`employee_id` = a.`employee_id`
  AND e.`ended_on` IS NULL AND e.`deleted_at` IS NULL
JOIN `v2_store_positions` sp ON sp.`id` = e.`position_id`
JOIN `v2_position_templates` pt ON pt.`id` = sp.`template_id`
WHERE a.`deleted_at` IS NULL AND pt.`role_id` IS NOT NULL;

INSERT IGNORE INTO `v2_account_roles` (`account_id`,`role_id`,`created_at`,`created_by`)
SELECT a.`id`, r.`id`, NOW(3), 'SYSTEM_POSITION_ROLE_MIGRATION'
FROM `v2_accounts` a
JOIN `v2_employments` e ON e.`employee_id` = a.`employee_id`
  AND e.`ended_on` IS NULL AND e.`deleted_at` IS NULL
JOIN `v2_roles` r ON r.`code` = 'store_staff' AND r.`deleted_at` IS NULL
WHERE a.`deleted_at` IS NULL
  AND NOT EXISTS (SELECT 1 FROM `v2_account_roles` ar WHERE ar.`account_id` = a.`id`);

UPDATE `v2_position_templates`
SET `enabled` = false, `deleted_at` = NOW(3), `updated_at` = NOW(3)
WHERE `name` IN ('店长','门店店长','总部职能岗') AND `deleted_at` IS NULL;

UPDATE `v2_store_positions`
SET `enabled` = false, `deleted_at` = NOW(3), `updated_at` = NOW(3)
WHERE `name` IN ('店长','门店店长','总部职能岗') AND `deleted_at` IS NULL;

UPDATE `v2_organization_positions`
SET `enabled` = false, `deleted_at` = NOW(3), `updated_at` = NOW(3)
WHERE `code` = 'HEAD_OFFICE_FUNCTION' AND `deleted_at` IS NULL;

UPDATE `v2_roles`
SET `enabled` = false, `deleted_at` = NOW(3), `updated_at` = NOW(3)
WHERE `name` = '店长' AND `code` = '000' AND `deleted_at` IS NULL;
