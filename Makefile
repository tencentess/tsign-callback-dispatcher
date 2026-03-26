# ============================================================================
# 腾讯电子签 回调分发服务 — Makefile
#
# 用法:
#   make help             显示帮助
#   make build            本地构建前后端镜像
#   make push             推送镜像到远程仓库
#   make deploy           部署到 k8s
#   make test             启动测试环境
#   make dev              启动本地开发
# ============================================================================

# ──── 可配置变量 ────
REGISTRY     ?= ccr.ccs.tencentyun.com
NAMESPACE    ?= pulse-line-prod
IMAGE_BACKEND  = $(REGISTRY)/$(NAMESPACE)/tsign-dispatcher-backend
IMAGE_FRONTEND = $(REGISTRY)/$(NAMESPACE)/tsign-dispatcher-frontend
VERSION      ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "latest")
# 自定义镜像 tag（可通过 make push TAG=v1.0.0 指定，默认同 VERSION）
TAG          ?= $(VERSION)
# 推送/部署目标架构（可改为 linux/amd64,linux/arm64 做多架构推送）
PUSH_PLATFORM ?= linux/amd64
# 本地构建：始终用本机架构，避免 QEMU 模拟导致 lfstack.push 崩溃
LOCAL_PLATFORM = linux/$(shell uname -m | sed 's/x86_64/amd64/' | sed 's/aarch64/arm64/')

COMPOSE_FILE = docker/docker-compose.yml
COMPOSE_TEST = docker/test/docker-compose.test.yml

