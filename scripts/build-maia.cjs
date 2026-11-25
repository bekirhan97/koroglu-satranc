// Converts Maia (lc0 .pb.gz) weights into a compact binary the app loads:
//   resources/maia/maia-XXXX.bin = [u32 headerLen][header JSON][u16 params ...]
// Only the layers needed for the policy are kept. Also writes resources/maia/tables.json (lc0 policy map + move list).
// Usage: node scripts/build-maia.cjs <maia_weights dir> <lc0tables.json> <out dir>
const protobuf = require(process.env.PROTOBUFJS || 'protobufjs');
const zlib = require('zlib'); const fs = require('fs'); const path = require('path');
const [src, tables, out] = process.argv.slice(2);
const Net = protobuf.loadSync(path.join(__dirname, 'lc0-net.proto')).lookupType('pblczero.Net');
fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(tables, path.join(out, 'tables.json'));
for (const f of fs.readdirSync(src).filter((x) => x.endsWith('.pb.gz')).sort()) {
  const net = Net.toObject(Net.decode(zlib.gunzipSync(fs.readFileSync(path.join(src, f)))), { longs: Number, bytes: Buffer });
  const w = net.weights;
  const layers = []; const chunks = [];
  const add = (name, l) => {
    if (!l || !l.params || !l.params.length) return;
    layers.push({ name, n: l.params.length / 2, min: l.minVal, max: l.maxVal });
    chunks.push(Buffer.from(l.params));
  };
  const conv = (pre, c) => ['weights', 'biases', 'bnMeans', 'bnStddivs', 'bnGammas', 'bnBetas'].forEach((k) => add(`${pre}.${k}`, c[k]));
  conv('input', w.input);
  w.residual.forEach((r, i) => {
    conv(`res${i}.conv1`, r.conv1); conv(`res${i}.conv2`, r.conv2);
    ['w1', 'b1', 'w2', 'b2'].forEach((k) => add(`res${i}.se.${k}`, r.se[k]));
  });
  conv('policy1', w.policy1);
  conv('policy', w.policy);
  const header = Buffer.from(JSON.stringify({ blocks: w.residual.length, filters: 64, format: net.format.networkFormat, layers }));
  const len = Buffer.alloc(4); len.writeUInt32LE(header.length);
  const pad = Buffer.alloc((2 - ((4 + header.length) % 2)) % 2);
  const name = f.replace('.pb.gz', '.bin');
  fs.writeFileSync(path.join(out, name), Buffer.concat([len, header, pad, ...chunks]));
  console.log(name, layers.length, 'layers', fs.statSync(path.join(out, name)).size, 'bytes');
}
