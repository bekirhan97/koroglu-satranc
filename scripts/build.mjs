// Bundles the renderer into dist/ (index.html + renderer.js + renderer.css).
import * as esbuild from 'esbuild';
import fs from 'node:fs';

fs.mkdirSync('dist', { recursive: true });
await esbuild.build({
  entryPoints: { renderer: 'src/renderer/app.js', 'maia-worker': 'src/renderer/core/maia-worker.js' },
  bundle: true,
  outdir: 'dist',
  format: 'esm',
  target: 'chrome120',
  minify: process.argv.includes('--minify'),
  sourcemap: !process.argv.includes('--minify'),
  loader: { '.svg': 'dataurl', '.png': 'dataurl', '.woff': 'dataurl', '.woff2': 'dataurl' },
  logLevel: 'info',
});
fs.writeFileSync('dist/index.html', `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; worker-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:">
<title>Köroğlu Satranç</title>
<link rel="stylesheet" href="renderer.css">
</head>
<body>
<div id="app"></div>
<script type="module" src="renderer.js"></script>
</body>
</html>
`);
