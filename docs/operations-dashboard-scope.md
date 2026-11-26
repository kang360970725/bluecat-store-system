# Operations Dashboard Scope

Last updated: 2026-11-07

## Delivery boundary

- Implement only in this Store repository.
- Prefer additive V2 modules and contracts; do not revive the previous local application.
- Preserve existing revenue, OTA, cost, payroll, permission, and reconciliation behavior.
- Expand X Manager access only through reviewed read-only endpoints and existing session validation.
- Never persist X Manager credentials, cookies, tokens, passwords, or verification codes.

## Reference report structure

The provided monthly report compares the selected month with the immediately preceding month. Its `同比` column is currently calculated as `(current - previous) / previous`; in the new UI and API this must be named `环比` unless a real prior-year comparison is added later.

| Group | Metrics |
| --- | --- |
| Operating revenue | net-fee income, drinks, food, peripherals, additional goods, cigarettes, monthly revenue, per-machine daily net-fee revenue, per-machine daily product revenue, per-machine daily total revenue |
| Computer usage and traffic operations | sessions, usage hours, effective usage amount (`cEffect`), area totals, single-machine ranking, 24-hour distribution, per-area daily utilization, weekday-hour arrivals, arrivals/departures/concurrency, anonymous customer segments, store seat-rate ranking and strategy cards; maintenance/disabled deductions remain unavailable |
| Online/OTA | online total, Meituan/Douyin/Gaode income and order count, package income, new/returning-member package count and amount, package sales ranking |
| Members | new members (BlueCat + Goddess/Student privilege cards), new privilege members, new online members, visiting members, daily new members, new-member rate, online-new-member share, spend per visiting member, recharge-to-consumption ratio |

## Existing source coverage

| Data | Current Store source | Status |
| --- | --- | --- |
| machine count | `V2Store.machineCount` | ready |

Machine count synchronization is an explicit low-frequency master-data action. Its source is the distinct set of assigned computer numbers across all X Manager rate areas; partial, empty, and login-expired responses do not clear an existing count.
| net-fee/product/rental revenue | `V2RevenueSnapshot` | ready |
| OTA platform, product, redemption, settlement | `V2OtaProduct`, `V2OtaRedemption`, `V2OtaDailySnapshot` | ready |
| product exclusions | `V2ProductExclusionSnapshot` and display categories | ready, preserve existing rules |
| operating costs and corrections | `V2StoreCostConfig`, `V2StoreCostCorrection` | ready |
| investment and forecast profit | store investment and operating-dashboard calculation | ready |
| computer sessions/hours/consumption | no authoritative monthly contract | collector evidence required |
| member additions/visits/recharge consumption | no authoritative monthly contract | collector evidence required |
| detailed product categories | partial supermarket category data | contract and category mapping required |

## Comparison and null rules

- Store monthly values with a canonical `YYYY-MM` period and Asia/Shanghai business-time attribution.
- `changeRate = (current - previous) / previous` when the previous value is non-zero.
- Return `null`, not infinity or spreadsheet errors, when the previous value is zero; the UI displays `—`.
- Ratio metrics compare their already-calculated monthly ratios; they are not recomputed from summed percentages.
- Historical reports must retain metric-definition and rule versions so later configuration changes do not silently rewrite published reports.

## Planned implementation slices

1. Metric registry and read-only monthly comparison response built from existing Store facts. **Implemented on `feature/operations-dashboard`.**
2. Operations dashboard route and responsive cards/tables following current V2 UI conventions. **Implemented as the top-level `运营看板` route and retained as the `运营月报` store-workspace tab.**
3. Versioned monthly report snapshot/publish workflow after the live metric response is validated.
4. X Manager contract discovery for computer usage, members, recharge consumption, and missing product categories.
5. Collector ingestion and backfill only after sample evidence and metric definitions are confirmed.

## Implemented live contract

