# 会計年度任用職員制度 FAQ・マニュアル検索

会計年度任用職員制度のマニュアルを対象に、Q&A インデックスと本文検索を行う静的 Web アプリです。

このサブプロジェクトは、既存のデスクトップアプリとは分離して、GitHub Pages で公開できる形を前提にします。

## 現在の段階

MVP実装済みです。GitHub Pages に配置できる静的 HTML/CSS/JavaScript と、生成済み検索索引 JSON を含みます。

## 使い方

```powershell
npm run format:manual
npm run build
npm run check
npm run serve
```

`npm run format:manual` は、本文の意味・文字順を変えず、長文を句点単位で改行します。続く `npm run build` で、その改行を保持した検索索引を再生成します。

`npm run serve` の後、ブラウザで `http://localhost:4173/` を開きます。

GitHub Pages では、このフォルダの内容を公開対象にしてください。外部 API、Cookie、アクセス解析は使っていません。

## GitHub Pagesで公開する手順

1. このフォルダを独立した公開リポジトリへpushします。
2. GitHubのリポジトリ設定で Pages の Source を `GitHub Actions` にします。
3. `main` ブランチへpushすると、`.github/workflows/pages.yml` が索引を再生成・検証して公開します。

公開先のGitHubアカウントとリポジトリ名は、このローカル実装には固定していません。

## 構成

- `index.html`: 検索 UI
- `assets/`: 画面用 JavaScript / CSS
- `source/manual.md`: 検索対象の原MD
- `source/README.md`: 原資料とMarkdown化に関する説明
- `scripts/format-manual.mjs`: 公開用MDの長文に読みやすい改行を追加
- `scripts/build-index.mjs`: 原MDからJSON索引を生成
- `scripts/serve.mjs`: ローカル確認用の簡易サーバー
- `data/`: 生成済みJSON
- `tests/validate-index.mjs`: 索引検証

検索画面には、Q&Aの質問文で頻出する賃金・労働条件関係の語を選べるキーワードボタンを用意しています。用語上の違いを保つため、「期末手当」と「勤勉手当」、「再度の任用」と「再度任用」はそれぞれ別の検索語として扱います。

「Q&A一覧」では111件の問番号と質問文を分類順に表示し、選択した質問の回答全文を右側に表示します。
初期表示はQ&A一覧とし、キーボードフォーカスは検索語欄へ置きます。検索対象は「全体」が既定です。
右側の詳細欄では長文を段落化し、表形式の部分は横スクロールできる状態で表示します。デスクトップでは詳細欄内をスクロールでき、モバイルではページ全体の自然なスクロールへ切り替わります。

## 文書

- [企画書](docs/plan.md)
- [仕様書](docs/spec.md)
- [根拠・前提整理](docs/evidence.md)

## 基本方針

第1段階は外部APIを使わず、ブラウザ内でQ&Aとマニュアル本文を検索します。第2段階で生成AIを追加する場合は、検索結果を根拠として回答案を作るサーバー側APIを別途設け、APIキーをGitHub Pagesへ置きません。

## 件数について

当初はQ&A 114件を想定していましたが、原MDで設問見出しとして抽出できるものは111件です。`^問` に一致する残り3件は回答本文中の参照文であり、Q&A見出しとして扱っていません。
