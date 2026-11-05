# 建物設備シミュレータ 共通の実装契約（全機構で使い回す）

機構ごとの `<name>/brief.md` と `<name>/refs.md` と一緒に渡す。機構ごとの brief が優先する。

## 前提
- 作業フォルダ: このリポジトリのルート。teardown スキルは `~/.claude/skills/teardown`（SKILL_DIR）。
- 最初に `$SKILL_DIR/SKILL.md` と、見本として **`elevator-shared/` 一式・`elevator-live/main.js`・`elevator-film/`・`elevator/kin.test.mjs`** を読む。構成・命名・書き方はエレベーターに合わせる。
- 共有部品 `building-kit/`（`ui.js` の配色・日本語フォント・パネル、`cursor.js` の自動ツアーのカーソル、`slice.js` の床スラブ）を使う。足してよいが、エレベーターを壊さない。

## フォルダ構成
```
<name>-shared/  kin.js（数式。three.js なし。SPEC 1か所）/ 形状.js / stage.js / console.js / film.js / live.js
<name>-live/main.js
<name>-film/main.js + timeline.json（拍の時刻は秒。台本 SCRIPT と一致させる）
<name>/kin.test.mjs（node:assert。refs.md の「検算」の数値をすべて確かめる）
```

## 守ること
1. 数値は `refs.md` が正本。`kin.js` の `SPEC` に1か所だけ書き、計器・ラベル・姿勢がすべてそこから出る。refs.md と食い違う数値を作らない。食い違いに気づいたら直さずに報告する。
2. `render(t)` は純関数（Math.random・Date・フレーム間の状態なし）。状態を持つもの（制御・歩行者など）は読み込み時に固定刻みで1回だけシミュレーションして配列に入れ、render は読むだけ。
3. 画面は日本語。明るいスタジオ、強調色は `C.accent` の1色だけで「いま働いている部品」に使う。ラベルは部品を隠さない。画面端 60 px に重要物を置かない。
4. live ページ: 放置で自動ツアー（カーソル付き）、どの入力でも操作を渡し、25 秒放置で戻る。`window.LIVE` に現在の状態（`T`, `tour`, `s`）を出す（検査が読む）。TIERS と `kit/warm.js` を使う。
5. HTML は 1 MB 未満。
6. 触らない: `elevator-*`・`elevator/`（読むのは可）、`$SKILL_DIR` 配下、ほかの機構のフォルダ。`building-kit/` を変えたらエレベーターを再ビルドして壊れていないことを確かめる。

## 検証コマンド（すべて通してから報告する）
```
node <name>/kin.test.mjs
tools/td.sh build ./<name>-live && tools/td.sh build ./<name>-film
ls -l teardown-out/dist/<name>-*.html            # 1 MB 未満
tools/td.sh capture ./<name>-film --stills beats --cols 4 --timeline <name>-film/timeline.json --out teardown-out/<name>-beats.png
#   ↑ --timeline を付けないと capture.mjs はスキル側のフォルダで timeline.json を探して失敗する
tools/td.sh capture ./<name>-film --still <T> --out teardown-out/<name>-<T>.png   # 要所を3枚以上
node tools/live-check.mjs teardown-out/dist/<name>-live.html ...                  # 下記
tools/td.sh build ./elevator-live                 # building-kit を変えた場合
```
- capture と live-check はシステムの Chrome（GPU）を使うので、GPU にアクセスできる通常のシェルで実行する。
- 静止画は自分で開いて読み、SKILL.md のチェックリスト（めり込み無し・数値と姿勢の一致・文字切れ無し・ラベルが部品を隠さない・1コマ1焦点）で全拍が通るまで直す。
- `tools/live-check.mjs` はエレベーター専用の作りなので、`--click "<ボタン文字>"` と `--watch "<window.LIVE.s のキー>"` を受けて「クリック後に値が変わったか」を見る汎用版に広げる。引数なしのときはエレベーターの従来動作のまま。

## 報告（この形で返す）
- 変更・作成したファイルの一覧
- 各検証コマンドの結果（テストの件数、HTML のバイト数、live-check の出力）
- 確認した静止画のパスと、見て直した点
- 直せなかった点・refs.md と食い違った点・判断に迷った点
