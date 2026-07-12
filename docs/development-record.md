# 开发记录

## 1. 文档用途

本文档用于沉淀项目的关键决策、约束、当前状态和后续行动项，便于在新的会话窗口中快速恢复上下文。

## 2. 项目状态

当前状态：`已完成登录鉴权、门店基础模型、岗位权限与门店数据范围基线`

当前项目目录：`/Users/allen/Desktop/BlueCat-App/newObject/blueCat-StoreSystem`

## 3. 本轮已确认决策

### 3.1 项目形态

- 新项目：`blueCat-StoreSystem`
- 单仓维护
- 前后端放在同一个项目仓库中
- 数据库独立运行，不通过 Docker 启停

### 3.2 前端策略

- PC 和移动端共用一个前端应用
- 不拆成两个独立前端系统
- 使用响应式和场景化布局适配双端
- 业务逻辑、接口层、状态管理、路由体系统一

### 3.3 后端策略

- 后端采用 `Node.js + NestJS`
- 采用模块化单体，不上微服务
- 后续如模块规模扩大，再按领域拆分

### 3.4 数据库策略

- 使用 `MySQL`
- 本地数据库名：`store_system_db`
- 数据库名通过配置指定
- 应用通过环境配置连接数据库
- 数据库不纳入容器启动与停止管理
- 数据模型变更统一使用 `Prisma` 管理
- 每次涉及数据库结构调整时，默认同步生成 Prisma migration 迁移记录

### 3.6 开发记录策略

- 每轮开发改动都需要同步补充到 `docs/development-record.md`
- 涉及数据库、迁移、模块状态、启动方式、验证结果的变化必须记录
- 该文档作为后续新会话窗口的首要续接依据，避免依赖口头补充

### 3.5 UI 与体验策略

- 前期即引入成熟且视觉较好的前端 UI 方案
- 当前建议采用 `Naive UI`
- 前端使用 `Vue 3 + UnoCSS` 作为双端适配基础

## 4. 当前建议技术栈

### 4.1 前端

- `Vue 3`
- `TypeScript`
- `Vite`
- `Vue Router`
- `Pinia`
- `UnoCSS`
- `Naive UI`

### 4.2 后端

- `Node.js`
- `NestJS`
- `Prisma`
- `Swagger / OpenAPI`
- `JWT + Refresh Token`
- `BullMQ`
- `Redis`

### 4.3 数据与部署

- `MySQL 8`
- `Redis`
- `Nginx`
- `PM2` 或 `systemd`

## 5. 已创建目录

```text
blueCat-StoreSystem/
  apps/
    web/
    server/
  packages/
    shared/
  prisma/
  docs/
  scripts/
```

## 6. 目标业务模块

- 登录与鉴权
- 账号与权限系统
- 会员系统
- 组织与门店管理
- 商品管理
- 套餐管理
- 班次管理
- 月度任务计划
- 订单与履约
- 系统配置
- 报表统计

## 7. 当前工程状态

以下内容已初始化：

- 前端 Vue 工程骨架
- 后端 NestJS 工程骨架
- Prisma schema 基础模型
- ESLint / Prettier 基础配置
- 前端统一请求层
- 登录鉴权基础模块
- 数据库种子数据脚本
- JWT Strategy 与基础接口守卫
- 响应式登录页 UI
- 权限码装饰器与权限 Guard
- 门店基础 CRUD 后端接口
- 组织基础 CRUD 后端接口
- IAM 用户、角色、权限基础 CRUD 后端接口
- 网咖门店扩展模型：员工、门店区域/包厢、区域会员价格体系
- 网咖门店前端基础页面：门店资料、门店员工、区域与价格
- 岗位模型与岗位权限关联
- 门店数据范围基础约束：超级管理员查看全部门店，店长/负责人按关联门店访问
- 门店月度业绩指标模块：目标、成本、实际达成、预估达成、达成率、进度、排名、毛利润
- 门店业绩拆分模块基础能力：月目标拆分状态、默认白班/晚班、每日班次网费/商品目标拆分、当班看板基础数据
- 门店排班模块基础能力：按日期、班次、收银/外场/机动岗维护员工排班
- 门店评分模块基础能力：计分项目配置、门店月度得分录入、项目得分上限/下限校验

以下内容尚未完成：

- Refresh Token 续期接口
- 更细粒度的数据范围策略配置页面
- 第三方平台实际业绩同步任务
- 业绩拆分计划模块与预估达成同步任务
- 正式绩效分排名规则与排名页面
- 门店评分项目公式自动计算逻辑

已验证：

