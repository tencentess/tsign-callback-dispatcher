#!/bin/bash
#
# 快速分发压力测试脚本
# 从 curl.txt 中提取所有 curl 命令，循环发送到 localhost:5080
# 目的：生成超过 500 条分发记录，用于查看分发历史页面效果
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CURL_FILE="$SCRIPT_DIR/curl.txt"
TARGET="http://localhost:5080"
ORIGINAL="http://localhost:5001"
TARGET_COUNT=${1:-550}   # 默认目标 550 条，可通过参数指定

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}══════════════════════════════════════════${NC}"
echo -e "${CYAN}  分发记录压力测试${NC}"
echo -e "${CYAN}══════════════════════════════════════════${NC}"
echo -e "  目标地址: ${GREEN}${TARGET}${NC}"
echo -e "  目标数量: ${GREEN}${TARGET_COUNT}${NC} 条"
echo ""

# 检查 curl.txt 是否存在
if [ ! -f "$CURL_FILE" ]; then
  echo -e "${RED}错误: 找不到 $CURL_FILE${NC}"
  exit 1
fi

# 从 curl.txt 提取所有 curl 命令，替换地址
CURLS=()
while IFS= read -r line; do
  if [[ "$line" == curl\ * ]]; then
    # 替换目标地址
    cmd="${line//$ORIGINAL/$TARGET}"
    CURLS+=("$cmd")
  fi
done < "$CURL_FILE"

TOTAL_CURLS=${#CURLS[@]}
if [ "$TOTAL_CURLS" -eq 0 ]; then
  echo -e "${RED}错误: 未从 curl.txt 中提取到任何 curl 命令${NC}"
  exit 1
fi

echo -e "  提取命令: ${GREEN}${TOTAL_CURLS}${NC} 条 curl 请求"
echo -e "  循环轮数: ${GREEN}$(( (TARGET_COUNT + TOTAL_CURLS - 1) / TOTAL_CURLS ))${NC} 轮"
echo ""

# 先测试一下连通性
echo -e "${YELLOW}[测试连通性]${NC} 发送第一条请求..."
FIRST_RESULT=$(eval "${CURLS[0]}" -w "\n%{http_code}" 2>/dev/null || true)
FIRST_CODE=$(echo "$FIRST_RESULT" | tail -1)
if [ "$FIRST_CODE" != "200" ] && [ "$FIRST_CODE" != "201" ]; then
  echo -e "${RED}警告: 第一条请求返回 HTTP $FIRST_CODE，请确认服务是否在 $TARGET 运行${NC}"
  echo -e "响应: $(echo "$FIRST_RESULT" | head -1)"
  read -p "是否继续? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
else
  echo -e "${GREEN}✓ 连通性正常 (HTTP $FIRST_CODE)${NC}"
fi

echo ""
echo -e "${CYAN}开始批量发送...${NC}"
echo ""

SENT=0
SUCCESS=0
FAIL=0
ROUND=0
START_TIME=$(date +%s)

while [ "$SENT" -lt "$TARGET_COUNT" ]; do
  ROUND=$((ROUND + 1))
  echo -e "${YELLOW}── 第 ${ROUND} 轮 ──${NC}"

  for i in "${!CURLS[@]}"; do
    if [ "$SENT" -ge "$TARGET_COUNT" ]; then
      break
    fi

    SENT=$((SENT + 1))
    CMD="${CURLS[$i]}"

    # 发送请求，获取 HTTP 状态码
    HTTP_CODE=$(eval "$CMD" -w "%{http_code}" -o /dev/null 2>/dev/null || echo "000")

    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
      SUCCESS=$((SUCCESS + 1))
      # 每 10 条打印一次进度
      if [ $((SENT % 10)) -eq 0 ] || [ "$SENT" -eq "$TARGET_COUNT" ]; then
        PCT=$((SENT * 100 / TARGET_COUNT))
        echo -e "  ${GREEN}✓${NC} 已发送 ${SENT}/${TARGET_COUNT} (${PCT}%) | 成功: ${SUCCESS} 失败: ${FAIL}"
      fi
    else
      FAIL=$((FAIL + 1))
      echo -e "  ${RED}✗${NC} #${SENT} 失败 (HTTP ${HTTP_CODE})"
    fi
  done
done

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo ""
echo -e "${CYAN}══════════════════════════════════════════${NC}"
echo -e "${CYAN}  测试完成${NC}"
echo -e "${CYAN}══════════════════════════════════════════${NC}"
echo -e "  总发送: ${GREEN}${SENT}${NC} 条"
echo -e "  成功:   ${GREEN}${SUCCESS}${NC} 条"
echo -e "  失败:   ${RED}${FAIL}${NC} 条"
echo -e "  耗时:   ${YELLOW}${DURATION}${NC} 秒"
if [ "$DURATION" -gt 0 ]; then
  QPS=$((SENT / DURATION))
  echo -e "  速率:   ${YELLOW}~${QPS}${NC} 条/秒"
fi
echo ""
