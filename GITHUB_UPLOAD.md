---
description: GitHubへのアップロード方法
---

# GitHubへのアップロード手順

このプロジェクト（`web_report_system` フォルダ内のWebアプリ）をGitHubにアップロードする方法です。

## 前提条件
- GitHubのアカウントを持っていること。
- Gitがパソコンにインストールされていること。

## 手順

### 1. GitHubで新しいリポジトリを作成する
1. [GitHubの新規作成ページ](https://github.com/new) にアクセスします。
2. **Repository name**（リポジトリ名）を入力します（例: `digital-lab-report-web`）。
3. その他の設定はそのままで、**「Create repository」** をクリックします。

### 2. ローカルでGitを初期化する
ターミナルで `h:\CODE\web_report_system` フォルダへ移動し、以下のコマンドを実行します。

```powershell
# フォルダへ移動
cd h:\CODE\web_report_system

# Gitの初期化（※まだ実施していない場合）
git init

# すべてのファイルを追加
git add .
```

### 3. コミットする
```powershell
git commit -m "初回コミット: Webレポートシステム"
```

### 4. GitHubへアップロード（プッシュ）する
GitHubの画面に表示されたコマンドを使ってアップロードします。
`YOUR_USERNAME` と `REPO_NAME` は自分のものに置き換えてください。

```powershell
# リモートリポジトリの登録
git remote add origin https://github.com/YOUR_USERNAME/REPO_NAME.git

# メインブランチの名前設定とアップロード
git branch -M main
git push -u origin main
```

---

## WEB REPORT SYSTEM 構成 (Codespacesでのファイル配置)
GitHub Codespaces でプロジェクトを開くと、以下のファイル構成になります。
これがWebレポートシステムの完全なセットです。

```text
web_report_system/  (リポジトリルート)
 ├── index.html       # メイン画面 (HTML) - レポートシステムの本体
 ├── style.css        # デザイン定義 (CSS)
 ├── app.js           # アプリケーションロジック (JavaScript)
 ├── assets/          # 画像などのリソースフォルダ
 └── GITHUB_UPLOAD.md # アップロード手順書
```

※ `src` フォルダや `app.py` などは含まれません。このフォルダ単体で動作します。

### .gitignore （推奨）
不要なシステムファイルを除外するために、`.gitignore` ファイルを作成する場合は以下を記述します。

```

---
## WEBサイトとしての公開手順 (GitHub Pages)
コードをGitHubにアップロード（プッシュ）した後、以下の設定を行うことで、ブラウザからアクセスできるWebサイトとして公開できます。

1.  GitHubのリポジトリページを開きます。
2.  上部のメニューから **[Settings]** (設定) をクリックします。
3.  左サイドバーの **[Pages]** をクリックします。
4.  **Build and deployment** セクションの **Source** で「**Deploy from a branch**」を選択します。
5.  **Branch** の項目で「**main**」を選択し、フォルダは「**/(root)**」のままにして、[Save] をクリックします。
6.  数分待つと、ページ上部に公開URL（例: `https://username.github.io/digital-lab-report-web/`）が表示されます。

このURLを学生や共有相手に送ることで、Webレポートシステムを利用してもらうことができます。

