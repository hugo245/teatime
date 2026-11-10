#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appDir = join(root, 'app');
const serverDir = join(root, 'server');
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const requestedPort = Number(option('port', process.env.PORT ?? 8080));
const liveServer = option('server', 'https://teatime.hugoplayzpersonal.workers.dev').replace(/\/+$/, '');
const desktop = flag('desktop');
// The Mac apps use the real server by default so they can call iPhones. Add --local for a private test server.
const live = flag('live') || (desktop && !flag('local'));
const copies = Math.max(1, Math.min(4, Number(option('copies', 2)) || 2));
const phones = Number(option('phones', live ? 1 : 2));
const npm = platform() === 'win32' ? 'npm.cmd' : 'npm';
const npx = platform() === 'win32' ? 'npx.cmd' : 'npx';

function say(message) {
  console.log(`\x1b[32m•\x1b[0m ${message}`);
}

function run(command, commandArgs, cwd, env = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd,
    stdio: 'inherit',
    shell: platform() === 'win32',
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) {
    console.error(`\nCommand failed: ${command} ${commandArgs.join(' ')}`);
    process.exit(result.status ?? 1);
  }
}

function newestFile(path) {
  if (!existsSync(path)) return 0;
  const info = statSync(path);
  if (!info.isDirectory()) return info.mtimeMs;
  let newest = 0;
  for (const entry of readdirSync(path)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    newest = Math.max(newest, newestFile(join(path, entry)));
  }
  return newest;
}

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  console.error(`TeaTime needs Node.js 22.13 or newer. You have ${process.versions.node}. Download it from https://nodejs.org`);
  process.exit(1);
}

function needsInstall(dir, binary) {
  const marker = join(dir, 'node_modules', '.package-lock.json');
  if (!existsSync(marker) || !existsSync(join(dir, 'node_modules', '.bin', binary))) return true;
  return statSync(join(dir, 'package-lock.json')).mtimeMs > statSync(marker).mtimeMs;
}

if (needsInstall(appDir, 'expo')) {
  say('Installing app packages, this takes a few minutes the first time');
  run(npm, ['install', '--no-audit', '--no-fund'], appDir);
}
const desktopDir = join(root, 'desktop');
if (desktop && !existsSync(join(desktopDir, 'node_modules', '.bin', 'electron'))) {
  say('Installing the Mac app shell (Electron), this takes a minute the first time');
  run(npm, ['install', '--no-audit', '--no-fund'], desktopDir);
}
if (needsInstall(serverDir, 'tsc')) {
  say('Installing server packages');
  run(npm, ['install', '--no-audit', '--no-fund'], serverDir);
}

if (flag('rebuild') || newestFile(join(serverDir, 'src')) > newestFile(join(serverDir, 'dist'))) {
  say('Building the server');
  run(npm, ['run', 'build'], serverDir);
}

const webDir = join(appDir, live ? 'dist-live' : 'dist');
const webIndex = join(webDir, 'index.html');
const appSources = Math.max(
  newestFile(join(appDir, 'src')),
  newestFile(join(appDir, 'assets')),
  newestFile(join(appDir, 'app.config.ts')),
  newestFile(join(appDir, 'package-lock.json')),
);
if (flag('rebuild') || !existsSync(webIndex) || appSources > statSync(webIndex).mtimeMs) {
  say('Building the app');
  run(npx, ['expo', 'export', '--platform', 'web', '--output-dir', live ? 'dist-live' : 'dist', '--clear'], appDir, {
    EXPO_NO_TELEMETRY: '1',
    EXPO_OFFLINE: '1',
    EXPO_PUBLIC_SERVER_URL: live ? liveServer : '',
  });
}

async function isFree(candidate) {
  return fetch(`http://localhost:${candidate}/health`).then(() => false, () => true);
}

// A second copy picks the next free port, so two copies can run side by side.
let port = requestedPort;
while (!(await isFree(port))) {
  if (port - requestedPort >= 20) {
    console.error(`No free port found near ${requestedPort}. Close other TeaTime windows and try again.`);
    process.exit(1);
  }
  port += 1;
}
if (port !== requestedPort) say(`Port ${requestedPort} is in use by another copy, using ${port} instead`);

const server = spawn(process.execPath, ['--no-warnings', join(serverDir, 'dist', 'index.js')], {
  cwd: serverDir,
  stdio: ['ignore', 'pipe', 'inherit'],
  env: {
    ...process.env,
    PORT: String(port),
    DATABASE_FILE: join(serverDir, 'data', port === requestedPort ? 'simulator.db' : `simulator-${port}.db`),
    WEB_APP_DIR: webDir,
    SIMULATOR_DIR: join(root, 'simulator', 'public'),
    SUPPORT_EMAIL: process.env.SUPPORT_EMAIL ?? 'support@teatime.app',
  },
});

let opened = false;
server.stdout.on('data', (chunk) => {
  const text = chunk.toString();
  if (flag('verbose')) process.stdout.write(text);
  if (!opened && text.includes('TeaTime server listening')) {
    opened = true;
    if (desktop) {
      launchApps();
      return;
    }
    const url = `http://localhost:${port}/simulator${phones !== 2 ? `?phones=${phones}` : ''}`;
    say(`TeaTime is running at \x1b[1m${url}\x1b[0m  (Ctrl+C to stop)`);
    if (!flag('no-open')) openBrowser(url);
  }
});

function launchApps() {
  const electron = join(desktopDir, 'node_modules', '.bin', platform() === 'win32' ? 'electron.cmd' : 'electron');
  const names = ['a', 'b', 'c', 'd'].slice(0, copies);
  let open = names.length;
  say(`TeaTime is running as ${copies} separate app${copies === 1 ? '' : 's'}  (close the windows or press Ctrl+C to stop)`);
  names.forEach((name, index) => {
    const child = spawn(
      electron,
      [join(desktopDir, 'main.js'), `--instance=${name}`, `--url=http://localhost:${port}/`, `--offset=${index * 460}`],
      { stdio: 'ignore', shell: platform() === 'win32' },
    );
    child.on('exit', () => {
      open -= 1;
      if (open === 0) stop();
    });
  });
}

function openBrowser(url) {
  const command = platform() === 'darwin' ? 'open' : platform() === 'win32' ? 'cmd' : 'xdg-open';
  const commandArgs = platform() === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    spawn(command, commandArgs, { stdio: 'ignore', detached: true }).unref();
  } catch {
    say(`Open ${url} in your browser`);
  }
}

function stop() {
  server.kill('SIGTERM');
  setTimeout(() => process.exit(0), 500);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
server.on('exit', (code) => process.exit(code ?? 0));
