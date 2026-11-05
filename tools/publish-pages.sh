#!/bin/zsh
# 公開用: 各機構の live ページとハブをビルドし、GitHub Pages が配る docs/ にそろえる。
#   tools/publish-pages.sh            # ビルドしてコピー
#   tools/publish-pages.sh --no-build # dist にあるものをコピーするだけ
set -e
cd "$(dirname "$0")/.."
NAMES=(elevator autodoor shutter parking)
if [[ "$1" != "--no-build" ]]; then
  for n in $NAMES hub; do
    [[ -d "$n-live" ]] && tools/td.sh build "./$n-live"
  done
fi
mkdir -p docs
touch docs/.nojekyll
for n in $NAMES; do
  f="teardown-out/dist/$n-live.html"
  [[ -f "$f" ]] && cp "$f" "docs/$n-live.html"
done
[[ -f teardown-out/dist/hub-live.html ]] && cp teardown-out/dist/hub-live.html docs/index.html
# ビルドは著作権コメントを落とす（esbuild の legalComments: 'none'）ので、各ページの先頭に表示を差し込む
for f in docs/*.html(N); do
  python3 - "$f" tools/license-header.html <<'PY'
import sys
page, head = open(sys.argv[1]).read(), open(sys.argv[2]).read()
if "Full license texts: THIRD_PARTY_NOTICES.md" not in page:
    i = page.lower().find("<head>")
    page = page[: i + 6] + "\n" + head + page[i + 6 :] if i >= 0 else head + page
    open(sys.argv[1], "w").write(page)
PY
done
# 隣に置く外部ファイル（build.json の external）があれば一緒に運ぶ
for g in teardown-out/dist/*.glb(N); do cp "$g" docs/; done
ls -l docs
# 1 MB を超えるページがあれば止める（リンクのプレビューが出なくなる）
big=$(find docs -name '*.html' -size +1000k)
[[ -z "$big" ]] || { echo "1 MB を超えるページ: $big"; exit 1; }
