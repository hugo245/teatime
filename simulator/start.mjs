#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { networkInterfaces, platform } from 'node:os';
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
const phones = Number(option('phones', 2));
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

if (!existsSync(join(appDir, 'node_modules'))) {
  say('Installing app packages (first run only, this takes a minute)');
  run(npm, ['ci', '--no-audit', '--no-fund'], appDir);
}
if (!existsSync(join(serverDir, 'node_modules'))) {
  say('Installing server packages');
  run(npm, ['ci', '--no-audit', '--no-fund'], serverDir);
}

if (flag('rebuild') || newestFile(join(serverDir, 'src')) > newestFile(join(serverDir, 'dist'))) {
  say('Building the server');
  run(npm, ['run', 'build'], serverDir);
}

const webIndex = join(appDir, 'dist', 'index.html');
const appSources = Math.max(
  newestFile(join(appDir, 'src')),
  newestFile(join(appDir, 'assets')),
  newestFile(join(appDir, 'app.config.ts')),
  newestFile(join(appDir, 'package-lock.json')),
);
if (flag('rebuild') || !existsSync(webIndex) || appSources > statSync(webIndex).mtimeMs) {
  say('Building the TeaTime app for the simulator');
  run(npx, ['expo', 'export', '--platform', 'web', '--output-dir', 'dist', '--clear'], appDir, {
    EXPO_NO_TELEMETRY: '1',
    EXPO_OFFLINE: '1',
    EXPO_PUBLIC_SERVER_URL: '',
  });
}

say('Starting the TeaTime server');
const server = spawn(process.execPath, ['--no-warnings', join(serverDir, 'dist', 'index.js')], {
  cwd: serverDir,
  stdio: ['ignore', 'pipe', 'inherit'],
  env: {
    ...process.env,
    PORT: String(port),
    DATABASE_FILE: join(serverDir, 'data', 'simulator.db'),
    WEB_APP_DIR: join(appDir, 'dist'),
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
    console.log('');
    say(`Simulator ready at \x1b[1m${url}\x1b[0m`);
    const lan = Object.values(networkInterfaces())
      .flat()
      .filter((net) => net && net.family === 'IPv4' && !net.internal)
      .map((net) => `http://${net.address}:${port}`);
    if (lan.length) {
      say(`To call a real iPhone on the same Wi-Fi, set its server address to ${lan[0]}`);
      say('(Profile, then hold your finger on the version number for two seconds)');
    }
    say('Press Ctrl+C to stop');
    if (!flag('no-open')) openBrowser(url);
  }
});

function openBrowser(url) {
  const command = platform() === 'darwin' ? 'open' : platform() === 'win32' ? 'cmd' : 'xdg-open';
  const commandArgs = platform() === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    spawn(command, commandArgs, { stdio: 'ignore', detached: true }).unref();
  } catch {
    say(`Open ${url} in Chrome, Edge, Safari or Firefox`);
  }
}

function stop() {
  server.kill('SIGTERM');
  setTimeout(() => process.exit(0), 500);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
server.on('exit', (code) => process.exit(code ?? 0));
