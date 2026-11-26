# DATAN / Store 数据边界核对（2026-10-10）

## 结论与冻结范围

本文件记录负责人确认后的现状核对和拟调整方案。本轮不修改同步代码、数据库结构、业务口径或生产数据；在负责人确认方案前，暂停扩展 DATAN 数据关联功能。

> 2026-10-10 更新：负责人已复核通过第一阶段并授权第二阶段。第二阶段已将实时收入、商品分类、商品销售/剔除基础事实和充值流水能力迁移到版本化 Bridge；商品退款、状态、分类和时间窗口剔除由 Store 计算。DATAN 当前只有充值日汇总而没有来源级逐笔流水，因此新版流水契约明确返回不可用警告，不伪造交易；逐笔采集留待第三阶段任务控制面完成后接入。

唯一允许的数据流向为：第三方平台 → DATAN-platform → 版本化 BlueCat Bridge API → 本系统 V2 业务快照/事实 → 业务计算 → 前端。

当前实现**未完全满足**该边界，主要冲突是自动建店、两套映射/快照并存、旧接口直连、查询隐式同步、任务控制契约缺失以及契约元数据不完整。

## 1. 全部 DATAN / Bridge 调用点

| 调用位置 | 当前接口 | 用途 | 判定 |
| --- | --- | --- | --- |
| `v2-operations.service.ts:2489` | `/bridge/bluecat/v1/stores` | V2 门店发现 | 正式接口，但消费行为违规：自动建店/建组织 |
| `v2-operations.service.ts:2556` | `/bridge/bluecat/v1/revenue/settled` | 日结收入快照 | 正式接口；缺少契约版本强校验 |
| `v2-operations.service.ts:2570` | `/bridge/bluecat/v1/shifts` | 班次收入快照 | 正式接口；缺少契约版本强校验 |
| `v2-operations.service.ts:2577` | `/bridge/bluecat/v1/ota/daily` | OTA 日对账快照 | 正式接口；缺少契约版本强校验 |
| `v2-operations.service.ts:2584,2595` | `/bridge/bluecat/v1/ota/products` | OTA 商品 | 正式接口；后者附带 `snbid` 查询参数 |
| `v2-operations.service.ts:2603` | `/bridge/bluecat/v1/ota/redemptions` | OTA 核销事实 | 正式接口；缺少契约版本强校验 |
| `v2-operations.service.ts` | `/bridge/bluecat/v1/revenue/live` | 当日最近一次已落库收入快照 | 第二阶段已替换；读取不触发采集 |
| `v2-operations.service.ts` | `/bridge/bluecat/v1/products/categories` | 来源商品分类 | 第二阶段已替换 |
| `v2-operations.service.ts` | `/bridge/bluecat/v1/products/sales` | 商品销售基础事实 | 第二阶段已替换；剔除金额改由 Store 计算 |
| `v2-operations.service.ts:44-50,2418-2477` | `/tasks/*` | 收入、充值、OTA、商品、上机、班次、门店采集控制 | 无独立版本化任务控制客户端；需鉴权、审计、幂等和并发契约 |
| `v2-recharge-contest.service.ts` | `/bridge/bluecat/v1/recharge/flows` | 充值逐笔流水能力 | 第二阶段已切换契约；来源未采集时显式不可用，不使用日汇总替代 |
| `performance.service.ts:1005-1469` | 未版本化 `/bridge/bluecat/stores`、`daily-actuals`、`shift-actuals`、`sync-health` | 历史业绩链路 | 历史兼容链路，仅可冻结和退出，不得扩展 |
| `performance.service.ts:1367` | `/tasks/product-sales/sync` | 健康检查时触发商品采集 | 查询/复检触发采集，且任务控制契约不足 |
| `app.config.ts`、`.env.production.example` | `BLUECAT_BRIDGE_BASE_URL` | Bridge 服务地址 | 可保留，但客户端应明确区分只读 Bridge 与任务控制基址/凭据 |

