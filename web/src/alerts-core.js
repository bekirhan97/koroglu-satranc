// Pure alert rules (no browser APIs) so they can be unit-tested.
export const DAY = 86400e3;
export const keyOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const studied = (d) => Object.entries(d).some(([k, v]) => k !== 'key' && typeof v === 'number' && v > 0);

export function lastActive(rep) {
  const days = (rep && rep.activity && rep.activity.days) || [];
  for (let i = days.length - 1; i >= 0; i--) if (studied(days[i])) return days[i].key;
  return null;
}

// Pure part (tested): list of { kind, sid, text } from plain data.
export function computeAlerts({ list, reps, assignments, sessions, attendance, now = Date.now() }) {
  const out = [];
  const today = keyOf(new Date(now));
  const weekAgo = keyOf(new Date(now - 7 * DAY));
  const dateOf = Object.fromEntries(sessions.map((s) => [s.id, s.date]));
  for (const st of list) {
    const rep = reps[st.id];
    // 1) missed the last two lessons (excused absences don't count)
    const att = attendance.filter((a) => a.student_id === st.id && dateOf[a.session_id] && dateOf[a.session_id] <= today)
      .sort((a, b) => (dateOf[b.session_id] < dateOf[a.session_id] ? -1 : 1));
    if (att.length >= 2 && att[0].status === 'gelmedi' && att[1].status === 'gelmedi') {
      const n = att.findIndex((a) => a.status !== 'gelmedi');
      out.push({ kind: 'absent', sid: st.id, text: `Son ${n === -1 ? att.length : n} derse gelmedi` });
    }
    // 2) inactive
    const la = lastActive(rep);
    const created = st.created_at ? Date.parse(st.created_at) : 0;
    if (!rep) { if (now - created > 2 * DAY) out.push({ kind: 'inactive', sid: st.id, text: 'Siteye hiç giriş yapmadı' }); }
    else if (!la || la < weekAgo) out.push({ kind: 'inactive', sid: st.id, text: la ? `${Math.round((now - Date.parse(la)) / DAY)} gündür çalışmadı` : 'Henüz hiç çalışmadı' });
    // 3) homework due within 2 days (or up to 3 days late) and not opened
    for (const a of assignments) {
      const due = a.package && a.package.due;
      if (!due || !(a.assignment_targets || []).some((t) => t.student_id === st.id)) continue;
      if (due > now + 2 * DAY || due < now - 3 * DAY) continue;
      const pr = rep && rep.assignments ? rep.assignments.find((x) => x.id === a.id) : null;
      if (!pr || !pr.pct) out.push({ kind: 'homework', sid: st.id, text: `"${a.title}" ödevini açmadı · son gün ${due < now ? 'geçti' : new Date(due).toLocaleDateString('tr-TR', { weekday: 'long' })}` });
    }
    // 4) puzzle rating dropped by 100+ in the last 14 days
    const hist = (rep && rep.ratings && rep.ratings.puzzles && rep.ratings.puzzles.history) || [];
    const recent = hist.map((p) => (Array.isArray(p) ? { t: p[0], r: p[1] } : p)).filter((p) => p.t >= now - 14 * DAY);
    if (recent.length >= 5) {
      const peak = Math.max(...recent.map((p) => p.r)), last = recent[recent.length - 1].r;
      if (peak - last >= 100) out.push({ kind: 'rating', sid: st.id, text: `Bulmaca puanı ${Math.round(peak)} → ${Math.round(last)}` });
    }
  }
  return out;
}

