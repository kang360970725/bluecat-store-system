INSERT INTO `v2_permissions` (`id`, `code`, `name`, `module`, `description`, `updated_at`)
VALUES (UUID(), 'attendance:export', '导出月度考勤', 'attendance', '导出同时具备查看与导出权限的门店月度考勤明细', CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE `code` = VALUES(`code`);
