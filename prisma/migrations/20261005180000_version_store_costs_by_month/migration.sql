ALTER TABLE `v2_store_cost_configs`
  ADD COLUMN `historical_baseline` BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE `v2_store_cost_configs`
SET `historical_baseline` = TRUE,
    `effective_to` = NULL
WHERE `enabled` = TRUE AND `deleted_at` IS NULL;
