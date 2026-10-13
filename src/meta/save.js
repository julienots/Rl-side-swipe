// Sauvegarde locale robuste : schéma versionné, validation champ par champ, copie de secours.
import { ITEM_BY_ID, DEFAULT_LOADOUT, defaultOwned } from './cosmetics.js';
import { ARENA_DEFS } from '../core/arena.js';

export const SAVE_KEY = 'bolidball.save.v1';
export const BACKUP_KEY = 'bolidball.save.v1.bak';
export const SAVE_VERSION = 1;

export const DEFAULT_SETTINGS = {
  masterVolume: 0.8,
  sfxVolume: 0.9,
  musicVolume: 0.5,
  quality: 'auto', // auto | haute | basse
  cameraShake: true,
  showFps: false,
  controls: {
    scale: 1,
    opacity: 0.55,
    leftHanded: false,
    joystick: 'floating', // floating | fixed
    airMode: 'rotate', // rotate | aim
    invertAir: false,
    autoTurn: true,
    haptics: true,
  },
};

export const STAT_KEYS = [
  'matches', 'wins', 'losses', 'goals', 'assists', 'saves', 'shots', 'touches', 'aerialHits', 'flips',
  'mvps', 'goalsConceded', 'cleanSheets', 'overtimeWins', 'hatTricks', 'bestWinStreak', 'winStreak',
  'playTime', 'trainingGoals', 'precisionRuns', 'courseRuns', 'hardWins',
];

export function defaultSave() {
  return {
    version: SAVE_VERSION,
    profile: { name: 'Pilote', xp: 0, level: 1, credits: 600 },
    settings: structuredClone(DEFAULT_SETTINGS),
    garage: { equipped: { ...DEFAULT_LOADOUT }, owned: defaultOwned(), seen: [] },
    stats: Object.fromEntries(STAT_KEYS.map((k) => [k, 0])),
    arenasPlayed: [],
    challenges: {}, // id -> { progress, done }
    achievements: {}, // id -> timestamp
    precision: {}, // packId -> best stars
    course: {}, // courseId -> best time
    training: {}, // objectiveId -> true
    history: [],
    lastPlay: { teamSize: 1, difficulty: 'normal', arenaId: 'horizon', duration: 180 },
    shop: { day: '', purchases: [] },
  };
}

const num = (v, def, lo = -Infinity, hi = Infinity) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def);
const bool = (v, def) => (typeof v === 'boolean' ? v : def);
const oneOf = (v, list, def) => (list.includes(v) ? v : def);
const str = (v, def, max = 40) => (typeof v === 'string' ? v.slice(0, max) : def);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

