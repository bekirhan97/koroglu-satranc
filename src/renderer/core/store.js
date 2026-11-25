// App-wide persistent state. Everything lives in JSON files in the user's data folder.
const api = window.api;

const DEFAULT_SETTINGS = {
  depth: 18,            // engine depth used for move assessment
  autoNext: true,       // continue automatically after a guess is scored
  opponentDelay: 500,   // ms before the master's opponent move is played
  threads: 0,           // 0 = automatic
  boardTheme: 'blue',
  teacherMode: false,  // shows the 'Öğretmen' section (packages, students' reports)
  dailyGoal: null,     // student's own goal when no assignment sets one: { puzzles, openings, gtmGames, playGames }
};

export const store = {
  settings: { ...DEFAULT_SETTINGS },
  profile: null,
  games: [],
  attempts: {},
  async load() {
    this.settings = { ...DEFAULT_SETTINGS, ...(await api.read('settings', {})) };
    this.profile = await api.read('profile', null);
    this.games = await api.read('gtm/games', []);
    this.attempts = await api.read('gtm/attempts', {});
    if (this.profile) {
      ensureRatings(this.profile);
      if (!this.profile.id) { this.profile.id = newId(); this.saveProfile(); }
    }
  },
  saveSettings() { return api.write('settings', this.settings); },
  saveProfile() { return api.write('profile', this.profile); },
  saveGames() { return api.write('gtm/games', this.games); },
  saveAttempts() { return api.write('gtm/attempts', this.attempts); },
  loadAnalysis(gameId) { return api.read('gtm/analysis/' + gameId, null); },
  saveAnalysis(gameId, data) { return api.write('gtm/analysis/' + gameId, data); },
  deleteAnalysis(gameId) { return api.remove('gtm/analysis/' + gameId); },
};

// One rating per training area. Adding a key here gives every existing profile that rating too.
const RATING_AREAS = ['gtm', 'puzzles'];

export function ensureRatings(profile) {
  profile.ratings = profile.ratings || {};
  for (const k of RATING_AREAS) if (!profile.ratings[k]) profile.ratings[k] = { r: 1500, rd: 350, history: [] };
  return profile;
}

export function newProfile(name) {
  return ensureRatings({ id: newId(), name, createdAt: Date.now(), ratings: {} });
}

// Stable random id for a student, so the teacher can tell two students with the same name apart.
function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