历史采集部署补丁 `deploy/web-data-platform-v2` 已在最终清理中移除。门店系统仓库不再保存、构建或运行 DATAN 采集代码。

## 2. 映射模型使用位置

### `StoreExternalMapping`（历史兼容）

- Schema：`prisma/schema.prisma:586`。
- 服务读写：`performance.service.ts:958,992,1029,1051,1489`。
- API：`performance.controller.ts:153-190`。
- 页面/API 客户端：`apps/web/src/api/performance.ts:325-372`、`BridgeMappingsView.vue`。
- 现状：同步未版本化门店接口，按外部 ID、分支 ID 或名称自动匹配旧 `Store`；写入旧业绩快照。
- 处理原则：立即冻结新增能力，保留只读兼容；制定迁移/停用计划，不能作为第二套正式映射。

### `V2DataSourceConnection`（唯一拟正式映射）

- Schema：`prisma/schema.prisma:1899`，同时约束 `storeId` 唯一及 `[sourceSystem, externalStoreId]` 唯一。
- 服务使用：`v2-operations.service.ts:101,557,613,665,754,821,2380-2603,2937,3127`。
- 充值赛事使用：`v2-recharge-contest.service.ts:126`。
- 现状问题：`discoverStoresForActor` 自动 upsert 组织、按 `externalStoreId` 生成门店编码、创建正式 `V2Store` 并自动建立连接；与“新门店仅待匹配”规则冲突。
- 拟调整：发现结果进入独立待匹配记录/状态；只有现有正式门店流程确认后才能创建或修改 `V2DataSourceConnection`。关闭门店不自动恢复。

## 3. 旧快照与 V2 快照

| 体系 | 写入入口 | 主要读取入口/页面 | 状态与退出方向 |
| --- | --- | --- | --- |
| `StorePerformanceActualSnapshot` | `performance.service.ts:1125`；种子 `seed.ts:1001` | `performance.service.ts` 月业绩、旧 `PerformanceView.vue` | 历史兼容；停止从 DATAN 扩展，明确只读期和迁移核对 |
| `StorePerformanceShiftActualSnapshot` | `performance.service.ts:737,1213` | `performance.service.ts:887`；`ShiftDashboardView.vue`、旧拆分页面 | 历史兼容；不得与 V2 同时承担正式计算 |
| `StorePerformanceEstimateSnapshot` | 旧业绩估算/拆分服务 | 旧业绩与班次页面 | 非 DATAN 原始快照，但属于旧计算体系，需随旧链路一起盘点 |
| `V2RevenueSnapshot` | `v2-operations.service.ts:787,797` | `storePerformance`、排名、经营看板、月报服务、门店工作台/运营看板 | 拟正式来源 |
| `V2OtaDailySnapshot` | `v2-operations.service.ts:581` | `storePerformance`/OTA 对账 | 拟正式对账来源，不与核销事实重复计收 |
| `V2OtaRedemption` | `v2-operations.service.ts:719` | 月报、经营看板、OTA 中心、门店工作台 | 拟正式 OTA 事实 |
| `V2ShiftRevenueSnapshot` | `v2-operations.service.ts:853` | 班次表现、拆分、门店工作台 | 拟正式班次事实 |
| `V2ProductExclusionSnapshot` | `v2-operations.service.ts:3158,3201` | 月报、经营看板、商品剔除中心 | 业务规则结果应留在 Store；来源采集须改为版本化基础事实 |

正式前端消费者包括 `/v2/operations-dashboard`、`V2StoreWorkspaceView.vue` 的运营月报/业绩/OTA/剔除区域，以及 `V2StoreCenterView.vue` 的门店排名。旧消费者包括 `PerformanceView.vue`、`ShiftDashboardView.vue`、`PerformanceSplitsView.vue`、`BridgeMappingsView.vue`。

## 4. 自动创建、隐式采集和绕过入口

