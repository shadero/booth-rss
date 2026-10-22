# BOOTH RSS Lambda

BOOTH検索をAtom / RSS / JSON Feedとして配信するLambda。
ブラウザ不要。リクエストごとに取得し、キャッシュしない。

## 開発

Node.js 24以上を使用する。

```sh
npm ci --include=dev
npm run build
```

`npm run build` はTypeScriptを型チェックし、依存込みのCommonJSを `dist/index.js` に出力する。
型チェックのみなら `npm run typecheck`、既存テストの実行は `npm test`。
Lambda設定はNode.js 24、ハンドラー `index.handler`、メモリ256 MB、タイムアウト35秒。

コードは役割ごとに分けている。

- `models.ts`: 検索条件・商品・フィード・設定の型定義とHTTPエラー
- `config.ts`: クエリから検索URL・リクエスト設定・フィード設定を構築
- `booth.ts`: BOOTHへのリクエスト、HTMLからの商品データの抽出
- `feed.ts`: 商品説明のHTMLとAtom / RSS / JSON Feedの生成
- `index.ts`: Lambdaのリクエスト・レスポンス処理

省略可能な検索条件は `readRequest` で補完し、内部の `RequestInput`・`Config` は全項目を必須にしている。
`event`・`context`・HTTPメソッド・パス・ドメイン・ステージ名の欠損は補完せず、エラーにする。

## GitHub Actions

PRでは型チェック・ビルド・既存テストを実行し、`index.js` を直下に格納した `lambda.zip` を成果物として保存する。
`main` へのpushと `main` 上の手動実行では、同じZIPで **既存Lambdaのコードを更新**する。
デプロイ時の再ビルドは行わない。API GatewayのURLとLambda設定は維持される。
関数・API・実行ロールの新規作成は行わない。

GitHubリポジトリの **Settings → Secrets and variables → Actions → Variables** に設定する。

| 変数 | 内容 | 既定値 |
| --- | --- | --- |
| `AWS_ROLE_ARN` | GitHub Actionsが引き受けるIAMロールのARN | 必須 |
| `AWS_REGION` | 既存Lambdaのリージョン | `ap-southeast-2` |
| `LAMBDA_FUNCTION_NAME` | 既存Lambda名 | `booth-rss` |

### AWSの初回設定

1. IAMのIdentity providersにGitHubのOIDCプロバイダーを登録する。
   Provider URLは `https://token.actions.githubusercontent.com`、Audienceは `sts.amazonaws.com`。
   既に登録済みなら再利用する。
2. このプロバイダーを信頼するIAMロールを作成する。信頼ポリシーの例は下記。
3. このロールに下記のコード更新用ポリシーを付け、ARNを `AWS_ROLE_ARN` に設定する。

`ACCOUNT_ID`、`OWNER`、`REPO` は自分の値に置き換える。

信頼ポリシー（対象リポジトリの `main` のみ）:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "Federated": "arn:aws:iam::ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
    },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        "token.actions.githubusercontent.com:sub": "repo:OWNER/REPO:ref:refs/heads/main"
      }
    }
  }]
}
```

コード更新用ポリシー（リージョン・関数名を変える場合はARNも合わせる）:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": [
      "lambda:UpdateFunctionCode",
      "lambda:GetFunctionConfiguration"
    ],
    "Resource": "arn:aws:lambda:ap-southeast-2:ACCOUNT_ID:function:booth-rss"
  }]
}
```

AWSのアクセスキーをGitHubに保存する必要はない。
OIDC設定: https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws

## 購読

現在の公開先:

```text
https://t4qdujq8n5.execute-api.ap-southeast-2.amazonaws.com/default/booth-rss?tag=Lapwing&age=include
```

| クエリ | 内容 |
| --- | --- |
| `keyword` | 検索キーワード |
| `exclude_keyword` | 除外語（空白・カンマ・読点区切り） |
| `tag` | タグ（空白・カンマ・読点区切り） |
| `category` | カテゴリ名。keywordと併用可 |
| `item_type` | `all`（既定）、`digital`、`physical`、`direct`、`via_warehouse`、`factory_item` |
| `min_price` / `max_price` | 最小価格・最大価格。指定値をBOOTHへ渡す |
| `age` | `all-ages`（既定）、`only`、`include` |
| `format` | `atom`（既定）、`rss`、`json`。大文字小文字不問 |

検索条件の値や価格範囲はこのスクリプトでは検証せず、BOOTH側に任せる。

RSS-Bridgeの `action`、`bridge`、`context` は無視するため、旧BOOTH購読のクエリを引き継げる。
