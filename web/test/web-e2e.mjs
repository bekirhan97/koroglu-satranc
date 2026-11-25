// Çalıştırma: cd web/dist && python3 -m http.server 8765 &  ;  node web/test/web-e2e.mjs  (sahte Supabase ve sahte Lichess ile)
// End-to-end test of the web student system against the real Supabase project (temporary test accounts).
import { chromium } from 'playwright';
import fs from 'node:fs';
import { createMock } from './mock-supa.mjs';
const MOCK = process.env.REAL ? null : createMock();
if (MOCK) MOCK.addUser('test.antrenor', 'testsifre123', { role: 'coach', display_name: 'Test Antrenör' });

const URL = process.env.URL || 'http://localhost:8765/';
const OUT = 'scratch/web-shots';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const LICHESS_LOG = [];
const errors = [];
async function newPage(viewport = { width: 1280, height: 820 }) {
  const ctx = await browser.newContext({ viewport });
  if (MOCK) await MOCK.attach(ctx);
  // fake Lichess (OAuth + public API) so the linking flow can be tested offline
  await ctx.route('https://lichess.org/**', (route) => {
    const u = new globalThis.URL(route.request().url());
    const j = (b) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(b) });
    if (u.pathname === '/api/token') return route.request().method() === 'DELETE' ? route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } }) : j({ access_token: 'lio_test', token_type: 'Bearer' });
    const nd = (objs) => route.fulfill({ status: 200, contentType: 'application/x-ndjson', headers: { 'access-control-allow-origin': '*' }, body: objs.map((o) => JSON.stringify(o)).join('\n') + '\n' });
    if (u.pathname === '/api/stream/event') return nd([{ type: 'challenge', challenge: { id: 'C1', challenger: { id: 'rakip1', name: 'Rakip1', rating: 1400 }, destUser: { id: 'koroglukid', name: 'KorogluKid' }, rated: false, timeControl: { type: 'clock', limit: 300, increment: 3 } } }]);
    if (u.pathname === '/api/account/playing') return j({ nowPlaying: [] });
    if (u.pathname === '/api/challenge/C1/accept') return j({ ok: true });
    if (u.pathname.startsWith('/api/challenge/')) { LICHESS_LOG.push(u.pathname + ' ' + route.request().postData()); return j({ id: 'C2', destUser: { name: u.pathname.split('/').pop() }, timeControl: { type: 'clock', limit: 600, increment: 0 } }); }
    if (u.pathname === '/api/board/game/stream/G1') return nd([{ type: 'gameFull', id: 'G1', white: { id: 'koroglukid', name: 'KorogluKid', rating: 1342 }, black: { id: 'rakip1', name: 'Rakip1', rating: 1400 }, initialFen: 'startpos',
      state: { type: 'gameState', moves: 'e2e4 e7e5', wtime: 300000, btime: 298000, winc: 3000, binc: 3000, status: 'started' } }]);
    if (u.pathname.startsWith('/api/board/game/G1/')) { LICHESS_LOG.push(u.pathname); return j({ ok: true }); }
    if (u.pathname === '/api/account' || u.pathname.startsWith('/api/user/')) return j({ username: 'KorogluKid', perfs: { blitz: { rating: 1342, games: 210, prov: false }, rapid: { rating: 1418, games: 64 }, puzzle: { rating: 1650, games: 900 } } });
    return route.fulfill({ status: 404, body: '' });
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return page;
}
const shot = (page, n) => page.screenshot({ path: `${OUT}/${n}.png` });
async function sq(page, s, white) {
  const b = await page.locator('cg-board').boundingBox();
  const f = s.charCodeAt(0) - 97, r = +s[1] - 1, z = b.width / 8;
  await page.mouse.click(b.x + (white ? f : 7 - f) * z + z / 2, b.y + (white ? 7 - r : r) * z + z / 2);
}
async function play(page, uci, white) {
  await sq(page, uci.slice(0, 2), white); await page.waitForTimeout(120); await sq(page, uci.slice(2, 4), white);
  if (uci[4]) { await page.waitForTimeout(200); const opts = page.locator('.promo-btn'); if (await opts.count()) await opts.nth('qrbn'.indexOf(uci[4])).click(); }
}
const step = (s) => console.log('▸', s);
async function nav(page, text) {
  const item = page.locator(`.nav-item:has-text("${text}")`).first();
  if (await item.isVisible()) return item.click();
  await page.click('.nav-more'); await page.waitForTimeout(300);
  await page.click(`.more-item:has-text("${text}")`);
}

