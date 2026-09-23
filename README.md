# 旅伴匹配与行程共享平台

帮助用户发布旅行计划、匹配旅伴、协作规划行程并在旅途中实时沟通。

## 快速启动

```bash
cp .env.example .env
docker compose up -d --build
```

访问地址：前端 http://localhost:18402 ，后端 http://localhost:19402/health 。

## 项目主要功能

- 发布包含目的地、时间、预算、交通方式和旅伴偏好的行程。
- 根据目的地、时间和预算做旅伴匹配评分。
- 行程协作看板维护每日安排、住宿和交通方案。
- 预算管理展示计划费用和实际花费。
- Socket.IO 支持行程成员即时聊天。
- **旅行日记多人共写与发布**：
  - 行程成员只能修改本人创建的段落；保存草稿必须提交上次版本号，版本过期则整次修改被拒绝，服务端内容与他人段落保持不变（乐观锁 + 事务）。
  - 行程结束前只能保存草稿；行程结束后仅发起人可发布，发布时冻结标题、段落顺序与作者昵称。
  - 成员离队后其历史段落仍可查看但不能再改；重复发布只生效一次（幂等）。
  - 刷新后版本冲突状态与发布状态始终以服务端为准。
- 用户主页为后续扩展预留清晰模块。

### 旅行日记演示账号

初始化脚本内置三个账号，口令均为 `demo1234`：

| 邮箱 | 角色 | 行程 #1（大理，已结束） | 行程 #2（青海湖，未结束） |
| --- | --- | --- | --- |
| `alice@example.com` | 发起人 | 在队，可发布 | 在队，仅可存草稿 |
| `bob@example.com` | 普通成员 | 在队，可共写 | 在队 |
| `carol@example.com` | 普通成员 | 已离队，段落只读 | 未加入 |

## 本地开发方式

```bash
cd backend
npm install
npm run start:dev
```

```bash
cd frontend
npm install
npm run dev
```

后端内置无需 MySQL/ Docker 的内存端到端用例（基于 sql.js），覆盖共写权限、版本冲突、离队、发布冻结与幂等、同版本并发提交等规则：

```bash
cd backend
npm install
npm run test:e2e
```

## 旅行日记接口

所有接口需登录（`Authorization: Bearer <token>`）。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/trips/:tripId/diary` | 成员查看日记，返回版本号、发布状态与当前用户权限 |
| PUT | `/api/trips/:tripId/diary` | 保存草稿，body 携带上次 `version`、`title`、本人段落变更 |
| POST | `/api/trips/:tripId/diary/reorder` | 调整本人段落位置（他人段落相对顺序不变） |
| POST | `/api/trips/:tripId/diary/publish` | 行程结束后发起人发布；重复发布幂等 |
| GET/POST/DELETE | `/api/trips/:tripId/members[/me]` | 成员列表、加入、离队 |

版本过期返回 `409 DIARY_VERSION_CONFLICT`，响应体 `data` 字段携带服务端最新日记，前端据此刷新合并。

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 前端 | React 18、TypeScript、Ant Design、Vite、高德地图 JS API |
| 后端 | NestJS、TypeScript、TypeORM、JWT、Socket.IO |
| 数据库 | MySQL 8.0 |
| 部署 | Docker Compose、Nginx |

## 项目目录结构

```text
.
├── backend
│   └── src
│       ├── common
│       ├── constants
│       ├── config
│       └── modules
├── database
├── frontend
│   └── src
└── docker-compose.yml
```

## 环境变量说明

| 变量 | 说明 |
| --- | --- |
| COMPOSE_PROJECT_NAME | Compose 项目名，默认 tripmatch |
| DATABASE_HOST | MySQL 服务主机名 |
| DATABASE_NAME | 数据库名称 |
| DATABASE_USER | 数据库用户 |
| JWT_SECRET | JWT 签名密钥 |
| AMAP_KEY | 高德地图 JS API Key |

## Docker 部署说明

- 前端端口：`18402:80`
- 后端端口：`19402:3000`
- MySQL 数据通过命名卷 `tripmatch-db-data` 持久化。
- Nginx 同时代理 `/api` 与 `/socket.io`，支持 WebSocket Upgrade。

## License

MIT
