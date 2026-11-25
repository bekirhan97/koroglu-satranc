// Köroğlu Öğrenci Sistemi – hesap işlemleri (service role yalnızca burada).
//   durum            → { hasCoach }                       (girişsiz)
//   kurulum          → ilk antrenör hesabı                (girişsiz, yalnızca hiç antrenör yokken)
//   ogrenci_ac       → antrenör öğrenci hesabı açar
//   ogrenci_guncelle → ad / grup / şifre değiştirir
//   ogrenci_sil      → hesabı siler
//   antrenor_ac / antrenor_guncelle / antrenor_sil → yalnızca başantrenör (akademinin sahibi)
// Akademi: başantrenör = coach_id'si boş antrenör; diğer antrenörlerin ve öğrencilerin coach_id'si = başantrenör.
import { createClient } from "npm:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
export const EMAIL_DOMAIN = "kullanici.koroglu-satranc.app";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const fail = (msg: string, status = 400) => json({ error: msg }, status);

const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;
function cleanUsername(u: unknown) {
  const s = String(u ?? "").trim().toLowerCase()
    .replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ı/g, "i").replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u");
  return USERNAME_RE.test(s) ? s : null;
}
const cleanName = (n: unknown) => { const s = String(n ?? "").trim().replace(/\s+/g, " "); return s && s.length <= 80 ? s : null; };
const cleanGroup = (g: unknown) => { const s = String(g ?? "").trim(); return s ? s.slice(0, 60) : null; };
const okPassword = (p: unknown) => typeof p === "string" && p.length >= 6 && p.length <= 72;

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

async function createAccount(username: string, password: string, profile: Record<string, unknown>) {
  const { data: taken } = await admin.from("profiles").select("id").eq("username", username).maybeSingle();
  if (taken) return { error: "Bu kullanıcı adı zaten kullanılıyor." };
  const { data, error } = await admin.auth.admin.createUser({
    email: `${username}@${EMAIL_DOMAIN}`, password, email_confirm: true,
    user_metadata: { username },
  });
  if (error || !data.user) return { error: "Hesap açılamadı: " + (error?.message ?? "bilinmeyen hata") };
  const { error: pe } = await admin.from("profiles").insert({ id: data.user.id, username, ...profile });
  if (pe) { await admin.auth.admin.deleteUser(data.user.id); return { error: "Profil kaydedilemedi: " + pe.message }; }
  return { id: data.user.id };
}

async function caller(req: Request) {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data } = await admin.auth.getUser(token);
  if (!data?.user) return null;
  const { data: p } = await admin.from("profiles").select("id, role, coach_id").eq("id", data.user.id).maybeSingle();
  if (!p) return null;
  return { ...p, isHead: p.role === "coach" && !p.coach_id, academy: p.role === "coach" && !p.coach_id ? p.id : p.coach_id };
}