- Endpoint: `GET /v2/operations/stores/:storeId/monthly-report?month=YYYY-MM`.
- Permission: `performance:view`.
- Comparison: selected month against its immediately preceding month (`MONTH_OVER_MONTH`).
- Ready metric codes: `NET_FEE_INCOME`, `PRODUCT_SALES`, `RENTAL_INCOME`, `MONTHLY_REVENUE`, `OTA_ACTUAL_INCOME`, `OTA_ORDER_COUNT`, and the `MEITUAN`/`DOUYIN`/`GAODE` income and count pairs.
- Every metric in the supplied report template is registered even when its authoritative source is not yet available; this keeps the API/UI shape visible while preventing speculative formulas.
- Ranking: top ten effective OTA products by redemption count, then effective income.
- Missing metrics remain in the response with `available=false`, `previous=null`, and `current=null`; `missingMetricCodes` gives clients an explicit completeness list.
- Database/schema impact: none. Collector impact: none. Existing calculation and exclusion paths remain unchanged.

## Weekly report and comparison hardening

- `GET /v2/operations/stores/:storeId/weekly-report?start=YYYY-MM-DD` provides Monday-to-Sunday weekly reporting and compares with the immediately preceding week.
- Weekly single-store reports now expose the same four metric groups and metric registry as monthly reports. Authoritative revenue and OTA facts are populated for the selected week; unavailable computer-usage, member, package-member, and product-category metrics remain explicit unavailable entries and are included in missingMetricCodes.
- The current week and current month compare the same number of elapsed days with the preceding period; incomplete current periods are never compared directly with a complete prior period.
- Implemented metrics return `null` when their period has no authoritative source rows. Zero is reserved for a measured zero, not missing data.
- Responses expose expected days, source days, completeness, revenue rows, and OTA rows for both periods so operators can judge completeness before using a report. The frontend highlights incomplete single-store and multi-store periods.
- Multiple product-exclusion facts for the same date and snapshot kind are accumulated rather than overwritten.
- Closed stores are rejected by the weekly and monthly report endpoints.
- `GET /v2/operations/report-comparison?periodType=MONTH|WEEK&period=...` ranks the same authoritative metrics across all active stores in the caller's permitted store scope.
- The frontend offers `单店分析` and `多店对比`; both the route and APIs require `performance:view`, while super administrators retain full active-store scope.
- External-store discovery no longer offers a second create-store shortcut. Operators create formal stores in the store center, then bind pending candidates in operations configuration.

## Approval gates

Explicit approval is required before:

- changing existing revenue composition or product-exclusion logic;
- changing business-day attribution or OTA settlement calculations;
- using a new X Manager write endpoint;
- backfilling historical production data;
- modifying payroll or cost formulas;
- interpreting an ambiguous source field as an authoritative business metric.

## 2026-11-07 traffic-operations expansion

- `GET /v2/operations/stores/:storeId/usage-analytics` remains the single-store read path; `GET /v2/operations/usage-analytics-ranking` adds a scoped all-store summary with a producer concurrency limit of two stores.
- Arrival means a session start, departure means a session end, concurrent traffic is reconstructed from start/end events, and the 7 × 24 heatmap uses per-occurrence weekday-hour averages so weekdays occurring four and five times remain comparable.
- Unique visitors and customer segments use an identifier hashed inside DATAN's MySQL query. Only aggregate counts cross the Bridge. The UI labels newness as `采集期首次` rather than asserting that the person is historically new outside collected coverage.
- Seat rate is occupied machine-hours divided by 24-hour capacity for the union of configured and period-observed machines. The interface identifies unsynchronized observed machines and discloses that maintenance and disabled intervals are not yet deducted.
- Store ranking follows `performance:view` store scope and excludes preparing/closed stores. The bottom group is the larger of three stores or the bottom 20%. Suggestions compare seat rate, repeat rate, stay duration and area concentration with accessible-store medians and remain advisory only.
- Database migration/backfill: none. Business-data writes: none. Collector task impact: none. Production deployment completed on 2026-11-07 in producer-first order with paired application snapshots and no pending migration.
- Verification: server/web typecheck and production build, lint with existing warnings only, V2 regression/boundary checks, 28 DATAN unit tests, Python compilation, diff checks, and a read-only production-data candidate run for `AQXH-5130` October (31/31 days, 84 unioned machines, 37.21% seat rate, 1,568 aggregate visitors, no identifier fields in the response).

## 2026-11-09 forecast consistency repair

