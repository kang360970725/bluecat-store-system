# BlueCat Store System

蓝猫门店运营、员工、权限、财务与工资核算系统。X 管家数据由独立采集服务提供。

## 目录

- `apps/web`：前端应用，PC/H5 共用
- `apps/server`：后端服务
- `packages/shared`：共享类型与常量
- `prisma`：数据库 schema 与迁移
- `docs`：技术方案与开发记录
- `scripts`：项目脚本

## 当前基线

- 前端：`Vue 3 + TypeScript + Vite + Pinia + Vue Router + UnoCSS + Naive UI`
- 后端：`NestJS + Prisma`
- 数据库：`MySQL 8`（独立运行，通过配置连接）
- 缓存：`Redis`
- 架构：`Monorepo + 模块化单体`

## 开发前必读

- `AGENTS.md`：Codex 与开发者统一协作规则
- `CONTRIBUTING.md`：分支、验证和 PR 流程
- `docs/CURRENT_STATE.md`：当前实现状态、风险与下一步
- `docs/DECISIONS.md`：已确认业务规则

## 架构文档

- `docs/project-technical-solution-v1.md`
- `docs/development-record.md`
- `docs/data-collection-service-boundary.md`

## 数据采集服务

完整采集系统独立维护在私有项目 [`DATAN-platform`](https://github.com/kang360970725/DATAN-platform)。本系统不直接访问第三方采集库，只消费版本化的 BlueCat Bridge API，并把业务所需结果写入自身快照与事实表。

采集账号、Cookie、浏览器会话、原始数据和采集数据库不得进入本仓库。接口或口径变化必须同时更新两边的契约文档与回归验证。

## 本地启动

```bash
cp .env.example .env
pnpm install
pnpm prisma:generate
pnpm dev
```

启动前需要按本机 MySQL 信息修改 `.env` 中的 `DB_*` 与 `DATABASE_URL`。
创建数据库后执行首次迁移：

```bash
pnpm prisma:migrate
```

- 前端：`http://127.0.0.1:8080`
- 后端：`http://127.0.0.1:3001/api`
- Swagger：`http://127.0.0.1:3001/api/docs`
- 本地测试账号通过种子数据或安全渠道获取，不在仓库中记录明文密码。
