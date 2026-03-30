# [腾讯电子签](https://qian.tencent.com/)回调分发服务 (TSign Callback Dispatcher)

[English](./README.en.md) | 中文

接收[腾讯电子签](https://qian.tencent.com/)的加密回调通知，解密后根据配置规则（事件类型、标签过滤等）分发到多个下游服务，支持二次加密转发。

## 功能特性

- 🔐 **接收 & 解密**：接收[腾讯电子签](https://qian.tencent.com/)加密回调，自动验签并解密消息
- 🔀 **规则分发**：按事件类型（`msgTypes`）、标签（`tags`）等条件将回调分发到多个下游
- 🔒 **二次加密**：可为每个下游单独配置加密密钥和签名令牌，实现端到端加密转发
- 🏷️ **标签系统**：内置 FlowType / UserData 标签，支持自定义标签按任意字段路径匹配
- 📊 **管理面板**：React 前端提供可视化配置，支持回调管理、标签管理、系统设置
- 🔄 **配置热重载**：所有配置支持运行时修改，无需重启服务
- 📝 **版本管理**：配置变更自动保存版本历史，支持一键回滚
- 🔑 **JWT 认证**：管理 API 全部需要 JWT 认证，登录支持速率限制
- 📈 **可观测性**：Winston 结构化日志、操作审计、健康检查端点
- 🐳 **多种部署**：支持 Docker Compose / Kubernetes / 本地开发多种方式

## 架构

```
腾讯电子签
    │
    ▼ (AES-256-CBC 加密回调)
┌──────────────────────────┐
│   Nginx (前端 :8080)      │  ← 静态文件 + 反向代理
│   ┌────────────────────┐ │
│   │ Dispatcher 后端     │ │  ← 解密 → 规则匹配 → 二次加密
│   │ (Express :3001)    │ │
│   └────────┬───────────┘ │
└────────────┼─────────────┘
             │
             ├──→ 下游服务 A (重新加密转发)
             ├──→ 下游服务 B (事件类型过滤)
             └──→ 下游服务 C (标签匹配分发) ...
```

## 项目结构

```
├── backend/             # 后端服务 (Express + TypeScript)
│   └── src/
│       ├── controllers/ # 路由控制器 (callback, config, auth, health)
│       ├── services/    # 业务逻辑 (分发、配置、标签匹配、认证等)
│       ├── middleware/   # 中间件 (JWT 认证、日志、验证、限流、asyncHandler)
│       ├── types/       # TypeScript 类型定义
│       ├── utils/       # 工具函数 (加解密)
│       └── app.ts       # 入口
│   └── tests/           # 测试 (unit / e2e / integration)
├── frontend/            # 管理前端 (React + Vite + TDesign)
│   └── src/
│       ├── pages/       # 页面 (回调管理、标签管理、系统设置、登录)
│       ├── components/  # 通用组件 (布局、标签编辑器等)
│       └── lib/         # API 客户端
├── config/              # 运行时配置 (JSON 文件存储)
│   ├── app.json         # 应用配置 (端口、密钥、分发参数)
│   ├── callbacks.json   # 回调分发规则
│   ├── tags.json        # 标签定义
│   ├── users.json       # 用户数据
│   ├── operation-logs.json # 操作日志
│   └── versions/        # 配置版本历史
├── docker/              # Docker 部署
│   ├── Dockerfile.backend    # 后端多阶段构建
│   ├── Dockerfile.frontend   # 前端多阶段构建 (Nginx)
│   ├── docker-compose.yml    # 生产 Compose
│   ├── nginx.conf            # Nginx 配置模板 (动态 resolver)
│   ├── nginx.production.conf # 生产 Nginx (内网限制)
│   ├── docker-entrypoint.sh  # 启动入口 (DNS 注入)
│   └── test/                 # Docker 测试环境
├── k8s/                 # Kubernetes 部署清单
├── Makefile             # 构建 / 推送 / 部署一键脚本
├── dev.sh               # 本地开发管理脚本
└── package.json
```

## 快速开始

> 5 分钟完成部署，接收你的第一个回调。

### 方式一：Docker Compose 一键部署（推荐 ⭐）

最简单的部署方式，适合大多数场景。**环境要求**：Docker >= 20、Docker Compose V2。

```bash
# 1. 克隆项目
git clone <your-repo-url> && cd tsign-callback-dispatcher

# 2. 配置电子签密钥
#    编辑 config/app.json，将 tsign.encryptKey 替换为腾讯电子签提供的消息加密密钥
#    如需验签，同时填写 tsign.token

# 3. 配置安全凭据（⚠️ 生产环境必须修改）
cat > docker/.env << 'EOF'
JWT_SECRET=your-strong-random-jwt-secret-at-least-32-chars
ADMIN_DEFAULT_PASSWORD=your-strong-admin-password
EOF

# 4. 构建并启动
cd docker
docker compose up -d --build

# 5. 检查服务状态
docker compose ps
```

启动成功后：

| 服务 | 地址 | 说明 |
|------|------|------|
| 管理面板 | http://localhost | 使用上面设置的管理员密码登录（账号 `admin`） |
| 回调入口 | http://your-domain/api/callback | 📋 将此地址配置到[腾讯电子签](https://qian.tencent.com/)后台 |
| 健康检查 | http://localhost/api/health | 验证服务运行正常 |

> **🔒 安全说明**：生产 Nginx 已将管理 API 和管理 UI 限制为内网访问，仅回调入口 `/api/callback` 和健康检查 `/api/health` 公开。

**日常运维命令**：

```bash
cd docker

docker compose ps                  # 查看服务状态
docker compose logs -f backend     # 查看后端日志
docker compose logs -f frontend    # 查看前端/Nginx 日志
docker compose restart backend     # 重启后端
docker compose down                # 停止所有服务
docker compose up -d --build       # 重新构建并启动（代码更新后）
```

也可以通过 Makefile 快捷操作（在项目根目录执行）：

```bash
make compose-up       # 启动
make compose-down     # 停止
make build            # 仅构建镜像
make push TAG=v1.0.0  # 构建并推送到远程镜像仓库
make info             # 查看当前构建信息
```

### 方式二：Kubernetes 部署

适合需要高可用、多副本、自动扩缩容的生产环境。**环境要求**：kubectl 已配置集群访问、Ingress Controller 已就绪。

```bash
# 1. 创建 Secret（从模板复制并修改，⚠️ 勿提交到 Git）
cp k8s/secret.yaml.example k8s/secret.yaml
# 编辑 k8s/secret.yaml，填写 JWT_SECRET 和 ADMIN_DEFAULT_PASSWORD

# 2. 配置电子签密钥
# 编辑 k8s/configmap.yaml，填写 tsign.encryptKey 和 tsign.token，http://{you-domain}/settings也在界面直接配置

# 3. 配置域名
# 编辑 k8s/ingress.yaml，替换 host 为你的实际域名。如果需要 HTTPS，还需配置 TLS 证书。可参考tls.yaml

# 4. （可选）如使用私有镜像仓库，修改 Deployment 中的 image 字段
# 默认使用 latest 标签，开箱即用

# 5. 部署到集群
kubectl apply -f k8s/

# 6. 验证部署
kubectl get pods -l app=tsign-dispatcher
curl https://your-domain.com/api/health
```

> 📖 详细的 K8s 部署指南（RBAC、TLS、多副本配置共享等）见下方 [Kubernetes 部署](#kubernetes-部署) 章节。

### 方式三：本地开发

用于二次开发或调试。**环境要求**：Node.js >= 18、npm >= 9。

```bash
# 1. 安装所有依赖
npm run install:all

# 2. 配置电子签密钥（编辑 config/app.json）

# 3. 一键启动
./dev.sh start          # 后台运行，前后端同时启动
./dev.sh status         # 查看状态
./dev.sh logs           # 查看后端日志
```

| 服务 | 地址 |
|------|------|
| 前端 UI | http://localhost:3000 |
| 后端 API | http://localhost:3001 |

<details>
<summary>更多 dev.sh 命令</summary>

```bash
./dev.sh start [backend|frontend]   # 启动（默认全部）
./dev.sh stop  [backend|frontend]   # 停止
./dev.sh restart [backend|frontend] # 重启
./dev.sh status                     # 查看运行状态
./dev.sh logs [backend|frontend]    # 查看日志（跟随模式）
```

等效的 npm scripts：

```bash
npm run dev              # 启动所有
npm run dev:stop         # 停止所有
npm run dev:restart      # 重启所有
npm run dev:status       # 查看状态
npm run dev:logs         # 后端日志
npm run dev:logs:frontend # 前端日志
```

也可以前台运行（实时查看输出）：

```bash
# 终端 1 - 后端
npm run dev:backend

# 终端 2 - 前端
npm run dev:frontend
```

> 💡 首次启动会自动安装缺失的 `node_modules`。PID 文件保存在 `.dev-pids/`，日志输出到 `logs/dev/`。

</details>

### 部署后配置

服务启动后，通过管理面板完成初始配置：

1. **登录管理面板** — 访问管理 UI，使用 `admin` / 你设置的密码登录
2. **确认电子签密钥** — 在「系统设置」页面确认消息加密密钥和签名令牌已正确配置
3. **添加下游回调** — 在「回调管理」页面添加下游服务地址，配置事件类型过滤、标签匹配等规则
4. **配置[腾讯电子签](https://qian.tencent.com/)** — 将 `https://your-domain/api/callback` 填入[腾讯电子签](https://qian.tencent.com/)后台的回调地址
5. **验证回调** — 在[腾讯电子签](https://qian.tencent.com/)后台触发一次测试回调，确认下游服务正常接收

### 快速验证

也可以通过命令行发送模拟回调：

```bash
# 健康检查
curl http://localhost/api/health

# 发送测试回调（需要用真实加密数据替换）
curl -X POST http://localhost/api/callback \
  -H "Content-Type: application/json" \
  -d '{"encrypt": "<encrypted_payload>", "timestamp": "1234567890", "nonce": "abc", "msg_signature": "xxx"}'
```

或使用 Docker 测试环境进行端到端验证（含模拟下游 Receiver）：

```bash
npm run test:docker:up     # 启动测试环境（Dispatcher + 2 个 Receiver）
npm run test:docker:send   # 发送测试消息
npm run test:docker:check  # 检查下游是否收到
npm run test:docker:down   # 停止测试环境
```

## 配置说明

### 配置存储模式

服务支持两种配置存储后端，通过环境变量 `CONFIG_STORE` 切换：

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| `file`（默认） | 配置存储在 `config/` 目录的 JSON 文件中 | Docker Compose、本地开发 |
| `k8s` | 配置存储在 Kubernetes ConfigMap 中，通过 K8s API 读写 | Kubernetes 部署（多副本共享配置） |

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `NODE_ENV` | `development` | 运行环境 (`production` / `development` / `test`) |
| `CONFIG_STORE` | `file` | 配置存储模式 (`file` / `k8s`) |
| `CONFIG_DIR` | `/app/config` | file 模式下的配置目录路径 |
| `K8S_CONFIGMAP_NAME` | `tsign-dispatcher-config` | k8s 模式下的 ConfigMap 名称 |
| `K8S_NAMESPACE` | *(自动检测)* | k8s 模式下的命名空间 |
| `JWT_SECRET` | *(内置默认值，不安全)* | **⚠️ 生产必须修改** JWT 签名密钥 |
| `JWT_EXPIRES_IN` | `24h` | JWT Token 过期时间 |
| `ADMIN_DEFAULT_PASSWORD` | `admin123` | **⚠️ 生产必须修改** 管理员初始密码 |
| `CORS_ORIGINS` | *(空，禁止跨域)* | 允许的 CORS 来源（逗号分隔） |
| `LOG_LEVEL` | `info` | 日志级别 (`debug` / `info` / `warn` / `error`) |

### app.json

```json
{
  "server": { "port": 3001, "host": "0.0.0.0" },
  "tsign": {
    "encryptKey": "腾讯电子签提供的消息加密密钥（32字节）",
    "token": "签名验证令牌（可选，用于验签）"
  },
  "dispatch": {
    "defaultTimeout": 10000,
    "defaultRetryCount": 3,
    "retryDelay": 1000
  },
  "log": { "level": "info", "maxFiles": 30 }
}
```

### callbacks.json

定义下游分发规则，每条规则包含：
- **目标 URL** (`url`)：下游接收地址
- **超时 & 重试** (`timeout` / `retryCount`)
- **事件类型过滤** (`msgTypes`)：空数组表示接收全部事件
- **标签过滤** (`tags`)：按 key/value 匹配回调消息中的字段
- **二次加密** (`encryptKey` / `signToken`)：为下游重新加密消息，密钥自动生成
- **未知事件策略** (`unknownMsgTypePolicy`): `dispatch`(转发) / `drop`(丢弃) / `log`(仅记录)

### tags.json

标签定义，系统内置两个标签：
- **FlowType** (合同类型) — 从回调消息的 `MsgData.FlowType` 字段匹配
- **UserData** (自定义数据) — 从回调消息的 `MsgData.UserData` 字段匹配

支持通过管理面板添加自定义标签，指定任意 JSON 字段路径（如 `MsgData.xxx`）进行匹配。

## Docker 部署

### 架构概览

```
外部流量
  │
  ▼ :80
┌─────────────────────────────────────────┐
│  Frontend Container (Nginx :8080)       │
│  ├─ 静态文件 → /usr/share/nginx/html   │
│  ├─ /api/callback  → proxy_pass backend │  ← 公开（电子签回调入口）
│  ├─ /api/health    → proxy_pass backend │  ← 公开
│  ├─ /api/*         → proxy_pass backend │  ← 内网限制（管理 API）
│  └─ /*             → SPA fallback       │  ← 内网限制（管理 UI）
└─────────────┬───────────────────────────┘
              │ (Docker 内部网络)
              ▼ :3001
┌─────────────────────────────────────────┐
│  Backend Container (Express :3001)      │
│  ├─ JWT 认证保护管理 API               │
│  ├─ 配置热重载（file 模式）            │
│  └─ 回调分发 + 二次加密转发            │
└─────────────────────────────────────────┘
```

### 生产部署

**1. 配置环境变量**

创建 `docker/.env` 文件（或导出到 shell 环境）：

```bash
# ⚠️ 以下变量在生产环境必须修改！
JWT_SECRET=your-strong-random-jwt-secret-at-least-32-chars
ADMIN_DEFAULT_PASSWORD=your-strong-admin-password

# 可选配置
JWT_EXPIRES_IN=24h
CORS_ORIGINS=
LOG_LEVEL=info
```

**2. 启动服务**

```bash
cd docker
docker compose up -d --build
```

**3. 使用 Makefile 快捷命令**

```bash
make compose-up       # 启动
make compose-down     # 停止
make build            # 仅构建镜像
make push TAG=v1.0.0  # 构建并推送到远程仓库
make info             # 查看当前构建信息
```

**4. 访问服务**

| 服务 | 地址 | 说明 |
|------|------|------|
| 前端管理 UI | http://localhost:80 | Nginx 提供静态文件 + 反代 |
| 后端 API | 不直接暴露 | 仅通过 Nginx 反代访问 |
| 回调入口 | http://your-domain/api/callback | 配置给[腾讯电子签](https://qian.tencent.com/)的回调地址 |

> **安全说明**: 生产 Nginx 配置 (`nginx.production.conf`) 默认将管理 API 和管理 UI 限制为内网访问（`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`），仅回调入口和健康检查公开。

### Docker 测试环境

`docker/test/` 提供完整的多服务测试环境（1 个 Dispatcher + 2 个 Receiver + 前端）：

```bash
# 启动测试环境
npm run test:docker:up

# 发送测试回调
npm run test:docker:send -- message.json

# 查看下游收到的回调
npm run test:docker:check

# 查看服务状态 / 日志
npm run test:docker:status
npm run test:docker:logs

# 停止 / 清理
npm run test:docker:down
npm run test:docker:clean
```

详见 `docker/test/test-env.sh --help`。

## Kubernetes 部署

项目提供两套 K8s 清单：

### K8s 资源清单总览

```
k8s/
├── configmap.yaml          # 应用配置（app.json, callbacks.json, tags.json）
├── secret.yaml.example     # Secret 模板（JWT_SECRET, ADMIN_DEFAULT_PASSWORD）
├── backend-deployment.yaml # 后端 Deployment（2 副本，健康检查，资源限制）
├── frontend-deployment.yaml# 前端 Deployment（2 副本，Nginx + 反代）
├── service.yaml            # ClusterIP Service（backend:3001, frontend:80）
└── ingress.yaml            # Ingress 规则（域名路由，限流，安全头）
```

### 部署步骤

#### 步骤 1：选择命名空间

```bash
# 使用默认命名空间（k8s/ 目录清单）
NAMESPACE=default

# 或创建独立命名空间
kubectl create namespace tsign-dispatcher
```

> **⚠️ 需要修改的地方**：如果不使用 `default` 命名空间，需要修改所有 YAML 文件中的 `namespace` 字段。

#### 步骤 2：创建 Secret

```bash
# 从模板复制
cp k8s/secret.yaml.example k8s/secret.yaml
```

编辑 `k8s/secret.yaml`，替换以下占位符：

```yaml
# ⚠️ 必须修改！替换为你的实际值
stringData:
  JWT_SECRET: "<REPLACE_WITH_STRONG_SECRET>"           # ← 改为强随机字符串（>=32字符）
  ADMIN_DEFAULT_PASSWORD: "<REPLACE_WITH_STRONG_PASSWORD>"  # ← 改为管理员密码
```

> **🔒 安全提示**：`secret.yaml` 包含敏感信息，请勿提交到 Git 仓库（`.gitignore` 已排除）。生产环境建议使用 Sealed Secrets 或 External Secrets Operator。

#### 步骤 3：配置 ConfigMap

编辑 `k8s/configmap.yaml`，填写实际的[腾讯电子签](https://qian.tencent.com/)密钥：

```yaml
data:
  app.json: |
    {
      "tsign": {
        "encryptKey": "",  # ← ⚠️ 填写腾讯电子签提供的消息加密密钥
        "token": ""        # ← ⚠️ 填写签名验证令牌（如使用）
      }
    }
```

#### 步骤 4：配置镜像地址（可选）

K8s 清单默认使用 `latest` 标签，开箱即用。如需使用私有镜像仓库，编辑 `k8s/backend-deployment.yaml` 和 `k8s/frontend-deployment.yaml`：

```yaml
# backend-deployment.yaml
containers:
  - name: backend
    image: ccr.ccs.tencentyun.com/pulse-line-prod/tsign-dispatcher-backend:latest
    #       ↑ 如需修改为你的私有镜像仓库地址
```

```yaml
# frontend-deployment.yaml
containers:
  - name: frontend
    image: ccr.ccs.tencentyun.com/pulse-line-prod/tsign-dispatcher-frontend:latest
    #       ↑ 如需修改为你的私有镜像仓库地址
```

使用 Makefile 推送镜像：

```bash
# 推送到你的镜像仓库
make push TAG=v1.0.0

# 或自定义仓库
make push REGISTRY=your-registry.com NAMESPACE=your-project TAG=v1.0.0
```

#### 步骤 5：配置 Ingress

编辑 `k8s/ingress.yaml`，修改域名：

```yaml
spec:
  ingressClassName: nginx  # ← ⚠️ 确认集群中的 IngressClass 名称
  rules:
    - host: tsign-dispatcher.your-domain.com  # ← ⚠️ 替换为你的实际域名
```

**启用 HTTPS（推荐）**，取消注释 TLS 部分：

```yaml
spec:
  # ⚠️ 取消注释以启用 HTTPS
  tls:
    - hosts:
        - tsign-dispatcher.your-domain.com  # ← 替换为实际域名
      secretName: tsign-dispatcher-tls       # ← TLS 证书 Secret 名称
  # 如果使用 cert-manager 自动签发，取消注释：
  # annotations:
  #   cert-manager.io/cluster-issuer: letsencrypt-prod
```

**管理 UI 访问限制**（可选），取消注释白名单：

```yaml
annotations:
  # ⚠️ 取消注释以限制管理 UI 仅内网访问
  nginx.ingress.kubernetes.io/whitelist-source-range: "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"
```

#### 步骤 6：配置前端后端通信

前端通过环境变量 `BACKEND_UPSTREAM` 配置后端 Service 的地址。确认 `k8s/frontend-deployment.yaml` 中的值：

```yaml
env:
  - name: BACKEND_UPSTREAM
    value: "tsign-dispatcher-backend.default.svc.cluster.local:3001"
    #       ^^^^^^^^^^^^^^^^^^^^^^^^ ^^^^^^^ ^^^^^^^^^^^^^^^^^^^^^^^^
    #       Service 名称            命名空间   K8s 内部 DNS 后缀
    #       ⚠️ 如果修改了命名空间，需要相应修改此处
```

#### 步骤 7：应用清单

```bash
# file 模式部署（标准）
kubectl apply -f k8s/

# 或使用 Makefile
make deploy
```

验证部署状态：

```bash
# 查看 Pod 状态
kubectl get pods -l app=tsign-dispatcher

# 查看 Service
kubectl get svc -l app=tsign-dispatcher

# 查看 Ingress
kubectl get ingress tsign-dispatcher-ingress

# 检查后端日志
kubectl logs -l app=tsign-dispatcher,component=backend -f

# 健康检查
curl https://tsign-dispatcher.your-domain.com/api/health
```

### K8s 资源配置参考

#### 后端资源限制

```yaml
resources:
  requests:
    cpu: 100m       # 基础 CPU 请求
    memory: 128Mi   # 基础内存请求
  limits:
    cpu: 500m       # CPU 上限
    memory: 512Mi   # 内存上限
```

#### 前端资源限制

```yaml
resources:
  requests:
    cpu: 50m
    memory: 64Mi
  limits:
    cpu: 200m
    memory: 256Mi
```

#### 健康检查配置

| 组件 | 探针 | 路径 | 初始延迟 | 间隔 |
|------|------|------|----------|------|
| 后端 | liveness | `/api/health` | 15s | 30s |
| 后端 | readiness | `/api/health` | 5s | 10s |
| 前端 | liveness | `/healthz` | 10s | 30s |
| 前端 | readiness | `/healthz` | 5s | 10s |

> 前端 `/healthz` 由 Nginx 直接返回 `200 ok`，不依赖后端。

#### 安全上下文

后端 Pod 运行在非 root 用户 (uid=1000)，前端 Nginx 运行在 nginx 用户 (uid=101)，均禁止特权提升。

### 需要修改的配置清单

以下是部署前 **必须检查和修改** 的内容汇总：

| 文件 | 需修改项 | 说明 |
|------|----------|------|
| `secret.yaml` | `JWT_SECRET` | ⚠️ 替换为强随机字符串 |
| `secret.yaml` | `ADMIN_DEFAULT_PASSWORD` | ⚠️ 替换为管理员密码 |
| `configmap.yaml` | `tsign.encryptKey` | ⚠️ 填写电子签加密密钥 |
| `configmap.yaml` | `tsign.token` | 填写签名令牌（如需验签） |
| `backend-deployment.yaml` | `image` | 默认 `latest`，可选修改为私有仓库地址 |
| `frontend-deployment.yaml` | `image` | 默认 `latest`，可选修改为私有仓库地址 |
| `frontend-deployment.yaml` | `BACKEND_UPSTREAM` | 如改命名空间需修改 |
| `ingress.yaml` | `host` | ⚠️ 替换为实际域名 |
| `ingress.yaml` | `ingressClassName` | 确认集群 IngressClass |
| `ingress.yaml` | `tls` | 推荐启用 HTTPS |
| 所有 YAML | `namespace` | 如不用 default 需全部修改 |

## API 端点

### 公开接口（无需认证）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/callback` | 接收[腾讯电子签](https://qian.tencent.com/)加密回调 |
| GET  | `/api/health` | 健康检查 |
| POST | `/api/auth/login` | 管理员登录（有速率限制：15分钟内最多10次） |

### 管理接口（需要 JWT 认证）

请求需在 Header 中携带 `Authorization: Bearer <token>`。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET  | `/api/system-status` | 系统运行状态（启动时间、版本等） |
| GET  | `/api/auth/profile` | 获取当前用户信息 |
| PUT  | `/api/auth/password` | 修改密码 |
| GET  | `/api/received-callbacks` | 查看最近接收的回调记录 |
| DELETE | `/api/received-callbacks` | 清空回调记录 |
| GET  | `/api/callbacks` | 获取回调配置列表 |
| GET  | `/api/callbacks/:id` | 获取单个回调配置 |
| POST | `/api/callbacks` | 新增回调配置 |
| PUT  | `/api/callbacks/:id` | 更新回调配置 |
| DELETE | `/api/callbacks/:id` | 删除回调配置 |
| GET  | `/api/callbacks/generate-keys` | 生成加密密钥和签名令牌 |
| GET  | `/api/tags` | 获取标签列表 |
| GET  | `/api/tags/:id` | 获取单个标签 |
| POST | `/api/tags` | 新增标签 |
| PUT  | `/api/tags/:id` | 更新标签 |
| DELETE | `/api/tags/:id` | 删除标签 |
| GET  | `/api/tsign-config` | 获取电子签配置 |
| PUT  | `/api/tsign-config` | 更新电子签配置 |
| GET  | `/api/versions/:type` | 获取配置版本历史 |
| POST | `/api/versions/:type/rollback` | 回滚配置到指定版本 |
| GET  | `/api/logs` | 获取操作日志 |

## 测试

### 单元测试 & 集成测试

基于 **Vitest** 测试框架：

```bash
cd backend

# 运行所有测试
npm test

# 运行单元测试
npx vitest run tests/unit/

# 运行 E2E 测试（需要先编译后端）
npm run build
npx vitest run tests/e2e/

# 运行集成测试
npx vitest run tests/integration/
```

### 性能测试

基于 **K6** 压测 + **InfluxDB** 指标存储 + **Grafana** 可视化的性能测试方案，位于 `docker/test/` 目录。

### 架构

```
K6 (本地) ──POST──→ Dispatcher (Docker:5001) ──分发──→ Receiver-B/C (Docker:5002/5003)
    │
    └──指标──→ InfluxDB (Docker:8086) ──查询──→ Grafana (Docker:3030)
```

### 文件结构

```
docker/test/
├── docker-compose.perf.yml          # 性能测试 compose (Dispatcher + InfluxDB + Grafana)
├── perf-test.sh                     # 一键管理脚本
└── k6/
    ├── scripts/
    │   ├── load-test.js             # K6 明文模式压测脚本
    │   └── encrypt-load-test.js     # K6 加密模式压测脚本 (使用预生成数据)
    └── grafana/
        ├── dashboards/
        │   └── k6-dashboard.json    # 预配置 Grafana 面板
        └── provisioning/
            ├── datasources/influxdb.yml
            └── dashboards/dashboard.yml
```

### 前置条件

- Docker & Docker Compose
- [K6](https://k6.io/) (`brew install k6` 或 `perf-test.sh` 自动提示安装)

### 使用方式

```bash
cd docker/test

# 1. 启动性能测试基础设施 (Dispatcher + InfluxDB + Grafana)
./perf-test.sh up

# 2. 打开 Grafana 面板 (http://localhost:3030)
./perf-test.sh dash

# 3. 运行压测
./perf-test.sh run smoke             # 冒烟测试
./perf-test.sh run load              # 负载测试
./perf-test.sh run stress            # 压力测试
./perf-test.sh run soak              # 耐久测试

# 4. 加密模式 (先生成加密数据，再压测)
./perf-test.sh gen-data              # 生成加密消息数据
./perf-test.sh run-encrypted load    # 加密模式负载测试

# 5. 查看结果 / 关闭
./perf-test.sh report                # 查看结果汇总
./perf-test.sh down                  # 关闭所有服务
```

### 测试场景

| 场景 | VU 数 | 时长 | 用途 |
|------|-------|------|------|
| **smoke** | 1 | 30s | 验证通路正常 |
| **load** | 0→20→50 | 3.5min | 模拟正常高峰流量 |
| **stress** | 0→200 | 5min | 极限压力测试 |
| **soak** | 30 | 10min | 内存泄漏检测 |

### Grafana 面板指标

- **总览**: 平均/P95/P99 响应时间、错误率、RPS、活跃 VU
- **实时趋势**: 响应时间分布曲线、VU 变化、RPS 吞吐量、数据传输速率
- **详细指标**: 请求阶段耗时 (连接/TLS/发送/等待/接收)、自定义分发成功率

> Grafana 默认地址 `http://localhost:3030`，无需登录（匿名访问已开启），K6 Dashboard 已自动预配置。

### 测试结果 

测试场景
```
     scenarios: (100.00%) 1 scenario, 30 max VUs, 10m30s max duration (incl. graceful stop):
              * default: 30 looping VUs for 10m0s (gracefulStop: 30s)

INFO[0000] === K6 Performance Test ===                   source=console
INFO[0000] Target: http://localhost:5001/api/callback    source=console
INFO[0000] Scenario: soak                                source=console
INFO[0000] Encrypt: enabled                              source=console
INFO[0000] Token: disabled                               source=console
INFO[0000] Message templates: 6                          source=console

running (09m24.6s), 30/30 VUs, 322822 complete and 0 interrupted iterations
default   [==================================>---] 30 VUs  09m24.6s/10m0s
```

资源消耗
```
501625f45f44   perf-grafana       0.02%     70.79MiB / 5.786GiB   1.19%     25.6MB / 89.2MB   0B / 22.9MB      12
1678e6ab6379   perf-receiver-c    0.01%     18.47MiB / 5.786GiB   0.31%     2.46kB / 126B     0B / 0B          11
c4b38b4781eb   perf-dispatcher    32.34%    62.9MiB / 5.786GiB    1.06%     348MB / 371MB     0B / 48.7MB      11
4213feacd00e   perf-receiver-b    13.25%    55.21MiB / 5.786GiB   0.93%     224MB / 98MB      0B / 0B          11
3c366f78a09a   perf-influxdb      4.95%     52.96MiB / 5.786GiB   0.89%     988MB / 17.8MB    0B / 112MB       11
```


## Makefile 命令

```bash
make help             # 显示所有可用命令
make build            # 构建前后端 Docker 镜像（本机架构）
make push TAG=v1.0.0  # 构建并推送镜像到远程仓库
make deploy           # 应用 k8s/ 目录配置到 Kubernetes
make compose-up       # Docker Compose 启动（生产配置）
make compose-down     # Docker Compose 停止
make dev              # 启动本地开发
make dev-stop         # 停止本地开发
make test             # 启动 Docker 测试环境
make test-send        # 发送测试回调
make test-check       # 查看 receiver 收到的回调
make clean            # 清理构建产物与悬空镜像
make info             # 显示当前构建信息（版本、镜像地址等）
```

## 技术栈

| 层级 | 技术 |
|------|------|
| **后端** | Express + TypeScript + Winston (日志) + Axios (HTTP 转发) |
| **安全** | Helmet (安全头) + JWT 认证 + bcrypt (密码哈希) + express-rate-limit (限流) |
| **前端** | React 18 + Vite + TDesign + Tailwind CSS + Recharts |
| **测试** | Vitest (单元/E2E/集成) + K6 (压测) + InfluxDB + Grafana |
| **部署** | Docker / Docker Compose / Kubernetes |
| **CI/CD** | Makefile + Docker Buildx (多架构构建) |
| **镜像仓库** | 腾讯云容器镜像服务 (CCR) |

## License

Private - Internal use only.

