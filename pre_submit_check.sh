#!/bin/bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
IRISVIEW_BIN="${IRISVIEW_BIN:-/home/ubuntu_user/IrisView/Developer-Kit/bin/irisview}"
PACKAGE_PATH="${PACKAGE_PATH:-$PROJECT_DIR/../my-first-app.fuiapp}"

if [[ ! -x "$IRISVIEW_BIN" ]]; then
  echo "找不到可执行的 IrisView CLI：$IRISVIEW_BIN" >&2
  exit 1
fi

cd "$PROJECT_DIR"
npm test
for source_file in src/*.js; do
  node --check "$source_file"
done
git diff --check
"$IRISVIEW_BIN" build "$PROJECT_DIR"
"$IRISVIEW_BIN" package "$PROJECT_DIR" --debug-unsigned --output "$PACKAGE_PATH"
"$IRISVIEW_BIN" verify "$PACKAGE_PATH" --allow-debug-unsigned

echo "pre-submit check passed"
