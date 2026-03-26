#!/bin/sh
# 从 /etc/resolv.conf 动态提取 DNS resolver 地址
# K8s 环境：通常是 CoreDNS 的 ClusterIP（如 10.96.0.10）
# docker-compose 环境：通常是 127.0.0.11
NAMESERVER=$(awk '/^nameserver/{print $2; exit}' /etc/resolv.conf)
export NAMESERVER=${NAMESERVER:-127.0.0.11}

# 后端 upstream 地址：
# - K8s 环境通过 BACKEND_UPSTREAM 环境变量注入 FQDN（nginx resolver 不使用 search domain）
# - docker-compose 环境使用默认短名
BACKEND=${BACKEND_UPSTREAM:-tsign-dispatcher-backend:3001}

echo "Using DNS resolver: $NAMESERVER"
echo "Using backend upstream: $BACKEND"

# 将模板中的占位符替换为实际值
sed -i "s/__RESOLVER__/$NAMESERVER/g" /etc/nginx/conf.d/default.conf
sed -i "s|__BACKEND_UPSTREAM__|$BACKEND|g" /etc/nginx/conf.d/default.conf

# 打印最终 nginx 配置（前 15 行）方便调试
echo "--- nginx config (first 15 lines) ---"
head -15 /etc/nginx/conf.d/default.conf
echo "--------------------------------------"

exec "$@"