- `pnpm install`
- `pnpm prisma:generate`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- `pnpm prisma:migrate --name init_base_schema` 已成功执行，生成并应用首次迁移 `20260708065348_init_base_schema`
- `pnpm db:seed` 已成功执行，生成默认组织、默认门店、超级管理员角色、基础权限和管理员账号
- `pnpm dev` 已成功启动前后端开发服务
- `POST /api/auth/login` 已验证可使用数据库账号 `admin / admin123` 登录
- 未携带 token 访问 `GET /api/stores` 已验证返回 `401`
- 端口已调整并验证：前端 `8080`，后端 `3001`
- `POST http://127.0.0.1:3001/api/auth/login` 已验证可登录
- `http://127.0.0.1:8080/` 已验证返回 `200`
- 登录页响应式科技风 UI 已完成，已验证 `pnpm --filter @bluecat/web lint`
- 登录页响应式科技风 UI 已完成，已验证 `pnpm --filter @bluecat/web typecheck`
- 登录页响应式科技风 UI 已完成，已验证 `pnpm --filter @bluecat/web build`
- 已修复登录页空白问题：在 `apps/web/src/main.ts` 全局注册 Naive UI，确保 `n-message-provider` 可用
- 登录页主标题已调整为 `蓝猫电竞·门店运营系统`
- 登录页登录按钮已恢复 Naive UI 原配色，仅修复基础样式 `background-color: transparent` 导致的透明背景问题
- 登录页 H5 顶部视觉区已压缩，并使用 `100svh` 与滚动容器适配系统键盘弹起场景
- 登录页 H5 底部已补充安全状态与系统信息区，避免键盘未弹起时底部留白突兀
- 权限码 Guard 已完成并接入 `iam`、`store` 接口
- 门店接口已完成列表、创建、更新、软删除
- `pnpm db:seed` 已重新执行，补充 `store:create`、`store:update`、`store:delete` 权限码
- 组织接口已完成列表、创建、更新、软删除，删除前校验下级组织和门店
- IAM 接口已完成权限、角色、用户的列表、创建、更新、软删除
- `pnpm db:seed` 已重新执行，补充组织、权限、角色、用户 CRUD 权限码
- `pnpm prisma:migrate --name add_net_cafe_store_model` 已成功执行，生成并应用迁移 `20260708114429_add_net_cafe_store_model`
- 门店模型已扩展机器数量、经纬度、经理员工、负责人员工
- 已新增员工表 `employees`，员工可选关联系统账号 `users`
- 已新增门店区域/包厢表 `store_areas`，记录区域等级、机器数量、显卡、CPU、显示器
- 已新增区域价格表 `store_area_prices`，按区域和会员价格等级维护价格
- 会员价格等级已建模：临时卡、普通会员、蓝猫会员、超凡会员、冠绝会员、白金会员、黑金会员、神话会员
- 门店模块已补充员工、区域/包厢、区域价格维护接口
- `pnpm db:seed` 已重新执行，写入默认店长、`卓威360单包`、完整会员价格样例和新增权限码
- 前端已补充门店管理菜单：门店资料、门店员工、区域与价格
- 前端已补充门店资料页面，支持门店基础字段、机器数量、经纬度、经理/负责人维护
- 前端已补充门店员工页面，支持员工基础资料维护
- 前端已补充区域与价格页面，支持区域/包厢配置和会员等级价格维护
- 前端全局样式已为 Naive UI `.n-button` 增加背景色兜底，避免基础 reset 的透明背景影响按钮显示
- 前端已补充路由鉴权守卫：未登录访问业务页自动跳转登录页，并携带 `redirect`
- 前端请求层已补充 401 统一处理：非登录接口返回 401 时清理 session 并跳转登录页
- `pnpm prisma:migrate --name add_position_and_store_scope` 已成功执行，生成并应用迁移 `20260709111408_add_position_and_store_scope`
- 已新增岗位表 `positions` 与岗位权限关联表 `position_permissions`
- 员工表 `employees` 已新增 `position_id`，支持员工关联岗位；原 `position` 文本字段暂保留用于兼容展示
- 登录态 `CurrentUser` 已新增 `employeeId`、`positionId`、`accessibleStoreIds`
- 登录鉴权已合并角色权限与员工岗位权限；旧 token 缺失新字段时后端会使用默认值兜底
- 门店列表已接入数据范围：超级管理员可查看全部门店，非超管仅查看所属门店、作为店长管理的门店、作为负责人负责的门店
- 门店新增/删除已限制为超级管理员；非超管在拥有权限码时可维护自己可访问门店资料
- 员工列表和区域列表已支持按 `storeId` 筛选，并在后端按当前用户可访问门店二次校验
- 员工新增/编辑已校验目标门店范围，并支持关联岗位
- 区域新增/编辑/删除和价格维护已校验目标门店范围；非超管新增区域未传门店时默认关联当前账号可访问的第一个门店
- IAM 模块已新增岗位接口：`GET/POST/PATCH/DELETE /api/iam/positions`
- `pnpm db:seed` 已重新执行，写入默认岗位 `store_manager`、`store_responsible`、`store_staff`
- `pnpm db:seed` 已重新执行，补充岗位权限码和岗位权限关联；默认店长岗位拥有门店、员工、区域和价格维护权限
- `pnpm db:seed` 已重新执行，新增默认门店管理账号 `manager / manager123`
- 前端门店资料页已支持编辑门店编号
- 前端门店员工页已支持按门店筛选，员工岗位改为关联岗位选择
- 前端区域与价格页已支持按门店筛选，新增区域默认使用当前筛选门店
- 前端已新增岗位权限页面 `/positions`，支持岗位与权限集合维护
- 前端侧边菜单已按当前登录人的权限做基础过滤，普通店长不展示系统岗位权限配置入口
- 本轮已验证：`pnpm lint`
- 本轮已验证：`pnpm typecheck`
- 本轮已验证：`pnpm build`
- 本轮菜单过滤调整后已再次验证：`pnpm --filter @bluecat/web lint`
- 本轮菜单过滤调整后已再次验证：`pnpm --filter @bluecat/web typecheck`
- 本轮菜单过滤调整后已再次验证：`pnpm --filter @bluecat/web build`
- `pnpm prisma:migrate --name add_store_performance_metrics` 已成功执行，生成并应用迁移 `20260709122327_add_store_performance_metrics`
- 已新增门店业绩手工目标表 `store_performance_targets`，按门店和月份维护月业绩目标与成本项
- 已新增第三方实际达成快照表 `store_performance_actual_snapshots`，用于后续第三方平台数据同步写入
- 已新增拆分计划预估达成快照表 `store_performance_estimate_snapshots`，用于后续业绩拆分计划统计写入
- 门店业绩模块计算规则已落地：总成本为成本项求和，成本占比为总成本 / 月业绩目标，毛利润为月业绩目标 - 总成本
- 门店业绩模块计算规则已落地：月达成率为实际达成 / 预估达成，当前进度为实际达成 / 月业绩目标，当前排名按月达成率降序计算
- 已新增业绩接口：`GET /api/performances/monthly?month=YYYY-MM`
- 已新增业绩接口：`PATCH /api/performances/monthly/:storeId?month=YYYY-MM`
- 已新增业绩接口：`POST /api/performances/monthly/:storeId/copy-costs?month=YYYY-MM`
- 已新增权限码：`performance:view`、`performance:update`
- 店长/负责人岗位默认仅授予 `performance:view`，可查看自己关联门店业绩数据但不可修改
- 超级管理员角色默认拥有 `performance:view`、`performance:update`，可查看全部门店并修改目标/成本
- `pnpm db:seed` 已重新执行，写入业绩权限码、默认 2026-07 业绩样例、2026-06 上月成本样例
- 2026-07 默认业绩样例中，预估达成按“月达成率 = 实际达成 / 预估达成”规则设置为 `286000`，避免沿用截图中疑似多位数展示造成计算冲突
- `pnpm db:seed` 已再次执行，更新默认业绩样例
- 前端已新增业绩指标页面 `/performance`，支持按月份查询、横向表格查看、红色目标展示、排名展示
- 前端业绩指标页面已支持管理账号编辑月业绩目标和成本项
- 前端业绩指标页面已支持一键沿用上一月成本数据
- 前端菜单已新增“业绩指标”，并按 `performance:view` 权限展示
- 前端“业绩指标”已调整为一级菜单，不归属在“门店管理”下
- 前端“业绩指标”已调整为独立二级菜单：`业绩管理 / 业绩指标`
- 前端业绩指标宽表已增加横向滚动容器，并限制内容区横向溢出，避免撑开页面
- 业绩指标“沿用上一月成本”已调整为仅代入表单数据，不直接保存；代入后仍支持即时修改，点击保存后才提交
- 业绩指标表格已支持点击列头排序：门店、目标、实际、预估、达成率、进度、排名、各成本项、总成本、成本占比、毛利润
- 业绩指标录入弹窗已优化视觉层级：顶部展示门店/月度、总成本、成本占比、毛利润；月业绩目标独立高亮；成本按固定运营、物料与福利、人员与平台、运营与财税分组展示
- 业绩指标录入弹窗已增加模块间距，降低目标区、规划区和成本分组之间的视觉拥挤
- 业绩指标查询月份已改为月份日历组件
- 业绩指标月份选择已从滚动式日期组件改为自定义全年月份面板，面板内一次展示当前年份 12 个月，并支持上一年/下一年切换
- 左侧手风琴菜单已接入当前路由同步：刷新或直接访问链接时会自动选中当前菜单项，并展开对应父级菜单
- `pnpm prisma:migrate --name add_performance_split_plan` 已成功执行，生成并应用迁移 `20260710112615_add_performance_split_plan`
- 月度业绩指标表 `store_performance_targets` 已新增 `net_fee_target`、`product_target`、`split_status`
- 已新增班次表 `work_shifts`，默认种子数据包含白班 `day`、晚班 `night`
- 已新增员工排班表 `employee_schedules`，用于后续员工排班系统按门店、员工、班次、日期维护排班
- 已新增业绩拆分计划表 `store_performance_split_plans` 和拆分明细表 `store_performance_split_items`
- 已新增班次实际达成快照表 `store_performance_shift_actual_snapshots`，用于后续实时同步网费/商品达成数据
- 已新增业绩拆分状态：`PENDING` 未拆分、`ACTIVE` 已生效；月业绩指标制定后未拆分时视为未生效
- 已新增拆分接口：`GET /api/performances/splits?storeId=...&month=YYYY-MM`
- 已新增拆分接口：`POST /api/performances/splits/:targetId/generate`
- 已新增拆分接口：`PATCH /api/performances/splits/items/:id`
- 已新增当班看板接口：`GET /api/performances/shift-dashboard`
- 业绩拆分生成规则已落地：按当月日期和默认班次生成拆分明细，周六/周日按上浮权重分摊，确保网费/月商品目标总额被完整拆分
- 权限码已新增：`performance-split:view`、`performance-split:update`
- 店长/负责人岗位默认仅拥有 `performance:view`、`performance-split:view`，可查看自己关联门店业绩和当班看板，不具备拆分修改权限
- 超级管理员角色默认拥有 `performance-split:update`，可生成/重生成拆分并修改拆分明细
- 门店业绩指标列表已展示拆分状态，并支持生成/重生成拆分；拆分后指标状态变为已生效
- 前端已新增当班看板页面 `/shift-dashboard`，展示本日各班次网费目标/已达成、商品目标/已达成、达成率、预计绩效分和月度总目标概览
- 业绩管理菜单已新增二级入口：`当班看板`
- `pnpm db:seed` 已重新执行，写入白班/晚班和拆分权限默认数据
- 根据拆分截图提取排班规律：同一天拆为白班、晚班两行；每个班次维护收银、外场、机动岗；周六/周日目标较工作日上浮；人员可按岗位列轮换排班
- `pnpm migrate dev --name add_schedule_roles` 因 Prisma 非交互 warning 未能直接生成，已手动补充等价迁移 `20260710120700_add_schedule_roles` 并使用 `prisma migrate deploy` 应用
- 排班表 `employee_schedules` 已新增岗位角色 `role`：`CASHIER` 收银、`FLOOR` 外场、`FLEX` 机动岗
- 排班唯一约束已调整为同一门店、同一日期、同一班次、同一岗位只能有一个员工排班
- 已新增排班接口：`GET /api/performances/schedules?storeId=...&month=YYYY-MM`
- 已新增排班接口：`POST /api/performances/schedules`
- 排班查询在门店当月无排班时会按日期、白班/晚班、收银/外场/机动岗和员工列表轮换生成默认排班，后续支持逐格修改
- 权限码已新增：`schedule:view`、`schedule:update`
- 店长/负责人岗位默认拥有 `schedule:view`，可查看排班；排班修改需 `schedule:update` 或超级管理员
- 业绩拆分表接口返回已补充每个班次的收银、外场、机动岗人员信息
- 前端已新增完整业绩拆分表页面 `/performance-splits`，按截图形态呈现日期、星期、班次、收银、外场、机动岗、目标、实时达成、达成率，并支持逐班次编辑网费/商品目标
- 前端已新增门店排班页面 `/schedules`，按日期、星期、班次、收银、外场、机动岗展示和编辑排班
- 门店排班页面已从“下拉后立即保存”改为“本地草稿编辑 + 保存排班按钮统一提交”
- 门店排班页面月份选择已改为与业绩指标一致的全年月份面板，支持上一年/下一年切换和 12 个月快速选择
- 业绩拆分表页面月份选择已改为与业绩指标一致的全年月份面板，支持上一年/下一年切换和 12 个月快速选择
- 业绩拆分表列表已优化呈现密度和分组识别：表格字号、行高、单元格内边距收紧；按日期交替底色；每天首行加分组边界；白班/晚班用不同标签和轻微底色区分；周末行增加左侧强调线
- 已修复业绩指标“重拆分”接口 500：原因是拆分计划表存在 `target_id` 和 `store_id + month` 唯一约束，原逻辑软删除旧计划后再创建新计划会与软删除记录冲突；现改为复用原拆分计划，更新计划并重建拆分明细，避免唯一约束冲突
- 根据门店评分截图提取计分维度：店经理评比、优秀门店、卫生标兵、金牌客服、王牌销冠、稽核冠军、突击精英
- `pnpm prisma:migrate --name add_store_scoring_model` 已成功执行，生成并应用迁移 `20260711111138_add_store_scoring_model`
- 已新增计分项目表 `score_items`，支持分类、项目编码、项目名称、说明、公式备注、最高分、最低分、排序和启用状态
- 已新增门店月度得分表 `store_score_entries`，按门店、月份、计分项目录入原始值、得分和备注；同一门店同一月份同一项目唯一
- 已新增评分接口：`GET /api/scoring/items`
- 已新增评分接口：`POST /api/scoring/items`
- 已新增评分接口：`PATCH /api/scoring/items/:id`
- 已新增评分接口：`GET /api/scoring/monthly?month=YYYY-MM`
- 已新增评分接口：`POST /api/scoring/entries`
- 已新增评分权限码：`scoring:view`、`scoring:update`、`scoring:config`
- 店长/负责人岗位默认拥有 `scoring:view`，可查看评分；评分录入和计分项目配置需 `scoring:update`、`scoring:config` 或超级管理员
- `pnpm db:seed` 已重新执行，写入门店评分权限和默认计分项目
- 默认计分项目已按截图拆分：店经理评比含日常扣分/加分、业绩达成、稽核、高级会员、投诉扣分；优秀门店含任务达成率、稽核、问卷、神访、其他得分；分项评比含卫生标兵、金牌客服、王牌销冠、稽核冠军、突击精英
- 计分项目支持设置得分上限/下限；录入得分时后端会校验得分不能超过上限或低于下限
- 前端已新增门店评分页面 `/store-scoring`，支持按月查看门店评分矩阵，并录入原始值、得分和备注
- 业绩管理菜单已新增二级入口：`门店评分`
- 业绩管理菜单已新增二级入口：`业绩拆分表`、`门店排班`
- 业绩指标已支持“新增规划”，可提前创建下月或未来月份的门店业绩数据
- 业绩指标新增时支持先选门店再选月份；该门店已有数据的月份会在月份组件中置灰禁选
- 后端已新增业绩创建接口 `POST /api/performances/monthly`，并显式校验同一门店同一月份只能存在一条未删除业绩指标数据
- 后端已新增已有月份查询接口 `GET /api/performances/monthly/existing-months?storeId=...`
- 本轮业绩指标模块已验证：`pnpm lint`
- 本轮业绩指标模块已验证：`pnpm typecheck`
- 本轮业绩指标模块已验证：`pnpm build`
- 本轮业绩指标样例修正后已验证：`pnpm --filter @bluecat/server lint`
- 本轮业绩指标样例修正后已验证：`pnpm --filter @bluecat/server typecheck`
- 本轮业绩指标菜单层级调整后已验证：`pnpm --filter @bluecat/web lint`
- 本轮业绩指标菜单层级调整后已验证：`pnpm --filter @bluecat/web typecheck`
- 本轮业绩指标二级菜单与宽表滚动修复后已验证：`pnpm --filter @bluecat/web lint`
- 本轮业绩指标二级菜单与宽表滚动修复后已验证：`pnpm --filter @bluecat/web typecheck`
- 本轮业绩指标沿用成本与列排序调整后已验证：`pnpm --filter @bluecat/server lint`
- 本轮业绩指标沿用成本与列排序调整后已验证：`pnpm --filter @bluecat/server typecheck`
- 本轮业绩指标沿用成本与列排序调整后已验证：`pnpm --filter @bluecat/web lint`
- 本轮业绩指标沿用成本与列排序调整后已验证：`pnpm --filter @bluecat/web typecheck`
- 本轮业绩指标沿用成本与列排序调整后已验证：`pnpm --filter @bluecat/web build`
- 本轮业绩指标录入表单视觉优化后已验证：`pnpm --filter @bluecat/web lint`
- 本轮业绩指标录入表单视觉优化后已验证：`pnpm --filter @bluecat/web typecheck`
- 本轮业绩指标录入表单视觉优化后已验证：`pnpm --filter @bluecat/web build`
- 本轮业绩指标新增规划和月份禁选调整后已验证：`pnpm --filter @bluecat/server lint`
- 本轮业绩指标新增规划和月份禁选调整后已验证：`pnpm --filter @bluecat/server typecheck`
- 本轮业绩指标新增规划和月份禁选调整后已验证：`pnpm --filter @bluecat/web lint`
- 本轮业绩指标新增规划和月份禁选调整后已验证：`pnpm --filter @bluecat/web typecheck`
- 本轮业绩指标新增规划和月份禁选调整后已验证：`pnpm --filter @bluecat/web build`
- 本轮业绩指标全年月份面板调整后已验证：`pnpm --filter @bluecat/web lint`
- 本轮业绩指标全年月份面板调整后已验证：`pnpm --filter @bluecat/web typecheck`
- 本轮业绩指标全年月份面板调整后已验证：`pnpm --filter @bluecat/web build`
- 本轮左侧菜单路由同步修复后已验证：`pnpm --filter @bluecat/web lint`
- 本轮左侧菜单路由同步修复后已验证：`pnpm --filter @bluecat/web typecheck`
- 本轮业绩拆分基础能力已验证：`pnpm --filter @bluecat/server lint`
- 本轮业绩拆分基础能力已验证：`pnpm --filter @bluecat/server typecheck`
- 本轮业绩拆分基础能力已验证：`pnpm --filter @bluecat/web lint`
- 本轮业绩拆分基础能力已验证：`pnpm --filter @bluecat/web typecheck`
- 本轮业绩拆分基础能力已验证：`pnpm build`
- 本轮完整拆分表和排班模块已验证：`pnpm --filter @bluecat/server lint`
- 本轮完整拆分表和排班模块已验证：`pnpm --filter @bluecat/server typecheck`
- 本轮完整拆分表和排班模块已验证：`pnpm --filter @bluecat/web lint`
- 本轮完整拆分表和排班模块已验证：`pnpm --filter @bluecat/web typecheck`
- 本轮完整拆分表和排班模块已验证：`pnpm build`
- 本轮门店排班批量保存调整后已验证：`pnpm --filter @bluecat/web lint`
- 本轮门店排班批量保存调整后已验证：`pnpm --filter @bluecat/web typecheck`
- 本轮门店排班批量保存调整后已验证：`pnpm --filter @bluecat/web build`
- 本轮门店排班月份面板调整后已验证：`pnpm --filter @bluecat/web lint`
- 本轮门店排班月份面板调整后已验证：`pnpm --filter @bluecat/web typecheck`
- 本轮门店排班月份面板调整后已验证：`pnpm --filter @bluecat/web build`
- 本轮业绩拆分表月份面板调整后已验证：`pnpm --filter @bluecat/web lint`
- 本轮业绩拆分表月份面板调整后已验证：`pnpm --filter @bluecat/web typecheck`
- 本轮业绩拆分表月份面板调整后已验证：`pnpm --filter @bluecat/web build`
- 本轮业绩拆分表密度和日/班次区分优化后已验证：`pnpm --filter @bluecat/web lint`
- 本轮业绩拆分表密度和日/班次区分优化后已验证：`pnpm --filter @bluecat/web typecheck`
- 本轮业绩拆分表密度和日/班次区分优化后已验证：`pnpm --filter @bluecat/web build`
- 本轮重拆分接口 500 修复后已验证：`pnpm --filter @bluecat/server lint`
- 本轮重拆分接口 500 修复后已验证：`pnpm --filter @bluecat/server typecheck`
- 本轮重拆分接口 500 修复后已验证：`pnpm --filter @bluecat/server build`
- 本轮门店评分模块已验证：`pnpm --filter @bluecat/server lint`
- 本轮门店评分模块已验证：`pnpm --filter @bluecat/server typecheck`
- 本轮门店评分模块已验证：`pnpm --filter @bluecat/web lint`
- 本轮门店评分模块已验证：`pnpm --filter @bluecat/web typecheck`
- 本轮门店评分模块已验证：`pnpm build`