/** Valide et complète des données quelconques ; ne lève jamais d'exception. */
export function sanitizeSave(raw) {
  const d = defaultSave();
  const r = obj(raw);

  const pr = obj(r.profile);
  d.profile.name = str(pr.name, d.profile.name, 16).trim() || 'Pilote';
  d.profile.xp = Math.floor(num(pr.xp, 0, 0, 1e9));
  d.profile.level = Math.floor(num(pr.level, 1, 1, 999));
  d.profile.credits = Math.floor(num(pr.credits, d.profile.credits, 0, 1e9));

  const st = obj(r.settings);
  const ds = d.settings;
  ds.masterVolume = num(st.masterVolume, ds.masterVolume, 0, 1);
  ds.sfxVolume = num(st.sfxVolume, ds.sfxVolume, 0, 1);
  ds.musicVolume = num(st.musicVolume, ds.musicVolume, 0, 1);
  ds.quality = oneOf(st.quality, ['auto', 'haute', 'basse'], ds.quality);
  ds.cameraShake = bool(st.cameraShake, ds.cameraShake);
  ds.showFps = bool(st.showFps, ds.showFps);
  const c = obj(st.controls), dc = ds.controls;
  dc.scale = num(c.scale, dc.scale, 0.7, 1.4);
  dc.opacity = num(c.opacity, dc.opacity, 0.15, 1);
  dc.leftHanded = bool(c.leftHanded, dc.leftHanded);
  dc.joystick = oneOf(c.joystick, ['floating', 'fixed'], dc.joystick);
  dc.airMode = oneOf(c.airMode, ['rotate', 'aim'], dc.airMode);
  dc.invertAir = bool(c.invertAir, dc.invertAir);
  dc.autoTurn = bool(c.autoTurn, dc.autoTurn);
  dc.haptics = bool(c.haptics, dc.haptics);

  const g = obj(r.garage);
  const owned = new Set(defaultOwned());
  if (Array.isArray(g.owned)) for (const id of g.owned) if (ITEM_BY_ID.has(id)) owned.add(id);
  d.garage.owned = [...owned];
  const eq = obj(g.equipped);
  for (const cat of Object.keys(DEFAULT_LOADOUT)) {
    const id = eq[cat];
    const it = ITEM_BY_ID.get(id);
    d.garage.equipped[cat] = it && it.cat === cat && owned.has(id) ? id : DEFAULT_LOADOUT[cat];
  }
  if (Array.isArray(g.seen)) d.garage.seen = g.seen.filter((id) => ITEM_BY_ID.has(id));

  const stats = obj(r.stats);
  for (const k of STAT_KEYS) d.stats[k] = num(stats[k], 0, 0, 1e9);

  const arenaIds = ARENA_DEFS.map((a) => a.id);
  if (Array.isArray(r.arenasPlayed)) d.arenasPlayed = [...new Set(r.arenasPlayed.filter((a) => arenaIds.includes(a)))];

  for (const [id, v] of Object.entries(obj(r.challenges))) {
    const o = obj(v);
    d.challenges[id] = { progress: num(o.progress, 0, 0, 1e9), done: bool(o.done, false) };
  }
  for (const [id, v] of Object.entries(obj(r.achievements))) if (typeof v === 'number' || v === true) d.achievements[id] = v === true ? 0 : v;
  for (const [id, v] of Object.entries(obj(r.precision))) d.precision[id] = Math.floor(num(v, 0, 0, 3));
  for (const [id, v] of Object.entries(obj(r.course))) { const t = num(v, NaN, 0, 3600); if (Number.isFinite(t)) d.course[id] = t; }
  for (const [id, v] of Object.entries(obj(r.training))) if (v === true) d.training[id] = true;
  if (Array.isArray(r.history)) d.history = r.history.filter((h) => h && typeof h === 'object').slice(-20);

  const lp = obj(r.lastPlay);
  d.lastPlay.teamSize = Math.floor(num(lp.teamSize, 1, 1, 3));
  d.lastPlay.difficulty = oneOf(lp.difficulty, ['easy', 'normal', 'hard'], 'normal');
  d.lastPlay.arenaId = oneOf(lp.arenaId, arenaIds, 'horizon');
  d.lastPlay.duration = oneOf(lp.duration, [120, 180, 300], 180);

  const sh = obj(r.shop);
  d.shop.day = str(sh.day, '', 12);
  d.shop.purchases = Array.isArray(sh.purchases) ? sh.purchases.filter((x) => typeof x === 'string').slice(0, 20) : [];
  return d;
}

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

export class SaveStore {
  constructor(storage) {
    try {
      this.storage = storage || globalThis.localStorage;
      if (!this.storage) throw new Error('no storage');
      const probe = '__bb_probe__';
      this.storage.setItem(probe, '1'); this.storage.removeItem(probe);
      this.persistent = true;
    } catch {
      this.storage = memoryStorage();
      this.persistent = false;
    }
    this.data = this.load();
  }

  readKey(key) {
    try {
      const txt = this.storage.getItem(key);
      if (!txt) return null;
      const parsed = JSON.parse(txt);
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed;
    } catch { return null; }
  }

  load() {
    const main = this.readKey(SAVE_KEY);
    if (main) { this.recovered = false; return sanitizeSave(main); }
    const bak = this.readKey(BACKUP_KEY);
    this.recovered = !!bak;
    return bak ? sanitizeSave(bak) : defaultSave();
  }

  /** Écrit la sauvegarde ; l'ancienne version valide est conservée comme secours. */
  save() {
    try {
      const txt = JSON.stringify(this.data);
      const prev = this.storage.getItem(SAVE_KEY);
      if (prev && this.readKey(SAVE_KEY)) this.storage.setItem(BACKUP_KEY, prev);
      this.storage.setItem(SAVE_KEY, txt);
      return true;
    } catch { return false; }
  }

  reset() {
    this.data = defaultSave();
    this.save();
  }
}
