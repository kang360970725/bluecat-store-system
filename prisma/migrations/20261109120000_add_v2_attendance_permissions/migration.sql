INSERT INTO `v2_permissions` (`id`, `code`, `name`, `module`, `description`, `updated_at`)
VALUES
  (UUID(), 'attendance:view', '查看考勤', 'attendance', '查询授权门店的排班打卡记录', CURRENT_TIMESTAMP(3)),
  (UUID(), 'attendance:review', '审批补卡', 'attendance', '审批授权门店的补卡申请', CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE `code` = VALUES(`code`);