## 7.1 当前启动命令

- 安装依赖：`pnpm install`
- 启动前后端：`pnpm dev`
- 单独启动前端：`pnpm dev:web`
- 单独启动后端：`pnpm dev:server`
- 生成 Prisma Client：`pnpm prisma:generate`
- 生成并执行数据库迁移：`pnpm prisma:migrate --name <migration_name>`
- 写入默认种子数据：`pnpm db:seed`

当前本地访问地址：

- 前端：`http://localhost:8080/`
- 后端：`http://localhost:3001/api`
- Swagger：`http://localhost:3001/api/docs`

## 8. 待确认业务问题

1. 是否存在总部 - 区域 - 门店组织层级
2. 会员系统是否包含等级、积分、余额、优惠券
3. 商品套餐是否涉及库存、预约、核销
4. 班次是否关联履约或服务人员调度
5. 月度任务计划按门店、按员工，还是双维度
6. 是否需要财务统计、提成、分账相关能力

## 9. 下一步建议

1. 补充 Refresh Token 续期接口
2. 实现第三方平台实际业绩同步任务，并写入 `store_performance_actual_snapshots` 和 `store_performance_shift_actual_snapshots`
3. 根据正式运营规则优化默认排班算法，例如按员工休息日、连续班次、岗位能力、跨店支援约束自动排班
4. 实现门店评分项目公式自动计算逻辑，并将当前手工录入项逐步替换为可计算项
5. 实现正式绩效分计算规则和绩效排名页面
6. 根据业务需求继续扩展会员、商品、套餐等模块
7. 后续如需记录价格历史，应在 `store_area_prices` 外增加调价记录表
8. 后续如需超级管理员以外的跨门店角色，应扩展自定义门店授权配置

