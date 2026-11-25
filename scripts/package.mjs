// Packages the app for Windows (x64) and macOS (Apple Silicon + Intel).
// Usage: node scripts/package.mjs [win32-x64 darwin-arm64 darwin-x64]
import { packager } from '@electron/packager';
import fs from 'node:fs';
import path from 'node:path';

const targets = process.argv.slice(2).length ? process.argv.slice(2) : ['win32-x64', 'darwin-arm64', 'darwin-x64'];
const root = process.cwd();
const out = path.join(root, 'out');

for (const t of targets) {
  const [platform, arch] = t.split('-');
  // Stage only this platform's engine as resources/engines/<platform-arch>/...
  const stage = path.join(root, 'out', 'stage', t);
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(path.join(stage, 'engines'), { recursive: true });
  fs.cpSync(path.join(root, 'resources', 'engines', t), path.join(stage, 'engines', t), { recursive: true });

  const paths = await packager({
    dir: root,
    out,
    name: platform === 'win32' ? 'Koroglu Satranc' : 'Köroğlu Satranç',
    executableName: platform === 'win32' ? 'Koroglu Satranc' : 'Köroğlu Satranç',
    platform,
    arch,
    overwrite: true,
    asar: true,
    prune: true,
    icon: platform === 'darwin' ? path.join(root, 'build-src', 'icon.icns') : undefined,
    appBundleId: 'com.koroglu.satranc',
    appCategoryType: 'public.app-category.education',
    extraResource: [
      path.join(stage, 'engines'),
      path.join(root, 'resources', 'openings.json'),
      path.join(root, 'resources', 'puzzles.json'),
      path.join(root, 'resources', 'maia'),
      path.join(root, 'resources', 'licenses'),
    ],
    ignore: [/^\/scratch/, /^\/resources/, /^\/scripts/, /^\/out/, /^\/src\/renderer/, /\.map$/, /^\/node_modules/],
  });
  console.log(t, '->', paths.join(', '));
}
