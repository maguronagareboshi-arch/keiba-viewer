# 高知競馬ビューア (yukochi.com) 開発ガイド — Claude / Codex 共通

このリポジトリ (`C:\Users\kouki\keiba-deploy`) が高知競馬ビューアの**アプリコードの正本**。
ここで直接編集 → commit → push が正式フロー。**push = 本番デプロイ**(GitHub Pages・反映まで最大10分)。

- 旧ソースrepo(`デスクトップ\高知競馬`)の index.html は **2026-07-15 で凍結・アーカイブ**。もう編集しない。
- ⛔**`ドキュメント\高知競馬ビューア改善` にもアプリコードの複製がある**(Codexの旧作業場・最終コミット2026-07-23・未コミット79ファイル)。**アプリコードとしては2026-07-27で止まった写しなので編集しない**。ただし**このrepoに無い研究資産の唯一の置き場**なので消さないこと(下記「研究・データ生成」)。
- 門別/南関ビューア(keiba.html 等)は**別プロジェクト「他場」の所有物**。このプロジェクトからは読み取り専用。

## 0. 研究・データ生成の置き場(このrepoの外)

`C:\Users\kouki\OneDrive\ドキュメント\高知競馬ビューア改善` にだけ存在する(gitignore対象でGitHubには無い):

