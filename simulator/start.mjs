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

const port = Number(option('port', process.env.PORT ?? 8080));
const live = flag('live');
const liveServer = option('server', 'https://teatime.hugoplayzpersonal.workers.dev').replace(/\/+$/, '');
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

const server = spawn(process.execPath, ['--no-warnings', join(serverDir, 'dist', 'index.js')], {
  cwd: serverDir,
  stdio: ['ignore', 'pipe', 'inherit'],
  env: {
    ...process.env,
    PORT: String(port),
    DATABASE_FILE: join(serverDir, 'data', 'simulator.db'),
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
    const url = `http://localhost:${port}/simulator${phones !== 2 ? `?phones=${phones}` : ''}`;
    say(`TeaTime is running at \x1b[1m${url}\x1b[0m  (Ctrl+C to stop)`);
    if (!flag('no-open')) openBrowser(url);
  }
});

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
