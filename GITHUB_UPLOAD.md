---
description: GitHubへのアップロード方法
---

# GitHubへのアップロード手順

このプロジェクト（`h:\CODE` 以下のファイル）をGitHubにアップロードする方法です。

## 前提条件
- GitHubのアカウントを持っていること。
- Gitがパソコンにインストールされていること。

## 手順

### 1. GitHubで新しいリポジトリを作成する
1. [GitHubの新規作成ページ](https://github.com/new) にアクセスします。
2. **Repository name**（リポジトリ名）を入力します（例: `digital-lab-report`）。
3. その他の設定はそのままで、**「Create repository」** をクリックします。
   （※「Initialize this repository with a README」などにはチェックを入れないでください）

### 2. ローカルでGitを初期化する
ターミナル（PowerShellなど）を開き、プロジェクトのルートフォルダ（`h:\CODE`）で以下のコマンドを実行します。

```powershell
# プロジェクトフォルダへ移動
cd h:\CODE

# Gitの初期化
git init

# すべてのファイルを追加（コミットの準備）
git add .
```

### 3. コミットする
```powershell
# 最初の保存（コミット）
git commit -m "初回コミット: 実験レポートシステムのコード"
```

### 4. GitHubへアップロード（プッシュ）する
GitHubのリポジトリ画面に表示されているコマンド（「…or push an existing repository from the command line」の部分）を使います。
`YOUR_USERNAME` と `REPO_NAME` は自分のものに置き換えてください。

```powershell
# リモートリポジトリ（GitHub）のアドレスを登録
git remote add origin https://github.com/YOUR_USERNAME/REPO_NAME.git

# メインブランチの名前を 'main' に設定
git branch -M main

# GitHubへアップロード
git push -u origin main
```

これでアップロードは完了です。

---
## 補足：不要なファイルを除外する (.gitignore)
アップロード時に不要な一時ファイルなどが含まれないように、`.gitignore` という名前のファイルを `h:\CODE` に作成し、以下のように記述することをお勧めします。

```text
__pycache__/
*.pyc
.venv/
.streamlit/
*.tmp
```

## GitHub/Codespaces での推奨ファイル構成
GitHub Codespaces でスムーズに動作させるために、リポジトリの中身は以下のような構成になっていることが望ましいです。

```text
(リポジトリのルート)
 ├── .gitignore             # 不要なファイルを除外する設定
 ├── app.py                 # Streamlitのメインスクリプト
 ├── requirements.txt       # 必要なライブラリ一覧 (Codespacesが自動認識します)
 └── web_report_system/     # HTML/CSS/JS などのリソースフォルダ
      ├── index.html
      ├── style.css
      ├── app.js
      └── ...
```

※ `requirements.txt` がルートにあることで、Codespaces 起動時にライブラリが自動インストールされます。

