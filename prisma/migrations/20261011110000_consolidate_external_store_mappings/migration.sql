-- Preserve every discovered external store as a V2 candidate before retiring
-- the legacy mapping table. No formal Store record is created by this migration.
INSERT IGNORE INTO `v2_external_store_candidates` (
  `id`, `source_system`, `external_store_id`, `external_branch_id`,
  `external_store_name`, `status`, `contract_version`, `quality_warnings`,
  `first_seen_at`, `last_seen_at`, `reviewed_at`, `reviewed_by`,
  `created_at`, `updated_at`
)
SELECT
  CONCAT('legacy_', SHA2(CONCAT(sem.`provider`, ':', UPPER(sem.`external_store_id`)), 256)),
  'X_MANAGER', UPPER(sem.`external_store_id`), sem.`external_branch_id`,
  sem.`external_name`,
  CASE WHEN v2s.`id` IS NULL THEN 'PENDING' ELSE 'MATCHED' END,
  'legacy', JSON_ARRAY('migrated_from_store_external_mappings'),
  sem.`created_at`, COALESCE(sem.`last_seen_at`, sem.`updated_at`),
  CASE WHEN v2s.`id` IS NULL THEN NULL ELSE sem.`updated_at` END,
  CASE WHEN v2s.`id` IS NULL THEN NULL ELSE 'migration' END,
  sem.`created_at`, sem.`updated_at`
FROM `store_external_mappings` sem
LEFT JOIN `stores` s ON s.`id` = sem.`store_id` AND s.`deleted_at` IS NULL
LEFT JOIN `v2_stores` v2s ON UPPER(v2s.`code`) = UPPER(s.`code`)
  AND v2s.`deleted_at` IS NULL AND v2s.`status` <> 'CLOSED'
WHERE sem.`deleted_at` IS NULL
  AND sem.`external_store_id` IS NOT NULL
  AND TRIM(sem.`external_store_id`) <> '';

-- Migrate only previously confirmed links that can be matched to an existing,
-- non-closed V2 store by the stable internal store code. Existing V2 mappings
-- win on conflict and are never overwritten.
INSERT IGNORE INTO `v2_data_source_connections` (
  `id`, `store_id`, `source_system`, `external_store_id`,
  `external_store_name`, `enabled_modules`, `session_status`,
  `created_at`, `updated_at`, `created_by`, `updated_by`
)
SELECT
  CONCAT('legacy_', SHA2(CONCAT('connection:', UPPER(sem.`external_store_id`)), 256)),
  v2s.`id`, 'X_MANAGER', UPPER(sem.`external_store_id`), sem.`external_name`,
  JSON_ARRAY('income', 'recharge', 'ota', 'products', 'surf', 'shifts', 'branches'),
  'UNCONFIGURED', sem.`created_at`, sem.`updated_at`, 'migration', 'migration'
FROM `store_external_mappings` sem
JOIN `stores` s ON s.`id` = sem.`store_id` AND s.`deleted_at` IS NULL
JOIN `v2_stores` v2s ON UPPER(v2s.`code`) = UPPER(s.`code`)
  AND v2s.`deleted_at` IS NULL AND v2s.`status` <> 'CLOSED'
WHERE sem.`deleted_at` IS NULL
  AND sem.`store_id` IS NOT NULL
  AND sem.`match_status` IN ('MANUAL_MATCHED', 'AUTO_MATCHED');

-- Retain the historical rows for audit and rollback, but remove the old table
-- name from runtime use so only V2DataSourceConnection remains formal.
RENAME TABLE `store_external_mappings` TO `legacy_store_external_mappings_archive`;
