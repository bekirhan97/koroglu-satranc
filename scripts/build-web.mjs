// Builds the web student system into web/dist (static files for GitHub Pages).
import * as esbuild from 'esbuild';
import fs from 'node:fs';

const out = 'web/dist';
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out + '/data', { recursive: true });
await esbuild.build({
  entryPoints: { app: 'web/src/main.js', 'maia-worker': 'src/renderer/core/maia-worker.js' },
  bundle: true,
  outdir: out,
  format: 'esm',
  target: ['chrome100', 'safari15', 'firefox100'],
  minify: process.argv.includes('--minify'),
  sourcemap: !process.argv.includes('--minify'),
  loader: { '.svg': 'dataurl', '.png': 'dataurl', '.woff': 'dataurl', '.woff2': 'dataurl' },
  logLevel: 'info',
});
fs.copyFileSync('resources/puzzles.json', out + '/data/puzzles.json');
fs.copyFileSync('resources/openings.json', out + '/data/openings.json');
fs.copyFileSync('resources/miniatures.pgn', out + '/data/miniatures.pgn');
fs.cpSync('resources/maia', out + '/data/maia', { recursive: true });
fs.cpSync('web/vendor/stockfish', out + '/engine', { recursive: true });
fs.copyFileSync('build-src/icon.png', out + '/icon.png');
const v = Date.now().toString(36);
fs.writeFileSync(out + '/index.html', `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#17110f">
<meta name="robots" content="noindex">
<title>Köroğlu Satranç · Öğrenci Sistemi</title>
<link rel="icon" href="icon.png">
<link rel="apple-touch-icon" href="icon.png">
<link rel="stylesheet" href="app.css?v=${v}">
</head>
<body>
<div id="app"></div>
<script type="module" src="app.js?v=${v}"></script>
</body>
</html>
`);
fs.writeFileSync(out + '/.nojekyll', '');
console.log('web/dist hazır');
