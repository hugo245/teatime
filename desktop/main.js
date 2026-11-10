// One TeaTime window. Start it several times with different --instance names
// and every copy keeps its own account, camera and storage.
const { app, BrowserWindow, session, shell } = require('electron');
const path = require('node:path');

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const instance = arg('instance', 'a').replace(/[^a-z0-9-]/gi, '').slice(0, 16) || 'a';
const url = arg('url', 'http://localhost:8080/');
const offset = Number(arg('offset', '0')) || 0;

app.setName(`TeaTime ${instance.toUpperCase()}`);
app.setPath('userData', path.join(app.getPath('appData'), `TeaTime-${instance}`));

app.whenReady().then(() => {
  const allowed = new Set(['media', 'audioCapture', 'videoCapture', 'notifications', 'clipboard-sanitized-write']);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, done) => done(allowed.has(permission)));
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));

  const win = new BrowserWindow({
    width: 430,
    height: 880,
    minWidth: 360,
    minHeight: 640,
    title: `TeaTime ${instance.toUpperCase()}`,
    backgroundColor: '#F7F3EE',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false },
  });
  if (offset) {
    const [x, y] = win.getPosition();
    win.setPosition(x + offset, y);
  }
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    void shell.openExternal(target);
    return { action: 'deny' };
  });
  void win.loadURL(url);
});

app.on('window-all-closed', () => app.quit());
