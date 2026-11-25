// "Videolar": the coach's YouTube (unlisted) lessons. Library by topic + videos inside assignments.
// Watched state lives in the student's own data (videos/watched: { videoId: time }).
import { supa } from './supa.js';
import { h, clear, modal, toast, fmtDate } from '../../src/renderer/core/dom.js';
import { activity } from '../../src/renderer/core/activity.js';
import { students } from '../../src/renderer/core/assign.js';

const api = window.api;

export function youtubeId(url) {
  const s = String(url || '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const m = s.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}
const thumb = (id) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;

export const videoStore = {
  list: [],
  loaded: false,
  async load(force) {
    if (this.loaded && !force) return this.list;
    const { data, error } = await supa.from('videos').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    this.list = data; this.loaded = true;
    return data;
  },
};

export async function watchedMap() { return api.read('videos/watched', {}); }
async function markWatched(id) {
  const w = await watchedMap();
  if (w[id]) return false;
  w[id] = Date.now();
  await api.write('videos/watched', w);
  activity.add('videos');
  return true;
}

// ---------- YouTube IFrame API ----------
let ytReady = null;
function loadYT() {
  if (ytReady) return ytReady;
  ytReady = new Promise((resolve) => {
    if (window.YT && window.YT.Player) return resolve(window.YT);
    window.onYouTubeIframeAPIReady = () => resolve(window.YT);
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    document.head.append(s);
  });
  return ytReady;
}

export default {
  id: 'videos',
  title: 'Videolar',
  icon: '🎬',
  description: 'Antrenörünüzün ders videoları, konulara göre. Ödevdeki videolar da burada.',
  ready: true,
  homeInfo: async () => {
    try { const l = await videoStore.load(); const w = await watchedMap(); const n = l.filter((v) => !w[v.id]).length; return l.length ? `${l.length} video` + (n && !window.webHooks ? ` · ${n} izlenmedi` : '') : 'Henüz video yok'; } catch (e) { return ''; }
  },

  async mount(root, { open } = {}) {
    const isCoach = !!window.webHooks;
    let timer = null, player = null;
    const stop = () => { if (timer) clearInterval(timer); timer = null; if (player && player.destroy) try { player.destroy(); } catch (e) { /* ignore */ } player = null; };
    const body = h('div.module-body');
    const head = h('div.module-head', h('h2', this.title));
    clear(root).append(h('div.module', head, body));

    async function showList() {
      stop();
      clear(body).append(h('div.empty', 'Yükleniyor…'));
      let list;
      try { list = await videoStore.load(true); } catch (e) { clear(body).append(h('div.empty', 'Videolar alınamadı: ' + e.message)); return; }
      const watched = await watchedMap();
      const byTopic = {};
      for (const v of list) (byTopic[v.topic || 'Diğer'] = byTopic[v.topic || 'Diğer'] || []).push(v);
      const topics = Object.keys(byTopic).sort((a, b) => (a === 'Diğer') - (b === 'Diğer') || a.localeCompare(b, 'tr'));
      const viewers = (id) => Object.values(students.map).filter((s) => s.last && s.last.videos && s.last.videos[id]).length;
      const nStudents = Object.keys(students.map).length;
      clear(body).append(h('div.videos-page',
        isCoach ? h('div.toolbar', h('button.btn.primary', { onclick: () => editDialog(null, list, showList) }, '+ Video ekle'),
          h('span.muted', 'YouTube\'a "Liste dışı" olarak yükleyip bağlantısını buraya yapıştırın. Öğrencileriniz bu sayfada görür; ödeve de ekleyebilirsiniz.')) : null,
        list.length ? topics.map((t) => h('div.video-topic', h('h3.group-title', t),
          h('div.video-grid', byTopic[t].map((v) => h('div.video-card' + (!isCoach && watched[v.id] ? '.watched' : ''),
            h('button.video-thumb', { onclick: () => showVideo(v) }, h('img', { src: thumb(v.youtube_id), alt: '', loading: 'lazy' }), h('span.play', '▶'),
              !isCoach && watched[v.id] ? h('span.watched-badge', '✓ İzlendi') : null),
            h('div.video-info', h('div.video-title', v.title),
              isCoach ? h('div.muted.small', `${fmtDate(v.created_at)} · ${viewers(v.id)}/${nStudents} öğrenci izledi`) : h('div.muted.small', fmtDate(v.created_at)),
              isCoach ? h('div.btn-row', h('button.btn.small', { onclick: () => editDialog(v, list, showList) }, 'Düzenle'),
                h('button.btn.small.ghost', { onclick: () => deleteDialog(v, showList) }, 'Sil')) : null))))))
          : h('div.empty', h('div.big-icon', '🎬'), h('h3', 'Henüz video yok'),
            h('p', isCoach ? 'İlk videonuzu "+ Video ekle" ile ekleyin.' : 'Antrenörünüz video ekleyince burada görünecek.'))));
    }

    async function showVideo(v) {
      stop();
      const watched = await watchedMap();
      const status = h('span.muted.small', watched[v.id] ? `✓ İzlendi (${fmtDate(watched[v.id])})` : '');
      const holder = h('div', { id: 'yt-' + v.id });
      const markBtn = isCoach || watched[v.id] ? null : h('button.btn.primary', { onclick: async () => { if (await markWatched(v.id)) { toast('İzlendi olarak işaretlendi', 'ok'); } markBtn.remove(); status.textContent = '✓ İzlendi'; } }, '✓ İzledim');
      clear(body).append(h('div.video-view',
        h('div.toolbar', h('button.btn.small', { onclick: showList }, '◂ Videolar'), h('span.spacer'), status),
        h('div.video-frame', holder),
        h('h2.video-h', v.title),
        v.topic ? h('div.chip', v.topic) : null,
        v.note ? h('p.video-note', v.note) : null,
        markBtn));
      const YT = await Promise.race([loadYT(), new Promise((r) => setTimeout(() => r(null), 6000))]);
      if (!holder.isConnected) return;
      if (!YT) { holder.replaceWith(h('iframe', { src: `https://www.youtube-nocookie.com/embed/${v.youtube_id}?rel=0`, allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen', allowfullscreen: true })); return; }
      player = new YT.Player(holder, { videoId: v.youtube_id, host: 'https://www.youtube-nocookie.com', playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
        events: { onStateChange: async (e) => { if (e.data === 0 && !isCoach && await markWatched(v.id)) { toast('Video tamamlandı ✓', 'ok'); if (markBtn) markBtn.remove(); status.textContent = '✓ İzlendi'; } } } });
      // Most of the video watched (≥ 85 %) also counts, so skipping the outro is fine.
      if (!isCoach) timer = setInterval(async () => {
        if (!player || !player.getDuration) return;
        const d = player.getDuration(), t = player.getCurrentTime();
        if (d > 0 && t / d >= 0.85) { clearInterval(timer); timer = null; if (await markWatched(v.id)) { toast('Video tamamlandı ✓', 'ok'); if (markBtn) markBtn.remove(); status.textContent = '✓ İzlendi'; } }
      }, 3000);
    }

    if (open) { await videoStore.load(); const v = videoStore.list.find((x) => x.id === open); if (v) showVideo(v); else showList(); } else showList();
    return { unmount: stop };
  },
};

function field(label, input, hint) { return h('label.form-row', h('span.form-l', label), input, hint ? h('span.muted.small', hint) : null); }

function editDialog(v, list, done) {
  const url = h('input', { value: v ? `https://youtu.be/${v.youtube_id}` : '', placeholder: 'https://youtu.be/…' });
  const title = h('input', { value: v ? v.title : '', placeholder: 'Örn. Çatal nedir?' });
  const topics = [...new Set(list.map((x) => x.topic).filter(Boolean))];
  const topic = h('input', { value: v ? v.topic || '' : '', list: 'video-topics', placeholder: 'Örn. Taktik, Açılış, Oyun sonu' });
  const note = h('textarea', { rows: 3, placeholder: 'Öğrenciye not (isteğe bağlı)' }, v ? v.note || '' : '');
  const preview = h('div.video-prev');
  const showPrev = () => { const id = youtubeId(url.value); clear(preview).append(id ? h('img', { src: thumb(id), alt: '' }) : url.value ? h('span.bad-text.small', 'YouTube bağlantısı tanınmadı') : ''); };
  url.addEventListener('input', showPrev); showPrev();
  modal({ title: v ? 'Videoyu düzenle' : 'Video ekle', wide: true,
    body: h('div.form-col', field('YouTube bağlantısı', url, 'YouTube\'da videoyu "Liste dışı" yükleyin → Paylaş → bağlantıyı kopyalayın.'), preview,
      field('Başlık', title), field('Konu', topic), h('datalist', { id: 'video-topics' }, topics.map((t) => h('option', { value: t }))), field('Not', note)),
    actions: [{ label: 'Vazgeç' }, { label: 'Kaydet', primary: true, onClick: () => {
      const id = youtubeId(url.value);
      if (!id) { toast('Geçerli bir YouTube bağlantısı yapıştırın', 'error'); return false; }
      if (!title.value.trim()) { toast('Videoya bir başlık verin', 'error'); return false; }
      const row = { title: title.value.trim(), youtube_id: id, topic: topic.value.trim() || null, note: note.value.trim() || null };
      (v ? supa.from('videos').update(row).eq('id', v.id) : supa.from('videos').insert(row))
        .then(({ error }) => { if (error) toast('Kaydedilemedi: ' + error.message, 'error'); else { toast('Kaydedildi', 'ok'); done(); } });
    } }] });
}

function deleteDialog(v, done) {
  modal({ title: 'Video silinsin mi?', body: h('p', `"${v.title}" kütüphaneden kaldırılacak. (YouTube'daki video silinmez.)`),
    actions: [{ label: 'Vazgeç' }, { label: 'Sil', primary: true, onClick: () => {
      supa.from('videos').delete().eq('id', v.id).then(({ error }) => { if (error) toast(error.message, 'error'); else { toast('Silindi', 'ok'); done(); } });
    } }] });
}
