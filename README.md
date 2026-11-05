# building-teardown

商業ビルの動く設備を、ブラウザで分解しながら触れる3Dシミュレータにしたものです。
ページはどれも1ファイル（1 MB 未満）で、オフラインでも開けます。

**デモ: https://shuyaofficial.github.io/building-teardown/**

| 設備 | 見どころ | ページ |
|---|---|---|
| エレベーター | つり合いおもりとかごの重さの差でモーターのトルクが変わり、軽いかごが上がるときはモーターが発電する（回生） | [elevator-live.html](https://shuyaofficial.github.io/building-teardown/elevator-live.html) |
| 自動ドア | センサーが見張る範囲が 1.0 m だと、1.2 m/s で歩いてきた人が着いたとき戸は 421 mm しか開いていない（1.5 m なら 838 mm） | [autodoor-live.html](https://shuyaofficial.github.io/building-teardown/autodoor-live.html) |
| シャッター | 巻き取るほど半径が増え、同じ回転でも降りる速さとトルクが変わる | [shutter-live.html](https://shuyaofficial.github.io/building-teardown/shutter-live.html) |
| 立体駐車場 | ピット2段の油圧昇降式。車が重いほど油圧が上がるが、上がる速さはポンプの流量で決まるので変わらない | [parking-live.html](https://shuyaofficial.github.io/building-teardown/parking-live.html) |

何も触らないと自動でツアーが流れます。どこかをクリックすると操作できるようになり、25秒触らないとツアーに戻ります。

## 数値の出どころ

寸法・速度・重さは、規格や業界団体・メーカーの資料から取り、出典の無いものは「仮定」と明記しています。
画面の計器と部品の動きは同じ式から出しているので、表示と動きが食い違いません。
各設備の `refs.md`（例: [autodoor/refs.md](autodoor/refs.md)）に出典と手計算の検算があり、`kin.test.mjs` がその値を確かめます。

```bash
node autodoor/kin.test.mjs
```

## 作り方

土台は OSS の [teardown](https://github.com/elvarofficial/teardown)（機械の3Dシミュレータを作る Claude Code のスキル）です。
ビルの外観は Blender のアドオン [Building Tools](https://github.com/ranjian0/building_tools) で作りました（`building/make_building.py`）。

```bash
# teardown を ~/.claude/skills/teardown に入れてから
tools/td.sh build ./autodoor-live        # → teardown-out/dist/autodoor-live.html
tools/publish-pages.sh                   # 全ページをビルドして docs/ にそろえる
```

| フォルダ | 中身 |
|---|---|
| `<設備>-shared/` | 数式（`kin.js`）、形状、照明、計器、ツアー台本、操作 |
| `<設備>-live/` `<設備>-film/` | 触るページと、ツアーの録画用 |
| `<設備>/` | 仕様と出典（`refs.md`）と検算テスト |
| `building-kit/` | 全設備で使う配色・日本語の計器盤・カーソル |
| `tools/` | ビルドと検査のスクリプト、実装の依頼文のひな形 |
| `promo/` | 紹介動画のナレーション原稿と、合成のスクリプト（音声は VOICEVOX:ずんだもん、または Chatterbox） |

実装は Claude Code（Anthropic）に依頼文を渡して作りました。共通の契約は `tools/BRIEF-TEMPLATE.md`、軽量版の追加ルールは `tools/BRIEF-LIGHT.md`、自動ドアの依頼文は `autodoor/brief.md` です。

## ライセンス

このリポジトリのコードは MIT ライセンスです（[LICENSE](LICENSE)）。
同梱・利用している OSS と書体は [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) にまとめています。
