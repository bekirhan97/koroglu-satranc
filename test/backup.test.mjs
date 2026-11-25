// Yedekleme: al → geri yükle döngüsü, bozuk/yanlış dosya reddi, otomatik yedeklerde 7 kopya sınırı.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const backup = createRequire(import.meta.url)('../src/main/backup.cjs');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'kyedek-'));
function seed(dir) {
  fs.mkdirSync(path.join(dir, 'gtm', 'analysis'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'profile.json'), JSON.stringify({ name: 'Ayşe', ratings: { puzzles: { r: 1620 } } }));
  fs.writeFileSync(path.join(dir, 'gtm', 'games.json'), JSON.stringify([{ id: 'a' }]));
  fs.writeFileSync(path.join(dir, 'gtm', 'analysis', 'a.json'), JSON.stringify({ plies: { 3: { depth: 18 } } }));
}

test('yedek al ve geri yükle: tüm dosyalar aynen döner, fazlalar silinir', () => {
  const root = tmp(), data = path.join(root, 'data');
  seed(data);
  const out = path.join(root, 'y.kyedek');
  const r = backup.createBackup(data, out, '0.3.0');
  assert.equal(r.files, 3);
  fs.writeFileSync(path.join(data, 'profile.json'), JSON.stringify({ name: 'Değişti' }));
  fs.writeFileSync(path.join(data, 'fazla.json'), '{}');
  const b = backup.readBackup(out);
  assert.equal(b.profileName, 'Ayşe');
  backup.restoreBackup(data, b);
  assert.equal(JSON.parse(fs.readFileSync(path.join(data, 'profile.json'), 'utf8')).name, 'Ayşe');
  assert.ok(fs.existsSync(path.join(data, 'gtm', 'analysis', 'a.json')));
  assert.ok(!fs.existsSync(path.join(data, 'fazla.json')));
  assert.ok(!fs.existsSync(data + '.onceki') && !fs.existsSync(data + '.geriyukle'));
});

test('yanlış ya da bozuk dosya reddedilir', () => {
  const root = tmp();
  const a = path.join(root, 'a.kyedek'); fs.writeFileSync(a, 'çöp');
  assert.throws(() => backup.readBackup(a), /bozuk/);
  const b = path.join(root, 'b.kyedek'); backup.writeGzJson(b, { format: 'baska', files: {} });
  assert.throws(() => backup.readBackup(b), /yedek dosyası değil/);
  const c = path.join(root, 'c.kyedek'); backup.writeGzJson(c, { format: 'koroglu-yedek', files: { '../kotu.json': '{}' } });
  assert.throws(() => backup.readBackup(c), /geçersiz/);
});

test('otomatik yedek: günde bir, en fazla 7 kopya', () => {
  const root = tmp(), data = path.join(root, 'data'), bdir = path.join(root, 'backups');
  seed(data);
  const day = 86400000;
  let t = Date.UTC(2026, 10, 1, 9);
  assert.ok(backup.autoBackup(data, bdir, '0.3.0', { now: t }));
  const first = backup.listBackups(bdir)[0];
  fs.utimesSync(first.path, t / 1000, t / 1000);
  assert.equal(backup.autoBackup(data, bdir, '0.3.0', { now: t + 3600000 }), null, 'aynı gün ikinci yedek yok');
  for (let i = 1; i <= 10; i++) {
    t += day;
    const r = backup.autoBackup(data, bdir, '0.3.0', { now: t });
    fs.utimesSync(r.path, t / 1000, t / 1000);
  }
  assert.equal(backup.listBackups(bdir).length, 7);
});

test('profil yoksa otomatik yedek alınmaz', () => {
  const root = tmp();
  assert.equal(backup.autoBackup(path.join(root, 'data'), path.join(root, 'b'), '0.3.0'), null);
});