- Store-center and workspace current-month forecast revenue use the same pure calculation: completed revenue through yesterday divided by completed natural days through yesterday, then projected across the full month. Today's partial revenue remains visible only in actual/live figures.
- Historical months use full-month actual revenue; future months have no forecast. Cost configuration and correction rules are unchanged.
- The selected store-center month is encoded as `?month=YYYY-MM` when entering a workspace. Workspace month changes update the route, and returning to the center retains the same month.
- Database/schema/backfill impact: none. Production deployment completed on 2026-11-09 with a full application snapshot and two scoped backend rollback points.
- Verification: production read-only diagnosis reproduced differences up to CNY 27,035.35; post-deploy reconciliation returned zero forecast-revenue, elapsed-day and forecast-profit difference across all 17 ranking records; server/web typecheck, build, V2 regression/boundary checks, lint (existing warnings only), diff checks, artifact hashes, service health and migration status pass.

## Team handoff checklist

Every dashboard change must record:

- branch/commit and changed modules;
- metric codes and definitions added or changed;
- database migration and backfill impact;
- collector endpoints and sample evidence used;
- verification run and unresolved assumptions;
- rollback notes for schema, collector, or calculation changes.

## 2026-10-16 weekly completion

- Branch: feature/weekly-report-completion.
- Metric definitions changed: none. The weekly contract now registers the already-defined monthly metric catalog instead of omitting unavailable groups.
- Database migration/backfill: none.
- Collector endpoint impact: none; no new source field was interpreted.
- Verification: metric helper regression, TypeScript typecheck, lint, build, V2 regression, and boundary checks.
- Rollback: revert the application commit; there is no schema or data rollback.

## 2026-10-19 generated-report completion

- Supersedes the live/in-progress-period presentation above for the single-store weekly/monthly report UI. The earlier endpoints remain route-compatible, but now return the latest persisted report for the selected completed period.
- Store adds `V2OperationsReport` through migration `20261019093000_add_v2_operations_reports`; no production migration or historical backfill is authorized by this change.
- DATAN adds `GET /bridge/bluecat/v1/operations/report-source` and the `members` task-control module. Store consumes only this versioned V1 contract and persists calculated report payload plus source coverage summary.
- Weekly and monthly templates share calculations but have separate row sets. Monthly includes cigarettes, total monthly income, and daily-new-member count; weekly follows the supplied weekly layout.
- The UI no longer exposes missing-day diagnostics or permits value editing. It supports full-report PNG export and a super-administrator generation dialog with explicit resynchronization choice.
- Deferred non-blocking details: privilege-member attribution, whether online-new is a strict subset of new BlueCat members, and whether X net-fee group-purchase income already contains every redemption class. These rules are isolated for later refinement.
- Verification: Prisma generation, TypeScript typecheck, lint (existing warnings only), V2 regression/boundary checks, server/web production builds, and Python bytecode compilation for the Bridge producer.
- Rollback: revert both application changes; if the migration has been applied, retain the additive report table or remove it only through a separately approved migration after confirming no report audit data is required.
- Production deployment: weekly/monthly reporting was deployed on 2026-10-19 and low-frequency machine-base synchronization on 2026-10-20, each after verified DATAN/Store database and application backups. Migration `20261019093000_add_v2_operations_reports` is applied. The first production machine sync updated all 16 mapped active stores with no skips, including 82 machines for `AQXH-3037`. Protected regeneration/UI/image acceptance still requires a normal super-administrator browser session.

## 2026-11-02 report refinement phase 1

- Product rows use the source-period display-category totals, with maintained current/historical name rules and an `附加商品` fallback that preserves every unmatched amount. Manual X Manager export is not part of report generation.
- `NEW_MEMBER_COUNT`, its daily average, new-member share, and online-new share use BlueCat plus Goddess/Student privilege-card additions. `NEW_PRIVILEGE_MEMBER_COUNT` remains a breakdown.
- Income composition uses total revenue as its denominator: X subtotal less cash, OTA platform face values, optional remaining OTA value, and cash reconcile to 100% when both source modules are complete.
- `NEW_PREMIUM_MEMBER_COUNT` is removed because the available X field is attributed to the card-issuing store rather than the upgrade store.
- Database migration/backfill: none. Previously generated snapshots remain unchanged until an explicit regeneration.
- Verification: server/web typecheck, server lint (existing warnings only), V2 regression, and boundary checks.
- Rollback: revert the report calculation and presentation changes; no schema or data rollback is required.
