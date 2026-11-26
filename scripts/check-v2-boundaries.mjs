import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/(.:)/, '$1');
const failures = [];
const forbiddenArtifacts = ['.gitmodules', 'deploy/web-data-platform-v2'];
for (const item of forbiddenArtifacts)
  if (existsSync(join(root, item)))
    failures.push(`forbidden artifact exists: ${item}`);

const sourceRoots = ['apps/server/src', 'apps/web/src', 'packages/shared'];
const forbiddenPatterns = [
  [/[`'"]\/tasks\//, 'legacy task endpoint'],
  [/[`'"]\/v2\/x-manager\//, 'legacy x-manager endpoint'],
  [/[`'"]\/bridge\/bluecat\/(?!v1\/)/, 'unversioned Bridge endpoint'],
  [
    /x-manager\/revenue\/(settled|live|shifts|ota-daily)/,
    'direct x-manager revenue write endpoint'
  ],
  [
    /V2_X_MANAGER_(AUTO_SYNC_ENABLED|LIVE_SYNC_INTERVAL_MINUTES|SHIFT_SYNC_INTERVAL_MINUTES)/,
    'deprecated auto-sync variable'
  ],
  [
    /modules\/(performance|scoring|store|org)\//,
    'deleted V1 server module import'
  ],
  [/@\/api\/(performance|scoring|store)/, 'deleted V1 web API import']
];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(ts|vue|js|mjs)$/.test(name)) {
      const text = readFileSync(path, 'utf8');
      for (const [pattern, label] of forbiddenPatterns)
        if (pattern.test(text))
          failures.push(`${label}: ${relative(root, path)}`);
    }
  }
}
for (const dir of sourceRoots) walk(join(root, dir));

const deprecatedAutoSyncVariables = [
  'V2_X_MANAGER_AUTO_SYNC_ENABLED',
  'V2_X_MANAGER_LIVE_SYNC_INTERVAL_MINUTES',
  'V2_X_MANAGER_SHIFT_SYNC_INTERVAL_MINUTES'
];
for (const configPath of [
  'ecosystem.config.cjs',
  '.env.example',
  '.env.production.example'
]) {
  const path = join(root, configPath);
  if (!existsSync(path)) continue;
  const text = readFileSync(path, 'utf8');
  for (const variable of deprecatedAutoSyncVariables)
    if (text.includes(variable))
      failures.push(`deprecated auto-sync variable ${variable}: ${configPath}`);
}

const operations = readFileSync(
  join(root, 'apps/server/src/modules/v2-operations/v2-operations.service.ts'),
  'utf8'
);
const discovery = operations.slice(
  operations.indexOf('async discoverStoresForActor'),
  operations.indexOf('async syncAllStoreMachineCounts')
);
if (/v2Store\.(create|upsert|update)/.test(discovery))
  failures.push('store discovery mutates formal V2 stores');
if (!discovery.includes('v2ExternalStoreCandidate'))
  failures.push('store discovery does not persist external candidates');
for (const required of [
  'HISTORICAL_PRODUCT_CATEGORY_EXCLUSION',
  'productExclusionCategoryIdsForMonth',
  'categoryIdsOverride'
])
  if (!operations.includes(required))
    failures.push(`historical product exclusion correction is missing ${required}`);
if (operations.includes('historical_month_immutable'))
  failures.push('historical product exclusion correction is still immutable');

const operationsController = readFileSync(
  join(
    root,
    'apps/server/src/modules/v2-operations/v2-operations.controller.ts'
  ),
  'utf8'
);
if (!operationsController.includes('external-store-candidates/:id/match'))
  failures.push(
    'external store review route is missing: external-store-candidates/:id/match'
  );
if (
  operationsController.includes(
    'external-store-candidates/:id/create-and-match'
  )
)
  failures.push(
    'external store review must not bypass the formal store-center creation workflow'
  );
if (
  !/@Get\('report-comparison'\)\s+@RequirePermissions\('performance:view'\)/.test(
    operationsController
  )
)
  failures.push(
    'operations report comparison is missing its view permission boundary'
  );
const operationsModule = readFileSync(
  join(root, 'apps/server/src/modules/v2-operations/v2-operations.module.ts'),
  'utf8'
);
if (!operationsModule.includes('V2BridgeSnapshotSyncService'))
  failures.push('V2 Bridge snapshot synchronization provider is missing');
const snapshotSync = readFileSync(
  join(
    root,
    'apps/server/src/modules/v2-operations/v2-bridge-snapshot-sync.service.ts'
  ),
  'utf8'
);
for (const required of [
  '/bridge/bluecat/v1/tasks/sync',
  'syncCollectorLive',
  'syncCollectorSettled',
  'syncCollectorShifts',
  'syncCollectorOtaDaily',
  'syncCollectorOtaRedemptions'
])
  if (!`${operations}\n${snapshotSync}`.includes(required))
    failures.push(`V2 snapshot synchronization is missing ${required}`);
const operationsReport = readFileSync(
  join(
    root,
    'apps/server/src/modules/v2-operations/v2-operations-report.service.ts'
  ),
  'utf8'
);
const reportScheduler = operationsReport.slice(
  operationsReport.indexOf('private async runScheduler'),
  operationsReport.indexOf('private async generateMissing')
);
if (!reportScheduler.includes("status: { notIn: ['PREPARING', 'CLOSED'] }"))
  failures.push('automatic operations reports do not exclude closed stores');
const operationsView = readFileSync(
  join(root, 'apps/web/src/views/v2/V2OperationsView.vue'),
  'utf8'
);
if (!operationsView.includes('绑定已有门店'))
  failures.push('external store review UI is missing: 绑定已有门店');
if (operationsView.includes('创建并绑定'))
  failures.push(
    'external store review UI must not offer a duplicate create-store shortcut'
  );

const schema = readFileSync(join(root, 'prisma/schema.prisma'), 'utf8');
if (!schema.includes('model V2DataSourceConnection'))
  failures.push('formal V2 data-source mapping model is missing');
if (!schema.includes('@@map("legacy_store_external_mappings_archive")'))
  failures.push('legacy mapping is not isolated as an archive');
const migrationPath = join(
  root,
  'prisma/migrations/20261011110000_consolidate_external_store_mappings/migration.sql'
);
if (!existsSync(migrationPath))
  failures.push('mapping consolidation migration is missing');
else {
  const migration = readFileSync(migrationPath, 'utf8');
  for (const required of [
    'v2_external_store_candidates',
    'v2_data_source_connections',
    'legacy_store_external_mappings_archive'
  ])
    if (!migration.includes(required))
      failures.push(`mapping migration missing ${required}`);
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('V2 boundary regression checks passed');