| パス | 中身 |
|---|---|
| `data\complete-v3\2026-07-11\generated\ranking_choice_sets_v3.jsonl` | 501MB・15,185レース(2014〜2026/07/11)。`legacy_v2_anchor.score_approx`＝現行AI順位の近似を全馬に付けた凍結データセット |
| `experiments\ranking_vnext\build_shipped_ai_seiseki.py` | 「AIの成績」2025〜2026版の生成元(**凍結**・再現性のため変更しない) |
| `experiments\ranking_vnext\build_shipped_ai_seiseki_years.py` | 同・**年度別2021〜2026版**の生成元。出力を `AI_SEISEKI_SHIPPED` へ貼る |
| `experiments\ranking_vnext\build_ai_insights.py` | `ai-insights.js` の相手候補監査定数の生成元 |
| `experiments\complete_v3\generate_v3.py` | 上のデータセット自体の生成(score_approx の式もここ) |
| `research\shadow-v2-frozen-source\scandata_by_year_v2\` | 2014〜2026の年別スキャンデータ(manifest.json 必須) |

⛔ここで作った集計を貼るときは、**必ず既存の窓で数字が再現することを確認**してから差し替える(年度別版は2025〜2026の1241Rを完全再現することを確認済み)。

## 1. ファイル地図

| パス | 役割 |
|---|---|
| `index.html` | 高知ビューアのシェル(HTML+基本CSS+起動コード)。`KV_APP_CSS` 配列の定義もここ |
| `modules/app-main.js` | 本体。UI描画・データ取得/保存・出馬表・結果・区間ラップ(`LAP_SEG_ENDS`)・`escapeHTML`/`jsAttrEsc` 等の共通関数 |
| `modules/ai-analysis.js` | AI予想・詳細分析(遅延ロード)。予想スコア計算・印・`KVX_PUBLIC_UI_DEFAULT` |
| `modules/ai-insights.js` | 軽量AI予想キャッシュ・信頼度校正・相手候補監査(予想順位そのものは変更しない) |
| `modules/first3f-autofill.js` | 前半3F自動補完(1300/1400m)+区間ラップ和 `auto:lap_sum_v1` |
| `modules/track-bias-v2.js` | 馬場差v2(画面用の純時計値とAI用の展開補正を同じ材料から生成) |
| `modules/admin-horse-data.js` | 管理者が公式DataRoomを取得する時だけの遅延モジュール |
| `modules/performance-observer.js` | 起動性能計測 |
| `modules/era-drift-shadow.js` `pace-v2-shadow.js` `jra-transfer-shadow.js` `partner-vnext-*.js` `value-t10-shadow.js` `probability-calibration.js` | **forward shadow 検証専用。本番の印・買い目を変更してはならない(凍結)** |
| `data/3f/` | 映像計測の前半3F配信データ(生成元: `高知競馬\01_高知映像計測\auto3f`) |
| `data/kochi-user-laps.js` | 手計測区間ラップ259レース(生成元: `lapexport.py`)。DB空欄のレースだけ埋める保険 |
| `data/kochi-pace-baselines-v2.js` `kochi-roster-baselines.*` | ペース/ローテ基準の生成データ(手編集しない) |
| `data/replay/` | 展開リプレイ用の実測タイムライン |
| `sw.js` | Service Worker |
| `keiba.html` `monbetsu.html` `nankan.html` `simulator.html` `sim3d.html` `vendor/` | **他場プロジェクト所有 — 触らない**(`.preserved-production-files` 参照) |

## 2. デプロイの掟(CI gate)

push すると `.github/workflows/pages.yml` → `validate-production.py` が走り、**検証に落ちると公開されない**。

1. **新しい公開ファイルは `.production-files` に登録必須**(ソート順・重複なし)。登録漏れ=本番に出ない。
2. **追跡ファイル = `.production-files` + `.preserved-production-files` + SUPPORT_FILES と完全一致**が強制される。repo に一時ファイル・未登録ファイルを置かない(他場の deploy.sh が `git add -A` するため巻き込まれて CI が落ちる)。
3. 秘密情報スキャンあり(鍵・トークンをコード/文書に書かない)・1ファイル2MB上限。
4. push 前にローカルで確認: `py -X utf8 .github/scripts/validate-production.py .`
5. モジュールを更新したら index.html の `?v=` キャッシュバスターも更新する。
6. push 前に `git pull origin main`(他マシン・Web編集の取り込み)。

## 3. 不可侵(ユーザー承認なしに変更禁止)

- **予測ロジック**: スコア計算(computeYosoScored)・学習係数(KV_ML_WEIGHTS_DEFAULT / getMlLiveWeights)・印は totalScore 降順の ◎○▲△× のみ(新しい印を足さない)。
- **shadow系モジュール**は凍結・forward検証専用。本番の印/買い目/保存先に接続しない。
- `LAP_SEG_ENDS`(app-main.js)と `lapexport.py` の `SEG_ENDS` は**同一の表**。片方だけ変更禁止。
- DB `keiba_races.lap_times`・前半3F とも、**値が入っている行/欄を推定で上書きしない**(空欄のみ埋める)。
- 他場所有ファイル(上の表参照)。

## 4. コーディング規約

- **XSS**: 外部由来の文字列(馬名・騎手・コメント・検索語など)は HTML 挿入前に `escapeHTML()`、onclick 等の属性内に埋める時は `jsAttrEsc()`。生 innerHTML 連結禁止。
- **CSS 追加は `KV_APP_CSS` 配列(index.html)の1箇所のみ**。新規UIにインライン色指定禁止(ダークテーマ上書き漏れ防止)。
- 管理者専用UIは `.admin-only`、閲覧者専用は `.viewer-only` のペアで出し分け。
- **閲覧者に見える文言に専門用語を出さない**(EV / ROI / SI / shadow / 市場アンカー等 → 平易な日本語へ)。オッズ表現は「オッズ帯」(1桁台/10倍台/20倍台…)のみで、「買える/妙味/お得/中穴」等の価値判断語は禁止。
- Supabase の大量取得は offset ページングではなく **id カーソル方式**(PostgREST の1000行上限・一時500対策)。

## 5. 検証(push 前スモーク)

- pageerror 0 / 390・768・1440px で横スクロール 0 / 匿名アクセスで管理者UIが漏れない。
- ブラウザ検証は Playwright + システムEdge(`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe` を executable_path に指定)。アプリ内ブラウザのスクショはこの重いappではタイムアウトしやすい。
- 本番確認: https://yukochi.com/ (キャッシュ max-age=600)。

## 6. コミット規約

- 1行目: `種別: 日本語の要約` — 種別は fix / feat / data / perf / docs / deploy。
  例: `data(3f): 高知1600m を60レースへ(決勝線Sの探索窓を後ろに拡張)`
- 本文に「何をどう検証したか」を1〜3行で書く。

## 7. 周辺プロジェクト(このrepoの外)

- **映像計測**(3F/ラップの生産): `デスクトップ\高知競馬\01_高知映像計測\auto3f` — `newday.py` が fetch→OCR→DB を自動化。出力がこの repo の `data/` に入る。
- **研究・データ生成**: `ドキュメント\高知競馬ビューア改善` — 上の「0. 研究・データ生成の置き場」参照。
- **門別/南関ソース**: `デスクトップ\他場` — `bash deploy.sh` がこの repo へコピーして push する。
- **DB**: Supabase(project jcrcftvrsgmsewwdkqha)。ビューアは匿名キーで読むだけ。書き込みはローカルスクリプト経由のみ。
- **オッズ自動記録**: ローカル `capture_odds.py` + Windows タスクスケジューラ。
- **旧UIテスト資産**: `高知競馬\tests\ui`(Playwright 約200件)。モノリシック時代の index.html が対象で、現行のモジュール構成に対しては要改修。
