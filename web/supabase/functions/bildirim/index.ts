// Köroğlu Öğrenci Sistemi – telefon/bilgisayar bildirimleri (Web Push).
//   anahtar → { publicKey }                    (girişsiz; VAPID açık anahtarı, ilk çağrıda üretilir)
//   gonder  → antrenör: { ids, title, body, url, tag } akademideki kullanıcılara gönderir
//   deneme  → girişli kullanıcı: kendi cihazlarına deneme bildirimi
// VAPID özel anahtarı yalnızca app_secrets tablosunda (RLS açık, politika yok → yalnızca service role okur).
import { createClient } from "npm:@supabase/supabase-js@2";
import { generateVapidKeys, sendPush } from "./webpush.js";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUBJECT = "https://bekirhan97.github.io/koroglu-satranc/";
const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const fail = (msg: string, status = 400) => json({ error: msg }, status);

type Keys = { privateJwk: JsonWebKey; publicKey: string };
let cached: Keys | null = null;
async function vapid(): Promise<Keys> {
  if (cached) return cached;
  const read = async () => (await admin.from("app_secrets").select("value").eq("name", "vapid").maybeSingle()).data?.value as Keys | undefined;
  let k = await read();
  if (!k) {
    await admin.from("app_secrets").upsert({ name: "vapid", value: await generateVapidKeys() }, { onConflict: "name", ignoreDuplicates: true });
    k = await read();
  }
  if (!k) throw new Error("VAPID anahtarı oluşturulamadı");
  cached = k;
  return k;
}

async function caller(req: Request) {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data } = await admin.auth.getUser(token);
  if (!data?.user) return null;
  const { data: p } = await admin.from("profiles").select("id, role, coach_id").eq("id", data.user.id).maybeSingle();
  if (!p) return null;
  return { ...p, academy: p.role === "coach" && !p.coach_id ? p.id : p.coach_id };
}

const clean = (s: unknown, n: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

async function deliver(userIds: string[], msg: Record<string, string>) {
  if (!userIds.length) return { users: 0, devices: 0, sent: 0 };
  const keys = await vapid();
  const { data: subs } = await admin.from("push_subs").select("endpoint, user_id, p256dh, auth").in("user_id", userIds);
  const results = await Promise.allSettled((subs ?? []).map((s) => sendPush(s, msg, keys, SUBJECT)));
  const gone: string[] = [];
  let sent = 0;
  results.forEach((r, i) => {
    if (r.status === "fulfilled") { if (r.value.ok) sent++; if (r.value.gone) gone.push(subs![i].endpoint); }
  });
  if (gone.length) await admin.from("push_subs").delete().in("endpoint", gone);
  return { users: new Set((subs ?? []).map((s) => s.user_id)).size, devices: (subs ?? []).length, sent };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("POST bekleniyor", 405);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("Geçersiz istek"); }
  try {
    if (body.action === "anahtar") return json({ publicKey: (await vapid()).publicKey });
    const me = await caller(req);
    if (!me) return fail("Giriş gerekli", 401);
    if (body.action === "deneme") {
      return json(await deliver([me.id], { title: "Bildirimler açık ✓", body: "Yeni ödev, ders ve duyurular bu cihaza bildirim olarak gelecek.", url: "#home", tag: "deneme" }));
    }
    if (body.action === "gonder") {
      if (me.role !== "coach") return fail("Yalnızca antrenörler bildirim gönderebilir", 403);
      const ids = Array.isArray(body.ids) ? [...new Set(body.ids.map(String))].slice(0, 300) : [];
      if (!ids.length) return json({ users: 0, devices: 0, sent: 0 });
      // only people in the caller's academy
      const { data: ps } = await admin.from("profiles").select("id, coach_id").in("id", ids);
      const allowed = (ps ?? []).filter((p) => p.id === me.academy || p.coach_id === me.academy).map((p) => p.id);
      const url = clean(body.url, 100);
      const msg = { title: clean(body.title, 80) || "Köroğlu Satranç", body: clean(body.body, 200), url: url.startsWith("#") ? url : "#home", tag: clean(body.tag, 60) };
      return json(await deliver(allowed, msg));
    }
    return fail("Bilinmeyen işlem");
  } catch (e) {
    return fail("Bildirim hatası: " + (e instanceof Error ? e.message : String(e)), 500);
  }
});
