import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [exportDir, outDir, releaseUrl] = process.argv.slice(2);
if (!exportDir || !outDir || !releaseUrl) {
  console.error('Usage: node scripts/make-update.mjs <export dir> <out dir> <release download url>');
  process.exit(1);
}

const MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  ttf: 'font/ttf',
  otf: 'font/otf',
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  mp4: 'video/mp4',
  json: 'application/json',
  html: 'text/html',
};

const root = resolve(exportDir);
const out = resolve(outDir);
const base = releaseUrl.replace(/\/+$/, '');
mkdirSync(out, { recursive: true });

const metadata = JSON.parse(readFileSync(join(root, 'metadata.json'), 'utf8'));
const expoConfig = JSON.parse(readFileSync(join(root, 'expoConfig.json'), 'utf8'));
const runtimeVersion = expoConfig.runtimeVersion;
if (typeof runtimeVersion !== 'string' || !runtimeVersion) {
  console.error('The app config needs a fixed runtimeVersion string.');
  process.exit(1);
}

function hashes(file) {
  const data = readFileSync(file);
  return {
    hash: createHash('sha256').update(data).digest('base64url'),
    key: createHash('md5').update(data).digest('hex'),
  };
}

function uuidFrom(text) {
  const hex = createHash('sha256').update(text).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function publish(path, ext, contentType) {
  const { hash, key } = hashes(join(root, path));
  const name = `${key}.${ext}`;
  copyFileSync(join(root, path), join(out, name));
  return { hash, key, fileExtension: `.${ext}`, contentType, url: `${base}/${name}` };
}

const createdAt = new Date().toISOString();

for (const [platform, files] of Object.entries(metadata.fileMetadata)) {
  const launchAsset = publish(files.bundle, 'bundle', 'application/javascript');
  const assets = files.assets.map((asset) => publish(asset.path, asset.ext, MIME[asset.ext] ?? 'application/octet-stream'));
  const manifest = {
    id: uuidFrom([platform, runtimeVersion, launchAsset.hash, ...assets.map((a) => a.hash)].join(':')),
    createdAt,
    runtimeVersion,
    launchAsset,
    assets,
    metadata: {},
    extra: { expoClient: expoConfig },
  };
  writeFileSync(join(out, `manifest-${platform}.json`), JSON.stringify(manifest));
  console.log(`${platform}: update ${manifest.id} for runtime ${runtimeVersion} with ${assets.length} assets`);
}
