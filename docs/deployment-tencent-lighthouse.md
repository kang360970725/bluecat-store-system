# 腾讯云轻量应用服务器部署记录

## 目标架构

- 服务器系统：Ubuntu 22.04 LTS
- 前端：`apps/web/dist` 由 Nginx 托管
- 后端：NestJS 构建产物 `apps/server/dist/main.js`，由 PM2 托管
- 后端端口：`127.0.0.1:3001`
- 数据库：MySQL，本机服务
- 缓存：Redis，本机服务
- 对公网开放：`80`、`443`、受限来源的 `22`
- 不对公网开放：`3001`、`3306`、`6379`

## 首次部署前需要准备

用户需要提供或确认：

1. 服务器公网 IP
2. SSH 登录方式：用户名、端口、密钥或临时密码
3. 域名，如暂时没有域名可先用公网 IP 部署
4. MySQL 生产库密码
5. 两个生产 JWT 密钥：`JWT_SECRET`、`JWT_REFRESH_SECRET`

## 首次部署步骤

以下命令在服务器上执行。

### 1. 安装基础运行环境

```bash
sudo bash scripts/bootstrap-ubuntu.sh
```

该脚本会安装或启用：

- Node.js 22
- Corepack / pnpm
- PM2
- Nginx
- MySQL
- Redis
- build-essential

### 2. 放置项目代码

建议目录：

```bash
/opt/bluecat-store-system
```

当前生产部署不依赖服务器拉取 GitHub。腾讯云服务器访问 GitHub 不稳定，标准方式固定为本地打包上传。

首次部署时由本地脚本上传代码包到服务器并解压到该目录：

```bash
bash scripts/deploy-upload.sh
```

### 3. 创建生产环境配置

```bash
cp .env.production.example .env
```

必须修改：

- `DB_PASSWORD`
- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`

生产环境不要使用示例密钥。

### 4. 初始化 MySQL 数据库和账号

进入 MySQL：

```bash
sudo mysql
```

执行：

```sql
CREATE DATABASE IF NOT EXISTS store_system_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'bluecat_app'@'127.0.0.1'
  IDENTIFIED BY '替换为生产数据库密码';

GRANT ALL PRIVILEGES ON store_system_db.* TO 'bluecat_app'@'127.0.0.1';
FLUSH PRIVILEGES;
```

确保 `.env` 中的 `DATABASE_URL` 与账号密码一致。

### 5. 配置 Nginx

```bash
sudo cp deploy/nginx.bluecat-store-system.conf /etc/nginx/sites-available/bluecat-store-system.conf
sudo ln -sf /etc/nginx/sites-available/bluecat-store-system.conf /etc/nginx/sites-enabled/bluecat-store-system.conf
sudo nginx -t
sudo systemctl reload nginx
```

如果未来绑定域名，将 `server_name _;` 改为实际域名。

### 6. 首次构建和启动

```bash
pnpm deploy:prod
```

首次部署后如需要写入默认账号和基础数据：

```bash
pnpm db:seed
pm2 restart bluecat-store-server
```

默认账号仍需上线后尽快修改密码。

## 后续一键部署

后续部署固定在本地项目目录执行：

```bash
bash scripts/deploy-upload.sh
```

该脚本会执行：

1. 本地打包当前项目，排除 `.git`、`node_modules`、`.env`、构建产物和编辑器缓存
2. 上传到 `ubuntu@49.235.145.204:/tmp/bluecat-store-system-upload.tar`
3. 服务器保留 `/opt/bluecat-store-system/.env` 和 `node_modules`
4. 覆盖服务器代码
5. 在服务器执行 `pnpm deploy:prod`

服务器端 `pnpm deploy:prod` 会执行：

1. `pnpm install --frozen-lockfile`
2. `pnpm prisma:generate`
3. `pnpm prisma:deploy`
4. `pnpm build`
5. `pm2 startOrReload ecosystem.config.cjs --env production`
6. `pm2 save`

默认连接信息已经写入脚本：

```bash
SSH_KEY=/Users/allen/Downloads/bluecat_store.pem
SSH_USER=ubuntu
SSH_HOST=49.235.145.204
REMOTE_DIR=/opt/bluecat-store-system
```

如需临时覆盖：

```bash
SSH_KEY=/path/to/key.pem SSH_HOST=1.2.3.4 bash scripts/deploy-upload.sh
```

## 生产数据库同步到本地

生产 MySQL 不对公网开放。需要本地通过 SSH 登录服务器，在服务器本机执行 `mysqldump` 后导入本地 MySQL。

本地项目目录执行：

```bash
bash scripts/sync-prod-db-to-local.sh
```

脚本会执行：

1. 通过 SSH 连接 `ubuntu@49.235.145.204`
2. 读取服务器 `/opt/bluecat-store-system/.env`
3. 在服务器本机导出生产库 `store_system_db`
4. 将 SQL dump 保存到本地 `database-backups/`
5. 如本地 MySQL 可连接，先备份本地库，再重建并导入生产数据

如果本地 MySQL 暂未启动，只需要先拉取生产 dump：

```bash
bash scripts/sync-prod-db-to-local.sh --dump-only
```

本地 MySQL 启动后，再执行不带参数的同步命令完成导入。

默认连接信息：

```bash
SSH_KEY=/Users/allen/Downloads/bluecat_store.pem
SSH_USER=ubuntu
SSH_HOST=49.235.145.204
REMOTE_DIR=/opt/bluecat-store-system
```

如需临时覆盖：

```bash
SSH_KEY=/path/to/key.pem SSH_HOST=1.2.3.4 bash scripts/sync-prod-db-to-local.sh
```

## 常用排查命令

```bash
pm2 status
pm2 logs bluecat-store-server
sudo nginx -t
sudo systemctl status nginx
sudo systemctl status mysql
sudo systemctl status redis-server
```

接口检查：

```bash
curl -I http://127.0.0.1:3001/api/docs
curl -I http://127.0.0.1/
```

## 安全约束

- 云防火墙只开放 `80`、`443`、必要来源的 `22`
- 不开放 MySQL `3306`
- 不开放 Redis `6379`
- 不开放后端 `3001`
- `.env` 不提交仓库
- 生产 JWT 密钥必须使用随机长字符串
