// Every training area is a module. To add a new one, create modules/<id>/index.js exporting
// { id, title, icon, description, ready, mount(root, ctx) -> { unmount } } and list it here.
import gtm from './gtm/index.js';
import puzzles from './puzzles/index.js';
import play from './play/index.js';
import openings from './openings/index.js';
import teacher from './teacher/index.js';

const comingSoon = (id, title, icon, description) => ({ id, title, icon, description, ready: false });

export const modules = [
  gtm,
  openings,
  puzzles,
  play,
  teacher, // teacherOnly: listed only when teacher mode is on
];
