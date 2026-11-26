INSERT INTO `v2_permissions` (`id`, `code`, `name`, `module`, `description`, `updated_at`)
VALUES
  (UUID(), 'operational-task:report', '查看运营任务统计', 'operational-task', '查看授权门店的任务完成统计', CURRENT_TIMESTAMP(3)),
  (UUID(), 'operational-task:export', '导出运营任务明细', 'operational-task', '导出同时具备统计和导出权限的门店任务明细', CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE `code` = VALUES(`code`);
