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

如果使用 Git：

```bash
sudo mkdir -p /opt
sudo chown -R "$USER":"$USER" /opt
git clone <repo-url> /opt/bluecat-store-system
cd /opt/bluecat-store-system
```

如果暂时不使用 Git，可以本地打包后上传到该目录。

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

进入项目目录后执行：

```bash
cd /opt/bluecat-store-system
git pull
pnpm deploy:prod
```

`pnpm deploy:prod` 会执行：

1. `pnpm install --frozen-lockfile`
2. `pnpm prisma:generate`
3. `pnpm prisma:deploy`
4. `pnpm build`
5. `pm2 startOrReload ecosystem.config.cjs --env production`
6. `pm2 save`

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
