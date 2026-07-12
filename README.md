# BlueCat Store System

门店业务系统新项目。

当前阶段：已完成 monorepo 工程骨架、前端应用骨架、后端服务骨架和 Prisma 基础模型。

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

## 关键文档

- `docs/project-technical-solution-v1.md`
- `docs/development-record.md`

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
- 临时登录账号：`admin / admin123`