// ---------- coach login ----------
const c = await newPage();
await c.goto(URL); await c.waitForTimeout(2000);
await shot(c, '01-giris');
step('antrenör girişi');
await c.fill('input[placeholder="Kullanıcı adı"]', 'test.antrenor');
await c.fill('input[placeholder="Şifre"]', 'testsifre123');
await c.click('button:has-text("Giriş yap")');
await c.waitForSelector('.home', { timeout: 20000 }); await c.waitForTimeout(800);
await shot(c, '02-antrenor-ana');

step('öğrenci hesabı aç');
await c.click('.nav-item:has-text("Antrenör")'); await c.waitForTimeout(1200);
await c.click('.tab:has-text("Hesaplar")'); await c.waitForTimeout(1500);
await shot(c, '03-hesaplar-bos');
await c.click('button:has-text("Öğrenci hesabı aç")');
await c.fill('.modal input[placeholder="Öğrencinin adı soyadı"]', 'Test Öğrenci Şükrü');
await c.fill('.modal input[placeholder^="örn. Cumartesi"]', 'Cumartesi 10:00');
const studentUser = await c.inputValue('.modal input[placeholder="kullanıcı adı"]');
const studentPass = await c.locator('.modal .form-row input').nth(2).inputValue();
await c.click('.modal button:has-text("Hesabı aç")');
await c.waitForSelector('.cred', { timeout: 20000 });
await shot(c, '04-hesap-acildi');
console.log('  öğrenci', studentUser, studentPass);
await c.click('.modal button:has-text("Tamam")'); await c.waitForTimeout(1500);
await shot(c, '05-hesaplar');

