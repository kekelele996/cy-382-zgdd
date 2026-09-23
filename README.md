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
- 旅行日记支持多人共写：成员只能改本人段落、乐观锁版本号控制并发、离队冻结、发起人发布冻结标题/顺序/昵称。

## 旅行日记：多人共写与发布规则

- **谁能看 / 谁能写**：仅行程成员可查看日记；只有当前在队成员能编辑，且**只能修改本人创建的段落**，提交包里混入他人段落会整次拒绝。
- **乐观锁并发控制**：每次保存草稿必须带上上次看到的 `version`；服务端版本已更新时返回 `409 VERSION_CONFLICT`，整次修改不落库，服务端内容与他人段落保持不动，刷新后重新编辑即可。
- **草稿与发布时机**：行程结束前只能保存草稿；行程结束（发起人手动结束或出发日期 + 天数已过）后，**仅发起人**可以发布。
- **发布即冻结**：发布时生成快照，冻结标题、段落顺序和每位作者的昵称（之后改昵称也不影响已发布日记），发布后任何人不可再改。
- **重复发布幂等**：重复点击发布只生效一次，版本号与快照不再变化。
- **离队规则**：成员离队后其历史段落仍可被全体成员查看，但永久只读（重新入队也不能改旧段落，只能写新段落）。

主要接口（均需 `Authorization: Bearer <token>`）：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/trips/:tripId/diary` | 查看日记（草稿实时内容或发布快照） |
| POST | `/api/trips/:tripId/diary/draft` | 保存草稿，请求体 `{ version, title?, paragraphs? }` |
| POST | `/api/trips/:tripId/diary/publish` | 发起人发布（行程结束后） |
| POST | `/api/trips/:tripId/join` · `/leave` · `/finish` | 加入 / 离开行程、发起人结束行程 |
| GET | `/api/trips/:tripId/members` | 行程成员列表（含在队/离队状态） |

后端附带业务场景与 HTTP 链路验证脚本（内存 SQLite 驱动真实 Nest/TypeORM 代码）：

```bash
cd backend
npm install
npm run test:diary
```


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
