const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

// セキュリティ警告を抑制（ローカルファイル用アプリのため）
process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';

// GPU プロセス障害によるレンダリング・入力不具合を回避
// (仮想環境・一部のグラフィックドライバーで GPU が利用できない場合の対策)
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('disable-gpu-sandbox');

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: '総合工学システム実験実習 M2 レポート作成システム',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // ローカルファイルからのリソース読み込みを許可
      webSecurity: false,
    },
    // タスクバー・タイトルバーのデフォルト設定
    show: false, // 準備完了後に表示
  });

  // index.html を読み込む
  win.loadFile(path.join(__dirname, 'index.html'));

  // 準備完了後にウィンドウを表示（白い点滅を防止）
  win.once('ready-to-show', () => {
    win.show();
  });

  // 外部リンクはデフォルトブラウザで開く
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // 開発時のみ DevTools を開く
  if (process.env.NODE_ENV === 'development') {
    win.webContents.openDevTools();
  }
}

// アプリ起動
app.whenReady().then(() => {
  createWindow();

  // macOS: ドックアイコンクリックでウィンドウ再作成
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// すべてのウィンドウが閉じられたらアプリを終了（macOS以外）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