step('motor + maia (antrenör tarayıcısı)');
const eng = await c.evaluate(async () => { const t = Date.now(); const r = await window.api.analyse({ fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4', depth: 12 }, 0); return { best: r.bestmove, ms: Date.now() - t, err: r.error }; });
console.log('  stockfish:', JSON.stringify(eng));
const maia = await c.evaluate(async () => {
  const w = new Worker('maia-worker.js', { type: 'module' });
  const call = (m, tr) => new Promise((ok, no) => { w.onmessage = (e) => e.data.ok ? ok(e.data) : no(new Error(e.data.error)); w.postMessage({ ...m, id: 1 }, tr || []); });
  await call({ type: 'tables', tables: await window.api.maiaTables() });
  const b = await window.api.maiaWeights(1500); const buf = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  await call({ type: 'load', elo: 1500, buffer: buf }, [buf]);
  const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const r = await call({ type: 'policy', elo: 1500, history: [fen], legal: ['e2e4', 'd2d4', 'g1f3', 'c2c4', 'a2a3'] });
  w.terminate(); return r.policy[0].uci;
});
console.log('  maia:', maia);

step('video ekle');
await c.click('.nav-item:has-text("Videolar")'); await c.waitForTimeout(1500);
await c.click('button:has-text("+ Video ekle")');
await c.fill('.modal input[placeholder="https://youtu.be/…"]', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
await c.fill('.modal input[placeholder="Örn. Çatal nedir?"]', 'Test videosu: Çatal');
await c.fill('.modal input[placeholder^="Örn. Taktik"]', 'Taktik');
await c.click('.modal button:has-text("Kaydet")'); await c.waitForTimeout(2000);
await shot(c, '05b-videolar');

step('Tahmin Et: hazır koleksiyon + analiz');
await c.click('.nav-item:has-text("Hamleyi Tahmin Et")'); await c.waitForTimeout(1500);
await shot(c, '05c-gtm');
const colBtn = c.locator('button:has-text("Hazır koleksiyon")');
if (await colBtn.count()) { await colBtn.first().click(); await c.waitForTimeout(1500); await shot(c, '05d-koleksiyon');
  await c.click('.modal button:has-text("Ekle")'); await c.waitForTimeout(1500);
  if (await c.locator('.modal-back').count()) await c.click('.modal button:has-text("Kapat")').catch(() => {});
  await c.waitForTimeout(800); await shot(c, '05d2-gtm-liste'); }

step('Açılış: repertuvar içe aktar');
await c.click('.nav-item:has-text("Açılış")'); await c.waitForTimeout(1500);
await c.waitForTimeout(1000); await shot(c, '05e0-acilis-once');
const [fc] = await Promise.all([c.waitForEvent('filechooser', { timeout: 10000 }), c.click('button:has-text("Repertuvar İçe Aktar")')]);
await fc.setFiles('web/test/rep.pgn'); await c.waitForTimeout(1000);
await c.click('.modal button:has-text("İçe aktar")'); await c.waitForTimeout(1200);
await shot(c, '05e-acilis');

step('ödev ver');
await c.click('.nav-item:has-text("Antrenör")'); await c.waitForTimeout(1200);
await c.click('.tab:has-text("Ödev ver")'); await c.waitForTimeout(1500);
await c.fill('input.big-input[placeholder^="Örn. Hafta"]', 'Hafta 1 – Çatal');
await c.click('button:has-text("Tema seçkisi ekle")'); await c.waitForTimeout(300);
await c.waitForTimeout(1500);
const vchk = c.locator('.panel:has(.panel-title:has-text("Videolar")) input[type=checkbox]');
console.log('  ödevde video seçeneği:', await vchk.count());
const gchk = c.locator('.panel:has(.panel-title:has-text("Hamleyi Tahmin Et")) input[type=checkbox]');
console.log('  ödevde Tahmin Et oyunu:', await gchk.count()); if (await gchk.count()) await gchk.first().check();
const rchk = c.locator('.panel:has(.panel-title:has-text("Açılış repertuvarları")) input[type=checkbox]');
console.log('  ödevde repertuvar:', await rchk.count()); if (await rchk.count()) await rchk.first().check();
if (await vchk.count()) await vchk.first().check();
await shot(c, '06-odev-ver');
await c.click('button:has-text("Öğrencilere gönder")'); await c.waitForTimeout(3000);
await shot(c, '07-kime');
await c.click('.modal button:has-text("Hepsi")');
await c.click('.modal button:has-text("Gönder")'); await c.waitForTimeout(3000);

step('duyuru gönder');
await c.click('.tab:has-text("Duyurular")'); await c.waitForSelector('.panel-title:has-text("Yeni duyuru")'); await c.waitForTimeout(300);
await c.fill('textarea.paste', 'Bu cumartesi ders yok. Pazar 14:00\'te Lichess turnuvası var!');
await c.click('button.btn.primary:text-is("Duyur")'); await c.waitForTimeout(1500);
await shot(c, '07b-duyurular');
// a second student with a report, so the leaderboard has someone to compare with
const sid2 = MOCK.addUser('test.ayse', 'x123456', { role: 'student', display_name: 'Ayşe Yılmaz', coach_id: MOCK.db.profiles[0].id, group_name: 'Cumartesi 10:00', leaderboard_ok: true });
await c.click('.tab:has-text("Hesaplar")'); await c.waitForTimeout(1500);
await c.locator('table.accounts tbody tr:has-text("Şükrü") input[type=checkbox]').check(); await c.waitForTimeout(800);
console.log('  sıralama onayı:', MOCK.db.profiles.find((x) => x.username === studentUser).leaderboard_ok);
MOCK.db.reports.push({ student_id: sid2, report: { activity: { days: [{ key: '2026-11-25', puzzles: 12 }], streak: { current: 3 } }, ratings: { puzzles: { r: 1620 } } } });

// ---------- student ----------
step('başantrenör: ikinci antrenör + özel ders öğrencisi');
await c.click('.tab:has-text("Antrenörler")'); await c.waitForSelector('button:has-text("+ Antrenör hesabı aç")');
await c.click('button:has-text("+ Antrenör hesabı aç")');
await c.fill('.modal input[placeholder="Antrenörün adı soyadı"]', 'Ahmet Kaya');
await c.waitForTimeout(200);
const coach2User = await c.inputValue('.modal input[placeholder="kullanıcı adı"]');
console.log('  2. antrenör kullanıcı adı:', coach2User);
const coach2Pass = await c.locator('.modal .form-row input').nth(2).inputValue();
await c.click('.modal button:has-text("Hesabı aç")'); await c.waitForSelector('.cred'); await c.click('.modal button:has-text("Tamam")'); await c.waitForTimeout(1200);
await shot(c, '07c-antrenorler');
await c.click('.tab:has-text("Hesaplar")'); await c.waitForSelector('button:has-text("+ Öğrenci hesabı aç")');
await c.click('button:has-text("+ Öğrenci hesabı aç")');
await c.fill('.modal input[placeholder="Öğrencinin adı soyadı"]', 'Zeynep Demir');
await c.click('.modal .seg button:has-text("Özel ders")');
await c.click('.modal .coach-pick label:has-text("Ahmet Kaya") input');
await c.click('.modal button:has-text("Hesabı aç")'); await c.waitForSelector('.cred'); await c.click('.modal button:has-text("Tamam")'); await c.waitForTimeout(1500);
await shot(c, '07d-hesaplar-filtre');
await c.selectOption('.filter-sel', 'ozel'); await c.waitForTimeout(1200);
console.log('  özel ders filtresi:', await c.locator('table.accounts tbody tr').count(), 'öğrenci');
await c.selectOption('.filter-sel', 'all'); await c.waitForTimeout(800);
const c2 = await newPage();
await c2.goto(URL); await c2.waitForSelector('.login-card'); await c2.waitForTimeout(1500);
await c2.fill('input[placeholder="Kullanıcı adı"]', coach2User); await c2.fill('input[placeholder="Şifre"]', coach2Pass);
await c2.click('button:has-text("Giriş yap")');
await c2.waitForSelector('.home', { timeout: 20000 });
await c2.click('.nav-item:has-text("Antrenör")'); await c2.waitForTimeout(800);
await c2.click('.tab:has-text("Hesaplar")'); await c2.waitForTimeout(1500);
console.log('  2. antrenör: öğrenci sayısı', await c2.locator('table.accounts tbody tr').count(), '· Antrenörler sekmesi', await c2.locator('.tab:has-text("Antrenörler")').count());
await c2.selectOption('.filter-sel', 'mine'); await c2.waitForTimeout(1000);
console.log('  2. antrenör "benim öğrencilerim":', await c2.locator('table.accounts tbody tr').count());
await shot(c2, '07e-ikinci-antrenor');

step('ders programı: grup ekle, yoklama, tek seferlik ders');
await c.click('.nav-item:has-text("Program")'); await c.waitForTimeout(2000);
await shot(c, '07f-program-bos');
await c.click('button:has-text("+ İlk grubu ekle")'); await c.waitForTimeout(500);
await c.fill('.modal input[placeholder^="Örn. Cumartesi"]', 'Cumartesi 10:00');
await c.fill('.modal input[placeholder^="Örn. Salon"]', 'Salon 1');
await c.click('.modal label.pick:has-text("Şükrü") input'); await c.click('.modal label.pick:has-text("Ayşe") input');
await c.click('.modal button:has-text("Kaydet")'); await c.waitForTimeout(2000);
console.log('  programdaki ders kartı:', await c.locator('.lesson').count(), '· Şükrü grubu:', MOCK.db.profiles.find((x) => x.username === studentUser).group_name);
await c.click('.lesson'); await c.waitForTimeout(500);
await c.click('.modal button:has-text("Hepsi geldi")');
await c.fill('.modal textarea.paste', 'Çatal: 1. bölüm. Ödev: 10 bulmaca.');
await shot(c, '07g-yoklama');
await c.click('.modal button:has-text("Kaydet")'); await c.waitForTimeout(1500);
console.log('  yoklama kaydı:', MOCK.db.attendance.length, '· oturum:', MOCK.db.sessions.length);
await c.click('button:has-text("+ Tek seferlik ders")'); await c.waitForTimeout(400);
await c.fill('.modal input[placeholder^="Örn. Telafi"]', 'Özel ders – Zeynep');
await c.click('.modal label.pick:has-text("Zeynep") input');
await c.click('.modal button:has-text("Ekle")'); await c.waitForTimeout(1500);
console.log('  tek seferlik ders sonrası kart:', await c.locator('.lesson').count());
await shot(c, '07h-program');

step('öğrenci girişi');
const s = await newPage({ width: 390, height: 844 });
await s.goto(URL); await s.waitForTimeout(2500);
await shot(s, '08-giris-telefon');
await s.fill('input[placeholder="Kullanıcı adı"]', studentUser);
await s.fill('input[placeholder="Şifre"]', 'yanlis-sifre');
await s.click('button:has-text("Giriş yap")'); await s.waitForTimeout(2500);
console.log('  yanlış şifre:', await s.textContent('.login-err'));
await s.fill('input[placeholder="Şifre"]', studentPass);
await s.click('button:has-text("Giriş yap")');
await s.waitForSelector('.home', { timeout: 20000 }); await s.waitForTimeout(2500);
await shot(s, '09-ogrenci-ana-telefon');
console.log('  sonraki ders kartı:', await s.locator('.next-lesson').count());
console.log('  ödev görünüyor:', await s.locator('.asg-title').count(), '· duyuru:', await s.locator('.ann-panel .ann-row').count(), '· sıralama:', await s.locator('.lb-panel').count(), '· kurulum kartı:', await s.locator('.install-card').count());

await nav(s, 'Program'); await s.waitForTimeout(1500);
console.log('  öğrencinin programı:', await s.locator('.next-row').count(), 'ders');
await shot(s, '09a-program-telefon');
await nav(s, 'Ana Sayfa'); await s.waitForTimeout(1000);
step('video izle (telefon)');
await s.click('.asg-part:has-text("video")'); await s.waitForTimeout(3000);
await shot(s, '09b-video-telefon');
const izledim = s.locator('button:has-text("İzledim")');
if (await izledim.count()) { await izledim.click(); await s.waitForTimeout(800); }
await nav(s, 'Ana Sayfa'); await s.waitForTimeout(1500);
await shot(s, '09c-ana-sonra');

step('Tahmin Et (telefon)');
await nav(s, 'Tahmin'); await s.waitForTimeout(1500);
await shot(s, '09e-gtm-liste-telefon');
const firstGame = s.locator('table.gtm-games tbody button:has-text("Oyna")').first();
if (await firstGame.count()) { await firstGame.click(); await s.waitForTimeout(2500); if (await s.locator('.modal').count()) { await shot(s, '09f0-gtm-modal'); await s.locator('.modal .btn.primary').first().click(); await s.waitForTimeout(4000); } await shot(s, '09f-gtm-oyun-telefon'); }

step('Açılış Tekrarı (telefon)');
await nav(s, 'Açılış'); await s.waitForTimeout(1500);
await shot(s, '09g-acilis-telefon');

step('Lichess bağla (sahte Lichess ile)');
await s.evaluate(() => sessionStorage.setItem('lichess-oauth', JSON.stringify({ verifier: 'v'.repeat(60), state: 'S1' })));
await s.goto(URL + '?code=abc&state=S1'); await s.waitForSelector('.home', { timeout: 20000 }); await s.waitForTimeout(2500);
console.log('  url temizlendi:', !s.url().includes('code='));
await nav(s, 'Ayarlar'); await s.waitForTimeout(1000);
console.log('  ayarlarda:', await s.locator('.set-row:has-text("Lichess") b').textContent().catch(() => 'yok'));
await shot(s, '09h-ayarlar-lichess');

step("Lichess'te Oyna (sahte Lichess)");
MOCK.db.lichess_accounts.push({ user_id: MOCK.db.profiles[0].id, coach_id: MOCK.db.profiles[0].id, display_name: 'Test Antrenör', username: 'HocaBekir' });
await s.evaluate(() => localStorage.setItem('koroglu-lichess-oyun', JSON.stringify({ token: 't', username: 'KorogluKid', id: 'koroglukid', expires: Date.now() + 86400e3 })));
await nav(s, 'Lichess'); await s.waitForTimeout(2500);
await shot(s, '09i-lichess-lobi-telefon');
console.log('  gelen davet:', await s.locator('.challenge-panel .challenge-row').count(), '· arkadaş listesi:', await s.locator('.friend-list .challenge-row').count());
await s.click('.friend-list button:has-text("Davet et")'); await s.waitForTimeout(800);
await s.click('.challenge-panel button:has-text("Kabul et")'); await s.waitForTimeout(500);
await s.evaluate(() => window.goTo('lichess:G1')); await s.waitForTimeout(1000);
await play(s, 'g1f3', true); await s.waitForTimeout(500);
await shot(s, '09j-lichess-oyun-telefon');
await nav(s, 'Bulmaca').catch(() => {}); await s.waitForTimeout(800);
console.log('  maç sırasında başka bölüme geçiş engellendi:', await s.locator('.lp-status').count() > 0);
console.log('  motor kapalı:', JSON.stringify(await s.evaluate(() => window.api.analyse({ fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', depth: 5 }))));
console.log('  Lichess istekleri:', LICHESS_LOG.join(' | '));
await s.click('.lp-layout button:has-text("Teslim ol")'); await s.waitForTimeout(400);
await s.click('.modal button:has-text("Teslim ol")'); await s.waitForTimeout(400);
console.log('  Lichess istekleri (son):', LICHESS_LOG.slice(-1).join(''));
await s.click('.lp-leave'); await s.waitForTimeout(800);

step('motora karşı oyun (telefon)');
await nav(s, 'Oyna').catch(() => {}); await s.waitForTimeout(1500);
await shot(s, '09d0-oyna-liste');
const startBtn = s.locator('button:has-text("Oyunu başlat"), button:has-text("Başla")').first();
if (await startBtn.count()) { await startBtn.click(); await s.waitForTimeout(3000); }
await shot(s, '09d-oyna-telefon');

step('bulmaca antrenman (telefon)');
await nav(s, 'Bulmacalar'); await s.waitForSelector('cg-board', { timeout: 30000 }); await s.waitForTimeout(1500);
await shot(s, '10-bulmaca-telefon');

step('Rush (masaüstü boyutu)');
await s.setViewportSize({ width: 1280, height: 820 });
await s.click('.tab:has-text("Rush")'); await s.waitForTimeout(800);
await shot(s, '11-rush-baslangic');
await s.click('.storm-go'); await s.waitForTimeout(1500);
for (let n = 0; n < 10; n++) {
  const st = await s.evaluate(() => window.__storm || null);
  if (st && st.moves[st.step]) await play(s, st.moves[st.step], st.color === 'w');
  await s.waitForTimeout(700);
}
console.log('  rush skor', await s.textContent('.storm-score'));
await shot(s, '12-rush-oynarken');
await s.click('.storm-side button:has-text("Bitir")'); await s.waitForTimeout(1500);
await shot(s, '13-rush-son');

step('Sıralama (Rush 3 dk, akademi)');
await nav(s, 'Sıralama'); await s.waitForTimeout(1500);
await s.click('.lb-controls button:has-text("Rush 3 dk")'); await s.waitForTimeout(400);
await s.click('.lb-controls button:has-text("Akademi geneli")'); await s.waitForTimeout(1200);
console.log('  skor kaydı:', MOCK.db.scores.length, '· sıralama satırı:', await s.locator('table.lb tr').count());
await shot(s, '13b-siralama');
await nav(s, 'Bulmaca'); await s.waitForTimeout(1500);

step('Streak');
await s.click('.tab:has-text("Streak")'); await s.waitForTimeout(800);
await s.click('.storm-go'); await s.waitForTimeout(1500);
for (let n = 0; n < 4; n++) {
  const st = await s.evaluate(() => window.__storm || null);
  if (st && st.moves[st.step]) await play(s, st.moves[st.step], st.color === 'w');
  await s.waitForTimeout(700);
}
await s.click('.storm-side button:has-text("Atla")'); await s.waitForTimeout(800);
await shot(s, '14-streak');
await s.click('.storm-side button:has-text("Bitir")'); await s.waitForTimeout(1500);

step('ödev setini çöz');
await s.click('.tab:has-text("Setlerim")'); await s.waitForTimeout(800);
await shot(s, '15-setlerim');
await s.click('.set-card button:has-text("Başla")'); await s.waitForTimeout(1500);
await shot(s, '16-set-bulmaca');

step('raporu gönder (çıkış)');
await nav(s, 'Ayarlar'); await s.waitForTimeout(800);
await shot(s, '17-ayarlar');
await s.click('button:has-text("Çıkış yap")'); await s.waitForTimeout(4000);

step('antrenör ilerlemeyi görür');
await c.click('.nav-item:has-text("Antrenör")'); await c.waitForTimeout(1200);
await c.click('.tab:has-text("Öğrencilerim")'); await c.waitForTimeout(500);
await c.click('button:has-text("Yenile")'); await c.waitForTimeout(2500);
await shot(c, '18-ogrencilerim');
const rows = await c.locator('table.students tbody tr').count();
console.log('  öğrenci satırı:', rows);
if (rows) { await c.click('table.students tbody tr'); await c.waitForTimeout(1500); await shot(c, '19-ogrenci-detay');
  console.log('  lichess paneli:', await c.locator('.lichess-panel').count()); }

step('antrenör: ödev takibi, sıralama, ödevi geri al');
await c.click('.tab:has-text("Ödevler")'); await c.waitForTimeout(2000);
await c.click('.asg-card button:has-text("Öğrenciler")'); await c.waitForTimeout(400);
await shot(c, '20-odevler');
await c.click('.tab:has-text("Sıralama")'); await c.waitForTimeout(1500);
await shot(c, '21-siralama');
await c.click('.tab:has-text("Ödevler")'); await c.waitForTimeout(1500);
await c.click('.asg-card button:has-text("Geri al")'); await c.click('.modal button:has-text("Ödevi geri al")'); await c.waitForTimeout(1500);
console.log('  kalan ödev kartı:', await c.locator('.asg-card').count());
step('öğrenci tekrar girer: ödev kalkmış olmalı');
await s.fill('input[placeholder="Kullanıcı adı"]', studentUser); await s.fill('input[placeholder="Şifre"]', studentPass);
await s.click('button:has-text("Giriş yap")'); await s.waitForSelector('.home', { timeout: 20000 }); await s.waitForTimeout(2500);
console.log('  öğrencide kalan ödev:', await s.locator('.asg-title').count());
await shot(s, '22-ogrenci-odev-kalkti');

console.log('\nHATALAR:', errors.length ? errors.join('\n') : 'yok');
await browser.close();
