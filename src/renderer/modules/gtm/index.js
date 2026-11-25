// Guess the Move module ("Hamleyi Tahmin Et").
import { h, clear } from '../../core/dom.js';
import { store } from '../../core/store.js';
import { ListView } from './list.js';
import { PlayView } from './play.js';
import { ReviewView } from './review.js';
import { renderStats } from './stats.js';

export default {
  id: 'gtm',
  title: 'Hamleyi Tahmin Et',
  icon: '♞',
  description: 'Usta oyunlarını bir tarafın yerine oynayın, her hamleniz ustanın hamlesine ve motora göre puanlansın.',
  ready: true,
  homeInfo: () => `Puan: ${store.profile.ratings.gtm.r.toFixed(0)} · ${store.games.length} oyun`,

  mount(root, ctx) {
    let current = null;
    const tabsHost = h('div.tabs');
    const body = h('div.module-body');
    clear(root).append(h('div.module', h('div.module-head', h('h2', this.title), tabsHost), body));

    const swap = (view) => {
      if (current && current.destroy) current.destroy();
      current = view;
    };
    const setTabs = (active) => {
      clear(tabsHost).append(...[
        h('button.tab' + (active === 'list' ? '.active' : ''), { onclick: showList }, 'Oyunlar'),
        h('button.tab' + (active === 'stats' ? '.active' : ''), { onclick: showStats }, 'İstatistikler'),
        active === 'play' ? h('button.tab.active', 'Oynanıyor') : null,
        active === 'review' ? h('button.tab.active', 'İnceleme') : null,
        h('span.rating-pill', { title: 'Hamleyi Tahmin Et puanınız' }, `Puan: ${store.profile.ratings.gtm.r.toFixed(0)}`)].filter(Boolean));
    };
    const showList = () => {
      setTabs('list');
      const v = new ListView(body, { onPlay: showPlay, onReview: showReview });
      swap(v); v.mount();
    };
    const showStats = () => { setTabs('stats'); swap(null); renderStats(body); };
    const showPlay = (game, { rated }) => {
      setTabs('play');
      const v = new PlayView(body, game, { rated, onExit: showList, onReview: (att) => showReview(game, att) });
      swap(v); v.mount();
    };
    const showReview = (game, att) => {
      setTabs('review');
      const v = new ReviewView(body, game, att, { onExit: showList, onPlayUnrated: () => showPlay(game, { rated: false }) });
      swap(v); v.mount();
    };
    showList();
    return { unmount: () => swap(null) };
  },
};