## 10. 新会话承接入口

优先读取：

1. `docs/project-technical-solution-v1.md`
2. `docs/development-record.md`

## 11. 准备开工内容

已完成：

1. 初始化 `pnpm` monorepo 基础能力
2. 在 `apps/web` 创建 `Vue 3 + TypeScript + Vite` 前端工程
3. 接入 `Vue Router`、`Pinia`、`UnoCSS`、`Naive UI`
4. 建立前端基础目录：`api / components / layouts / router / stores / styles / utils / views / schemas`
5. 在 `apps/server` 创建 `NestJS` 后端工程
6. 接入 `Prisma`、`Swagger`、`class-validator`、`JWT`、`Redis`、`BullMQ`
7. 建立服务端基础目录：`modules / common / config`
8. 创建根目录环境配置文件模板，并打通前后端配置读取
9. 建立 `prisma/schema.prisma`，先定义基础连接与公共字段约定
10. 优先落地基础模块：`auth`、`iam`、`store`

下一步进入实际业务开发时，按以下顺序执行：

1. 补充 Refresh Token 续期接口
2. 实现第三方平台实际业绩同步任务
3. 实现业绩拆分计划模块
4. 根据业务需求继续扩展会员、商品、套餐等模块
5. 根据实际运营角色继续细化岗位权限模板