1. `discoverStoresForActor` 自动创建 `BLUECAT_HQ`、创建 `V2Store`、使用外部 ID 作为正式编码并直接建立连接，必须停用并改为待匹配流程。
2. `V2XManagerSyncService.initialSync` 启用时自动调用门店发现，继而触发上述自动建店逻辑。
3. `otaCenter` 在普通 GET 查询发现商品为空时隐式调用 `syncStoreOtaProducts`。
4. `productExclusionCenter` 在普通 GET 查询发现分类为空时隐式调用 `syncStoreProductCategories`。
5. `performance.service.ts` 的健康复检可能触发 `/tasks/product-sales/sync`。
6. V2 Controller 曾暴露直接接收 `rows` 的四个 `x-manager/revenue/*` 写入接口；最终验收已删除这些 Controller 入口，数据转换方法仅供正式 Bridge 同步流程内部调用。
7. `sourcePayload` 当前保存 Bridge 返回对象，而 V1 Bridge 部分字段仍近似第三方原始 payload；需改为保存标准化契约载荷/引用，不能把第三方原始 payload 直接传播进业务系统。

## 5. 拟调整清单（待负责人确认后实施）

### 阶段 A：先收口风险（已完成，待负责人检查）

1. 保持自动同步配置关闭；在代码层禁止门店发现自动建店、自动恢复或自动编码。
2. 移除 GET 查询中的隐式同步；只显示缺失/过期状态，由明确的受权操作触发同步。
3. 为 Bridge V1 建立强类型响应并校验 `contractVersion`、业务时间、金额、`externalStoreId`、来源标识/哈希、采集时间和质量警告；未知版本拒绝入库。
4. 暂停旧 `/v2/x-manager/*` 和 `/tasks/*` 调用的新增使用。

### 阶段 B：统一映射与任务控制

1. 将 `/v1/stores` 发现结果保存为待匹配候选，不创建正式组织/门店；由正式门店流程确认后写入 `V2DataSourceConnection`。
2. 设计独立、版本化的任务控制契约，包含服务鉴权、Store 权限、审计记录、幂等键、并发锁和状态查询；与只读 Bridge 客户端分离。
3. 为 live、商品分类、商品基础事实、充值流水提供负责人确认后的版本化 Bridge 契约；业务分类与剔除计算保留在 Store。

### 阶段 C：旧链路退出

1. 盘点旧快照与 V2 快照的月份/门店覆盖并形成只读对账，不重算、不覆盖。
2. 经负责人确认切换日期后，停止 `StoreExternalMapping`、未版本化 Bridge 自动同步和旧快照写入。
3. 前端旧页面改为只读历史或迁移至 V2；验证完成后再单独申请删除旧代码/表和历史部署补丁。

## 6. 数据库、兼容与回滚

- 本轮数据库影响：无；无迁移、无数据修正、无回填。
- 后续预计需要“待匹配门店”、契约版本/来源记录标识/质量状态、任务控制审计等字段或模型；必须另行设计 Prisma migration 并获批。
- 兼容策略：生产仍保持现状且自动链路默认关闭；旧表和旧 API 在迁移期只读保留，V2 写入切换需使用功能开关和双读对账，禁止双写后同时参与正式计算。
- 回滚策略：代码切换按独立提交/功能开关回退；数据库只做向前兼容新增，不先删旧字段/表；原始 DATAN 数据不改动。

## 7. 需要负责人确认

1. 待匹配门店是否新建独立表，还是以 `V2DataSourceConnection` 的可空 `storeId` 重构承载（当前 `storeId` 非空且唯一）。
2. 旧业绩页面和旧快照的最终停用日期、历史只读期限及是否需要一次性迁移。
3. 当日 live、充值流水、商品分类/明细的 V1 契约范围与业务时间定义。
4. V2 Controller 直接 ingest 接口已下线，不保留外部兼容入口。
5. 任务控制契约的认证方式、调用主体、审计字段和允许页面。
6. `deploy/web-data-platform-v2` 历史补丁已移除；DATAN 保持独立构建、部署和回滚。
7. 现有本地 V2 回填数据是否仅保留为开发验证数据；本轮不修改或清理。
