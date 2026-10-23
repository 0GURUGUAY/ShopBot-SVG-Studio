const { app, BrowserWindow, dialog } = require('electron');
const path = require('node:path');

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 900,
    minHeight: 650,
    backgroundColor: '#171a18',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.session.on('will-download', (event, item) => {
    item.pause();
    void dialog.showSaveDialog(window, {
      defaultPath: path.join(app.getPath('downloads'), item.getFilename()),
      filters: [{ name: 'Fichier ShopBot', extensions: ['sbp'] }],
    }).then(({ canceled, filePath }) => {
      if (canceled || !filePath) {
        item.cancel();
        return;
      }
      item.setSavePath(filePath);
      item.resume();
    }).catch((error) => {
      console.error('Impossible d’ouvrir la boîte de dialogue d’enregistrement :', error);
      item.cancel();
    });
  });

  void window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
