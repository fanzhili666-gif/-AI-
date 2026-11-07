#!/bin/bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$PROJECT_DIR/.env.local"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "缺少 $ENV_FILE，请创建并写入：DASHSCOPE_API_KEY=你的密钥" >&2
  exit 1
fi

export DASHSCOPE_API_KEY="$(
  sed -n 's/^DASHSCOPE_API_KEY[[:space:]]*=[[:space:]]*//p' "$ENV_FILE" | head -n 1
)"
if [[ -z "$DASHSCOPE_API_KEY" ]]; then
  echo "$ENV_FILE 中没有有效的 DASHSCOPE_API_KEY" >&2
  exit 1
fi

/home/ubuntu_user/IrisView/Developer-Kit/bin/irisview run "$HOME/IrisView-Developer-Kit-Data/my-first-app.fuiapp" --allow-debug-unsigned --display-mode mono

