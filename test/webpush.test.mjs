// Round trip: encrypt as the push server would, decrypt as the browser would (RFC 8291 / RFC 8188),
// and verify the VAPID token signature.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encryptPayload, generateVapidKeys, b64u, _test } from '../web/supabase/functions/bildirim/webpush.js';

const enc = new TextEncoder();
const { hmac, concat } = _test;

async function decrypt(body, ua, auth) {
  const salt = body.slice(0, 16);
  const idlen = body[20];
  const asPublic = body.slice(21, 21 + idlen);
  const cipher = body.slice(21 + idlen);
  const uaPublic = new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey));
  const asKey = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, ua.privateKey, 256));
  const prkKey = await hmac(auth, ecdh);
  const ikm = await hmac(prkKey, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic, new Uint8Array([1])));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, cipher));
  let end = plain.length - 1;
  while (plain[end] === 0) end--;
  assert.equal(plain[end], 2, 'son kayıt ayracı');
  return new TextDecoder().decode(plain.slice(0, end));
}

test('Web Push: şifrelenen bildirim tarayıcı tarafında çözülür', async () => {
  const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const p256dh = b64u.enc(await crypto.subtle.exportKey('raw', ua.publicKey));
  const msg = JSON.stringify({ title: 'Yeni ödev', body: 'Çatal – 10 bulmaca', url: '#home' });
  const body = await encryptPayload(msg, p256dh, b64u.enc(auth));
  assert.equal(body[20], 65);
  assert.equal(await decrypt(body, ua, auth), msg);
});

test('VAPID: imza açık anahtarla doğrulanır', async () => {
  const keys = await generateVapidKeys();
  const hdr = await _test.vapidHeader('https://fcm.googleapis.com/fcm/send/abc', keys, 'https://example.org/');
  const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(hdr);
  assert.ok(m);
  const payload = JSON.parse(new TextDecoder().decode(b64u.dec(m[2])));
  assert.equal(payload.aud, 'https://fcm.googleapis.com');
  const pub = await crypto.subtle.importKey('raw', b64u.dec(m[4]), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  assert.ok(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, b64u.dec(m[3]), enc.encode(m[1] + '.' + m[2])));
  assert.equal(b64u.dec(keys.publicKey).length, 65);
});