# ──── 颜色 ────
CYAN  = \033[0;36m
GREEN = \033[0;32m
NC    = \033[0m

.PHONY: help build build-backend build-frontend push push-backend push-frontend \
        tag deploy dev dev-stop dev-status dev-logs \
        test test-down test-rebuild test-status test-logs test-health test-send test-check test-clean \
        install compose-up compose-down clean info

# ════════════════════════════════════════════════════════════════════════════
#  帮助
# ════════════════════════════════════════════════════════════════════════════

help: ## 显示帮助信息
	@echo ""
	@echo "$(CYAN)腾讯电子签 · 回调分发服务$(NC)"
	@echo ""
	@echo "$(GREEN)构建 & 推送:$(NC)"
	@echo "  make build             构建前后端 Docker 镜像"
	@echo "  make build-backend     仅构建后端镜像"
	@echo "  make build-frontend    仅构建前端镜像"
	@echo "  make push              推送前后端镜像到仓库"
	@echo "  make push TAG=v1.0.0   指定 tag 推送"
	@echo "  make push-backend      仅推送后端镜像"
	@echo "  make push-frontend     仅推送前端镜像"
	@echo "  make tag               显示当前版本号"
	@echo ""
	@echo "$(GREEN)部署:$(NC)"
	@echo "  make deploy            应用 k8s 配置"
	@echo "  make compose-up        Docker Compose 启动（生产）"
	@echo "  make compose-down      Docker Compose 停止（生产）"
	@echo ""
	@echo "$(GREEN)本地开发:$(NC)"
	@echo "  make dev               启动本地开发服务"
	@echo "  make dev-stop          停止本地开发服务"
	@echo "  make dev-status        查看本地开发状态"
	@echo "  make dev-logs          查看后端日志"
	@echo "  make install           安装所有依赖"
	@echo ""
	@echo "$(GREEN)测试环境:$(NC)"
	@echo "  make test              启动 Docker 测试环境"
	@echo "  make test-down         停止测试环境"
	@echo "  make test-rebuild      重新构建并启动测试环境"
	@echo "  make test-status       查看测试环境状态"
	@echo "  make test-logs         查看测试环境日志"
	@echo "  make test-health       测试环境健康检查"
	@echo "  make test-send         发送测试回调"
	@echo "  make test-check        查看 receiver 收到的回调"
	@echo "  make test-clean        完全清理测试环境"
	@echo ""
	@echo "$(GREEN)其他:$(NC)"
	@echo "  make clean             清理构建产物与悬空镜像"
	@echo "  make info              显示当前构建信息"
	@echo ""

# ════════════════════════════════════════════════════════════════════════════
#  构建
# ════════════════════════════════════════════════════════════════════════════

build: build-backend build-frontend ## 构建前后端镜像
	@echo "$(GREEN)✓ 所有镜像构建完成$(NC)"

build-backend: ## 构建后端镜像（本机架构）
	@echo "$(CYAN)→ 构建后端镜像: $(IMAGE_BACKEND):$(VERSION) [$(LOCAL_PLATFORM)]$(NC)"
	docker buildx build \
		--platform $(LOCAL_PLATFORM) \
		-f docker/Dockerfile.backend \
		-t $(IMAGE_BACKEND):$(VERSION) \
		-t $(IMAGE_BACKEND):latest \
		--load \
		.

build-frontend: ## 构建前端镜像（本机架构）
	@echo "$(CYAN)→ 构建前端镜像: $(IMAGE_FRONTEND):$(VERSION) [$(LOCAL_PLATFORM)]$(NC)"
	docker buildx build \
		--platform $(LOCAL_PLATFORM) \
		-f docker/Dockerfile.frontend \
		-t $(IMAGE_FRONTEND):$(VERSION) \
		-t $(IMAGE_FRONTEND):latest \
		--load \
		.

# ════════════════════════════════════════════════════════════════════════════
#  推送
# ════════════════════════════════════════════════════════════════════════════

push: push-backend push-frontend ## 推送所有镜像
	@echo "$(GREEN)✓ 所有镜像推送完成$(NC)"

push-backend: ## 构建并推送后端镜像（目标架构）
	@echo "$(CYAN)→ 构建并推送后端镜像 [$(PUSH_PLATFORM)] tag=$(TAG)$(NC)"
	docker buildx build \
		--platform $(PUSH_PLATFORM) \
		-f docker/Dockerfile.backend \
		-t $(IMAGE_BACKEND):$(TAG) \
		-t $(IMAGE_BACKEND):latest \
		--push \
		.

push-frontend: ## 构建并推送前端镜像（目标架构）
	@echo "$(CYAN)→ 构建并推送前端镜像 [$(PUSH_PLATFORM)] tag=$(TAG)$(NC)"
	docker buildx build \
		--platform $(PUSH_PLATFORM) \
		-f docker/Dockerfile.frontend \
		-t $(IMAGE_FRONTEND):$(TAG) \
		-t $(IMAGE_FRONTEND):latest \
		--push \
		.

tag: ## 显示当前版本号
	@echo "$(VERSION)"

# ════════════════════════════════════════════════════════════════════════════
#  部署
# ════════════════════════════════════════════════════════════════════════════

deploy: ## 部署到 Kubernetes
	@echo "$(CYAN)→ 应用 k8s 配置$(NC)"
	kubectl apply -f k8s/

compose-up: ## Docker Compose 启动（生产配置）
	@echo "$(CYAN)→ Docker Compose 启动$(NC)"
	docker compose -f $(COMPOSE_FILE) up -d --build

compose-down: ## Docker Compose 停止
	docker compose -f $(COMPOSE_FILE) down

# ════════════════════════════════════════════════════════════════════════════
#  本地开发
# ════════════════════════════════════════════════════════════════════════════

install: ## 安装所有依赖
	npm run install:all

dev: ## 启动本地开发
	./dev.sh start

dev-stop: ## 停止本地开发
	./dev.sh stop

dev-status: ## 查看开发服务状态
	./dev.sh status

dev-logs: ## 查看后端开发日志
	./dev.sh logs

# ════════════════════════════════════════════════════════════════════════════
#  测试环境
# ════════════════════════════════════════════════════════════════════════════

test: ## 启动 Docker 测试环境
	cd docker/test && ./test-env.sh up

test-down: ## 停止测试环境
	cd docker/test && ./test-env.sh down

test-rebuild: ## 重新构建并启动测试环境
	cd docker/test && ./test-env.sh rebuild

test-status: ## 查看测试环境状态
	cd docker/test && ./test-env.sh status

test-logs: ## 查看测试环境日志
	cd docker/test && ./test-env.sh logs

test-health: ## 测试环境健康检查
	cd docker/test && ./test-env.sh health

test-send: ## 发送测试回调
	cd docker/test && ./test-env.sh send

test-check: ## 查看 receiver 收到的回调
	cd docker/test && ./test-env.sh check

test-clean: ## 完全清理测试环境
	cd docker/test && ./test-env.sh clean

# ════════════════════════════════════════════════════════════════════════════
#  清理 & 信息
# ════════════════════════════════════════════════════════════════════════════

clean: ## 清理构建产物与悬空镜像
	@echo "$(CYAN)→ 清理构建产物$(NC)"
	rm -rf backend/dist frontend/dist
	docker image prune -f
	@echo "$(GREEN)✓ 清理完成$(NC)"

info: ## 显示当前构建信息
	@echo ""
	@echo "$(CYAN)构建信息:$(NC)"
	@echo "  Registry:       $(REGISTRY)"
	@echo "  Namespace:      $(NAMESPACE)"
	@echo "  Version:        $(VERSION)"
	@echo "  Tag:            $(TAG)"
	@echo "  Local Platform: $(LOCAL_PLATFORM)  (make build)"
	@echo "  Push Platform:  $(PUSH_PLATFORM)   (make push)"
	@echo "  Backend:        $(IMAGE_BACKEND):$(TAG)"
	@echo "  Frontend:       $(IMAGE_FRONTEND):$(TAG)"
	@echo ""
