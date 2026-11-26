# Data Collection Service Boundary

Last updated: 2026-10-10

## Repository ownership

- Business system: `kang360970725/bluecat-store-system-v2`.
- Collection service: `kang360970725/DATAN-platform`.
- Current collector integration branch: `dev`.

The repositories have independent dependencies, databases, release cycles, CI, secrets, and production processes.

The business-system repository must not reference or contain `DATAN-platform` through a Git submodule, subtree, vendored copy, deployment directory, package dependency, or runtime checkout. Developers clone the repositories as siblings when both are needed locally; production deploys and rolls them back independently.

## Responsibility split

`DATAN-platform` owns:

- third-party login, QR login, cookies, browser storage state, and session health;
- Playwright/API collection and scheduling;
- immutable/versioned raw source records;
- normalization needed to expose a stable Bridge contract;
- the collection database and collection operations dashboard.

`bluecat-store-system-v2` owns:

- external-store to business-store mappings;
- pulling versioned Bridge responses;
- idempotent business snapshots and facts;
- business classifications, permissions, finance, payroll, and user-facing operations;
- data freshness and synchronization-health presentation.

## Integration contract

The business system calls the collector over a private network. The current Bridge endpoints are:

- `GET /bridge/bluecat/v1/stores`
- `GET /bridge/bluecat/v1/revenue/settled?date=YYYY-MM-DD`
- `GET /bridge/bluecat/v1/shifts?start=YYYY-MM-DD&end=YYYY-MM-DD`
- `GET /bridge/bluecat/v1/ota/daily?date=YYYY-MM-DD`
- `GET /bridge/bluecat/v1/ota/redemptions?date=YYYY-MM-DD`
- `GET /bridge/bluecat/v1/ota/products`
- `GET /bridge/bluecat/v1/revenue/live?date=YYYY-MM-DD`
- `GET /bridge/bluecat/v1/recharge/flows?...`
- `GET /bridge/bluecat/v1/products/categories?...`
- `GET /bridge/bluecat/v1/products/catalog?...`
- `GET /bridge/bluecat/v1/products/sales?...`
- `GET /bridge/bluecat/v1/session/status`
- `POST /bridge/bluecat/v1/tasks/sync`

No Store runtime code may call unversioned Bridge, `/tasks/*`, `/v2/x-manager/*`, collector authentication endpoints, or collector database tables. Read and task-control tokens are separate secrets. Task requests carry request ID, idempotency key and operator identity; DATAN persists status, counts and errors and rejects same-scope concurrency.

Bridge consumers must upsert by stable business identity and must never accumulate repeated responses blindly.

The Bridge `v1` path is the current integration contract version, not the removed legacy Store business implementation. OTA product catalog and recharge bill-flow capability still return explicit warnings until their source collectors exist; values are never fabricated.

## Mapping migration and rollback

Migration `20261011110000_consolidate_external_store_mappings` first records all legacy external IDs as V2 candidates, copies only resolvable confirmed mappings into `V2DataSourceConnection` without overwriting existing V2 bindings, then renames the old table to `legacy_store_external_mappings_archive`. Unmatched, closed-store, duplicate, or otherwise conflicting rows remain reviewable and are not auto-bound. Rollback is code rollback plus renaming the archive table back; production execution requires a separate approval and verified backup.

## Change protocol

1. Make collection implementation changes in `DATAN-platform`.
2. For breaking response changes, introduce a versioned endpoint or maintain backward compatibility.
3. Update the collector contract and fixtures first.
4. Update this repository's client, shared types, mapping, and regression checks in a separate PR.
5. Deploy the backward-compatible producer before the consumer; remove old contract support only after both sides are verified.

## Security boundary

Never copy collector `.env` files, credentials, cookies, signed parameters, storage state, database files, raw employee/customer data, virtual environments, or browser profiles into this repository. Exchange production configuration only through an approved secure channel.

## Local development

Developers clone the repositories as siblings and start them independently. The business system points its Bridge base URL to the local collector, normally `http://127.0.0.1:8001`.