## 12. 首批开发目标

新会话进入开发后，第一阶段目标不是直接做全部业务，而是先完成以下基线：

- 前端工程可启动
- 后端工程可启动
- MySQL 连接可配置
- Redis 连接可配置
- Prisma 可执行迁移
- 登录鉴权基础链路可运行
- 权限与门店基础数据模型可落库

## 13. 新会话接手方式

在新窗口中开始开发时，建议先执行以下动作：

1. 打开项目目录：`/Users/allen/Desktop/BlueCat-App/newObject/blueCat-StoreSystem`
2. 先阅读：`docs/project-technical-solution-v1.md`
3. 再阅读：`docs/development-record.md`
4. 以“初始化工程骨架”为第一步开始，不要回到旧项目目录继续开发

## 14. 当前交接结论

当前已完成：

- 新项目目录已创建
- 技术方案文档已落地
- 开发记录文档已落地
- 基础目录结构已创建
- 根级基线文件已创建
- 前端应用骨架已创建
- 后端服务骨架已创建
- Prisma 基础模型已创建
- 首次 Prisma migration 已生成并应用：`prisma/migrations/20260708065348_init_base_schema/migration.sql`
- 网咖门店模型 Prisma migration 已生成并应用：`prisma/migrations/20260708114429_add_net_cafe_store_model/migration.sql`
- 登录接口已切换为数据库账号校验
- JWT Strategy 与基础接口守卫已创建
- 权限装饰器与权限码 Guard 已创建，并已应用到 `iam`、`store` 接口
- 门店后端 CRUD 已创建，删除采用 `deletedAt` 软删除
- 门店模型已扩展机器数量、地理位置、员工数统计、经理/负责人关联员工能力
- 门店模块已新增员工、区域/包厢、区域价格维护接口
- 前端门店管理已新增门店资料、门店员工、区域与价格页面
- 组织后端 CRUD 已创建，删除采用 `deletedAt` 软删除，并校验下级组织和门店
- IAM 用户、角色、权限后端 CRUD 已创建，用户密码使用 `bcryptjs` 加密
- 种子数据脚本已创建并执行，默认账号为 `admin / admin123`
- 种子数据已补充门店创建、更新、删除权限码
- 种子数据已补充组织、权限、角色、用户 CRUD 权限码
- 种子数据已补充默认店长、卓威360单包、会员价格体系和相关权限码
- 登录页已接入真实登录接口
- 登录页已完成桌面端与移动端响应式 UI 改造，采用简洁科技感视觉、信息侧栏和移动端单列布局
- 已修复 Naive UI 未注册导致 `useMessage` 找不到 `n-message-provider` 的运行时错误
- 登录页品牌标题已从 `BlueCat Store System` 改为 `蓝猫电竞·门店运营系统`
- 登录页登录按钮使用 Naive UI 原有颜色变量，补充常规、悬停、聚焦、按下态的 `background-color` 回填
- Naive UI 按钮背景色回填已上移到全局样式，登录页仅保留按钮尺寸与字重
- 前端鉴权链路已补齐路由守卫和接口 401 处理，避免未登录或 stale token 状态下业务接口持续报 401
- 登录页移动端顶部区域已压缩到更小高度，小屏进一步压缩，并减少表单垂直间距以适配键盘弹出后的可视区域
- 登录页移动端表单面板已补充底部状态区域，并通过剩余高度布局承接底部空间
- Nest dev 构建已切换为 webpack 模式，并补充 `ts-loader`，解决 workspace shared 源码导致的 `dist/main` 输出路径偏移问题
- 本地数据库名已确认为 `store_system_db`
- 已补充长期约束：数据库结构调整默认生成 Prisma migration
- 已补充长期约束：每轮开发改动同步维护开发记录文档
- 门店评分模块已新增并接入：计分项目、门店月度得分录入、得分上下限校验、评分列表页面 `/store-scoring`
- 评分数据模型 Prisma migration 已生成并应用：`prisma/migrations/20260711111138_add_store_scoring_model/migration.sql`
- 已修复评分列表接口 500 风险：评分接口不再直接返回 Prisma Decimal/Date 原始对象，统一序列化为前端稳定 JSON，项目得分上下限返回 `number | null`
- 已优化评分项目查询：`GET /api/scoring/items` 与 `GET /api/scoring/monthly` 仅选择前端所需字段，月度列表仅查询评分录入所需字段
- 门店评分列表已调整为多维度呈现：按计分项目 `categoryCode/categoryName` 分组，顶部展示维度卡片，正文按标签页切换不同评分维度
- 每个评分维度已支持独立合计与独立排名，避免所有评分项摊平成单一总分榜单
- 门店评分顶部统计区域已调整为展示每个评分维度排行前三的门店名称，不再展示计分项数量统计
- 评分项目返回顺序已调整为优先按 `sort` 排序，使前端维度顺序跟业务配置顺序保持一致
- 门店排班页面已优化展示：新增门店/月度、已安排岗位数、排班天数、待保存修改数概览
- 门店排班表格已优化展示：日期列改为日期块展示，班次使用标签区分，按天交替底色，周末侧边标记，白班/晚班背景区分
- 门店排班编辑体验已优化：员工选择框改为紧凑尺寸，未保存的单元格增加红色边框和提示点
- 业绩指标页面已与业绩拆分表强关联：已生效拆分的门店可在业绩指标行内打开右侧抽屉查看对应门店月度拆分明细
- 业绩指标页面拆分抽屉已复用拆分表展示样式，展示网费/商品目标、达成、总达成率，并支持在抽屉内编辑每日班次网费目标和商品目标
- 业绩指标页面已增强业绩完成进度展示：拆分抽屉顶部展示月业绩目标、当前进度、实际达成和预估达成
- 业绩指标页面的拆分/重拆分操作已增加二次确认，提示将按当前网费目标、商品目标重新生成默认拆分，已有手工调整会被默认数据覆盖
- 业绩指标页面拆分权限已区分：`performance-split:view` 可查看拆分抽屉，`performance-split:update` 才可编辑拆分项和执行拆分/重拆分
- 业绩指标页面拆分抽屉已修正顶部指标口径：统一使用拆分表汇总数据展示拆分总目标、拆分完成率、已达成合计、剩余目标，避免混用月度业绩汇总实际达成造成误解
- 业绩指标页面拆分抽屉已支持拖拽调整宽度，大屏可横向展示更多拆分表列
- 业绩指标页面拆分抽屉已修复纵向展示问题：抽屉内容区和拆分表区域支持纵向滚动，避免表格下半部分无法查看
- 腾讯云轻量应用服务器部署方案已确定：Ubuntu 22.04 LTS + Nginx 托管前端 + PM2 托管 NestJS 后端 + 本机 MySQL/Redis
- 已新增生产环境模板 `.env.production.example`，生产部署时复制为 `.env` 并替换数据库密码和 JWT 密钥
- 已新增 PM2 配置 `ecosystem.config.cjs`，后端进程名为 `bluecat-store-server`
- 已新增 Nginx 模板 `deploy/nginx.bluecat-store-system.conf`，前端指向 `/opt/bluecat-store-system/apps/web/dist`，`/api` 反向代理到 `127.0.0.1:3001`
- 已新增服务器初始化脚本 `scripts/bootstrap-ubuntu.sh`，用于安装 Node.js 22、pnpm/Corepack、PM2、Nginx、MySQL、Redis 等基础运行环境
- 已新增生产一键部署脚本 `scripts/deploy-prod.sh`，执行依赖安装、Prisma Client 生成、生产迁移、构建和 PM2 平滑重启
- 根目录 `package.json` 已新增 `prisma:deploy` 和 `deploy:prod` 脚本，后续部署使用 `pnpm deploy:prod`
- 已新增部署文档 `docs/deployment-tencent-lighthouse.md`，记录首次部署、数据库初始化、Nginx 启用、后续一键部署和排查命令
- 腾讯云轻量应用服务器公网 IP 已确认：`49.235.145.204`
- 腾讯云轻量应用服务器镜像已确认：`Ubuntu 22.04 LTS`
- 服务器安全组当前已开放：`22`、`80`；后续备案和 HTTPS 配置完成后再开放 `443`
- 生产部署方式已确认优先使用 Git 仓库拉取代码；当前本地目录尚未初始化 Git 仓库，也没有远程仓库地址
- SSH 登录方式已确认使用腾讯云密钥登录，不建议开启 SSH 密码登录；下一步需要确认本机私钥 `.pem` 文件路径和服务器登录用户名
- `.gitignore` 已补充 `!.env.production.example`，确保生产环境模板可以进入 Git，真实 `.env` 仍保持忽略
- 服务器 SSH 私钥路径已确认：`/Users/allen/Downloads/bluecat_store.pem`
- 服务器 SSH 登录用户已验证：`ubuntu`，`root` 用户密钥登录失败，后续使用 `ubuntu@49.235.145.204`
- GitHub 远程仓库地址已设置：`https://github.com/kang360970725/bluecat-store-system.git`
- 当前本地仓库已完成首个提交：`79fbcc2 Initial BlueCat store system`
- 本机推送 GitHub 暂未成功，`git push` 返回 `Empty reply from server`，首次部署已临时改用 `git archive` 打包并通过 `scp` 上传服务器
- 服务器应用目录已创建：`/opt/bluecat-store-system`
- 首次服务器环境初始化已完成：Node.js `v22.23.1`、Nginx、MySQL、Redis、PM2 已安装并启用
- 生产 `.env` 已写入服务器 `/opt/bluecat-store-system/.env`，文件权限已设置为 `600`
- 生产数据库已创建：`store_system_db`；应用数据库账号已创建：`bluecat_app@127.0.0.1`
- 服务器首次执行 `pnpm deploy:prod` 成功：依赖安装、Prisma Client 生成、8 条生产迁移、前后端构建、PM2 启动均已完成
- 生产种子数据已执行成功，默认账号已写入：`admin / admin123`、`manager / manager123`
- Nginx 已启用 `deploy/nginx.bluecat-store-system.conf`，公网 `http://49.235.145.204/` 已返回 `200 OK`
- 生产登录接口 `POST http://49.235.145.204/api/auth/login` 已验证成功
- PM2 进程 `bluecat-store-server` 已在线，PM2 systemd 开机自启已配置
- 已修复评分长文本字段长度隐患：`score_items.description`、`score_items.formula_note`、`store_score_entries.remark` 已调整为 `TEXT`
- 评分长文本字段 Prisma migration 已生成并应用：`prisma/migrations/20260711114123_widen_scoring_text_fields/migration.sql`
- 本轮已验证评分列表底层 Prisma 查询：本地库返回 `24` 个计分项目、`2` 个门店，关联评分明细查询正常
- 本轮已验证：`pnpm --filter @bluecat/server typecheck`
- 本轮已验证：`pnpm --filter @bluecat/server lint`
- 本轮已验证：`pnpm --filter @bluecat/web typecheck`
- 本轮已验证：`pnpm --filter @bluecat/server typecheck`
- 本轮已验证：`pnpm --filter @bluecat/web lint`
- 本轮已验证：`pnpm --filter @bluecat/web build`
- 本轮已验证：`bash -n scripts/deploy-prod.sh scripts/bootstrap-ubuntu.sh`
- 服务器已验证：`pm2 status`
- 服务器已验证：`curl -I http://127.0.0.1:3001/api/docs`
- 服务器已验证：`systemctl is-active nginx mysql redis-server`
- 公网已验证：`curl -I http://49.235.145.204/`
- 公网已验证：`POST http://49.235.145.204/api/auth/login`
- 本轮已验证：`pnpm build`

当前未完成：

- 数据权限实现
- Refresh Token 续期接口

后续所有开发应以 `blueCat-StoreSystem` 作为唯一项目基线。
