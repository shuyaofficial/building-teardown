#!/bin/zsh
# teardown のビルドと静止画撮影を、システムの Chrome を使う設定で呼ぶ（macOS 前提）。
#   tools/td.sh build ./elevator-live
#   tools/td.sh capture ./elevator-film --stills beats --cols 4 --out teardown-out/elevator-beats.png
# 付属の Playwright Chromium は Mac の headless で WebGL が作れない（SwiftShader で失敗）ため、
# 本物の Chrome（Metal）を使う。GPU にアクセスできる通常のシェルで実行する。
set -e
SKILL_DIR="${SKILL_DIR:-$HOME/.claude/skills/teardown}"
cd "$(dirname "$0")/.."
export CHROMIUM="${CHROMIUM:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
cmd="$1"; shift
case "$cmd" in
  build)   exec node "$SKILL_DIR/sims/build.mjs" "$@" ;;
  capture) exec node "$SKILL_DIR/sims/capture.mjs" "$@" --size 1600x900 --dpr 1 ;;
  *) echo "usage: td.sh build|capture <folder> [args]"; exit 1 ;;
esac