// Hoca listesi: akademideki antrenörler (başantrenör dahil). Boşsa çağıranın kendisi.
async function validCoaches(ids: unknown, me: { id: string; academy: string }) {
  const list = Array.isArray(ids) ? ids.map(String) : [];
  if (!list.length) return [me.id];
  const { data } = await admin.from("profiles").select("id").eq("role", "coach").in("id", list)
    .or(`id.eq.${me.academy},coach_id.eq.${me.academy}`);
  const res = (data ?? []).map((r) => r.id);
  return res.length ? res : [me.id];
}
async function setCoaches(studentId: string, coachIds: string[]) {
  await admin.from("student_coaches").delete().eq("student_id", studentId);
  if (coachIds.length) await admin.from("student_coaches").insert(coachIds.map((c) => ({ student_id: studentId, coach_id: c })));
}
const cleanLesson = (v: unknown) => (v === "ozel" ? "ozel" : "grup");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("POST bekleniyor", 405);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("Geçersiz istek"); }
  const action = body.action;

  try {
    if (action === "durum") {
      const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "coach");
      return json({ hasCoach: (count ?? 0) > 0 });
    }

    if (action === "kurulum") {
      const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "coach");
      if ((count ?? 0) > 0) return fail("Kurulum zaten yapılmış.", 403);
      const username = cleanUsername(body.username), name = cleanName(body.display_name);
      if (!username) return fail("Kullanıcı adı 3–32 karakter olmalı: harf, rakam, nokta, alt çizgi, tire.");
      if (!name) return fail("Ad gerekli.");
      if (!okPassword(body.password)) return fail("Şifre en az 6 karakter olmalı.");
      const r = await createAccount(username, body.password as string, { role: "coach", display_name: name });
      return r.error ? fail(r.error) : json({ ok: true, username });
    }

    const me = await caller(req);
    if (!me) return fail("Giriş gerekli.", 401);
    if (me.role !== "coach") return fail("Bu işlem yalnızca antrenör içindir.", 403);

    if (action === "ogrenci_ac") {
      const username = cleanUsername(body.username), name = cleanName(body.display_name);
      if (!username) return fail("Kullanıcı adı 3–32 karakter olmalı: harf, rakam, nokta, alt çizgi, tire.");
      if (!name) return fail("Öğrencinin adı gerekli.");
      if (!okPassword(body.password)) return fail("Şifre en az 6 karakter olmalı.");
      const r = await createAccount(username, body.password as string, {
        role: "student", display_name: name, coach_id: me.academy, group_name: cleanGroup(body.group_name), lesson_type: cleanLesson(body.lesson_type),
      });
      if (r.error) return fail(r.error);
      await setCoaches(r.id as string, await validCoaches(body.coach_ids, me));
      return json({ ok: true, id: r.id, username });
    }

    // ---------- antrenörler (yalnızca başantrenör) ----------
    if (action === "antrenor_ac" || action === "antrenor_guncelle" || action === "antrenor_sil") {
      if (!me.isHead) return fail("Bu işlemi yalnızca başantrenör yapabilir.", 403);
      if (action === "antrenor_ac") {
        const username = cleanUsername(body.username), name = cleanName(body.display_name);
        if (!username) return fail("Kullanıcı adı 3–32 karakter olmalı: harf, rakam, nokta, alt çizgi, tire.");
        if (!name) return fail("Antrenörün adı gerekli.");
        if (!okPassword(body.password)) return fail("Şifre en az 6 karakter olmalı.");
        const r = await createAccount(username, body.password as string, { role: "coach", display_name: name, coach_id: me.id });
        return r.error ? fail(r.error) : json({ ok: true, id: r.id, username });
      }
      const cid = String(body.id ?? "");
      const { data: co } = await admin.from("profiles").select("id, role, coach_id").eq("id", cid).maybeSingle();
      if (!co || co.role !== "coach" || co.coach_id !== me.id) return fail("Antrenör bulunamadı.", 404);
      if (action === "antrenor_guncelle") {
        if ("display_name" in body) { const n = cleanName(body.display_name); if (!n) return fail("Ad gerekli."); await admin.from("profiles").update({ display_name: n }).eq("id", cid); }
        if ("password" in body) {
          if (!okPassword(body.password)) return fail("Şifre en az 6 karakter olmalı.");
          const { error } = await admin.auth.admin.updateUserById(cid, { password: body.password as string });
          if (error) return fail("Şifre değiştirilemedi: " + error.message);
        }
        return json({ ok: true });
      }
      // antrenor_sil: ödevleri, videoları ve duyuruları başantrenöre devredilir; öğrencilerden hocalığı kalkar
      for (const t of ["assignments", "videos", "announcements"]) await admin.from(t).update({ coach_id: me.id }).eq("coach_id", cid);
      const { error } = await admin.auth.admin.deleteUser(cid);
      return error ? fail(error.message) : json({ ok: true });
    }

    // the rest act on one of the caller's own students
    const id = String(body.id ?? "");
    const { data: st } = await admin.from("profiles").select("id, coach_id, role").eq("id", id).maybeSingle();
    if (!st || st.coach_id !== me.academy || st.role !== "student") return fail("Öğrenci bulunamadı.", 404);

    if (action === "ogrenci_guncelle") {
      const patch: Record<string, unknown> = {};
      if ("display_name" in body) { const n = cleanName(body.display_name); if (!n) return fail("Ad gerekli."); patch.display_name = n; }
      if ("group_name" in body) patch.group_name = cleanGroup(body.group_name);
      if ("lesson_type" in body) patch.lesson_type = cleanLesson(body.lesson_type);
      if ("coach_ids" in body) await setCoaches(id, await validCoaches(body.coach_ids, me));
      if (Object.keys(patch).length) {
        const { error } = await admin.from("profiles").update(patch).eq("id", id);
        if (error) return fail(error.message);
      }
      if ("password" in body) {
        if (!okPassword(body.password)) return fail("Şifre en az 6 karakter olmalı.");
        const { error } = await admin.auth.admin.updateUserById(id, { password: body.password as string });
        if (error) return fail("Şifre değiştirilemedi: " + error.message);
      }
      return json({ ok: true });
    }

    if (action === "ogrenci_sil") {
      const { error } = await admin.auth.admin.deleteUser(id); // profiles/kv/reports cascade
      return error ? fail(error.message) : json({ ok: true });
    }

    return fail("Bilinmeyen işlem");
  } catch (e) {
    return fail("Sunucu hatası: " + (e instanceof Error ? e.message : String(e)), 500);
  }
});
