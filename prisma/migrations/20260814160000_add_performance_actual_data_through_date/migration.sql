ALTER TABLE `store_performance_actual_snapshots`
  ADD COLUMN `data_through_date` DATE NULL AFTER `source`;
