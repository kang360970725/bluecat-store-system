INSERT IGNORE INTO `v2_role_permissions`
  (`role_id`, `permission_id`, `created_at`)
SELECT `role`.`id`, `permission`.`id`, CURRENT_TIMESTAMP(3)
FROM `v2_roles` AS `role`
JOIN `v2_permissions` AS `permission`
  ON `permission`.`code` = 'operational-task:manage'
WHERE `role`.`code` = 'store_manager'
  AND `role`.`enabled` = true
  AND `role`.`deleted_at` IS NULL;
