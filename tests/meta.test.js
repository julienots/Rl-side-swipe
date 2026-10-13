import test from 'node:test';
import assert from 'node:assert/strict';
import { SaveStore, sanitizeSave, defaultSave, SAVE_KEY, BACKUP_KEY } from '../src/meta/save.js';
import { applyMatchResult, applyPrecisionResult, applyCourseResult, applyTrainingProgress, xpForLevel, shopOffers, buyItem, CHALLENGES } from '../src/meta/progression.js';
import { ITEMS, ITEM_BY_ID, resolveLoadout, DEFAULT_LOADOUT, randomLoadout } from '../src/meta/cosmetics.js';
import { makeRng } from '../src/core/math.js';

function memStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), map: m };
}

test('sauvegarde : aller-retour et persistance', () => {
  const st = memStorage();
  const a = new SaveStore(st);
  a.data.profile.name = 'Zoé';
  a.data.garage.equipped.paint = 'p_rouge';
  a.data.stats.goals = 12;
  a.save();
  const b = new SaveStore(st);
  assert.equal(b.data.profile.name, 'Zoé');
  assert.equal(b.data.garage.equipped.paint, 'p_rouge');
  assert.equal(b.data.stats.goals, 12);
});

test('sauvegarde corrompue : repli sur la copie de secours puis sur les valeurs par défaut', () => {
  const st = memStorage();
  const a = new SaveStore(st);
  a.data.stats.wins = 3; a.save();
  a.data.stats.wins = 4; a.save(); // la version « 3 » passe en secours
  st.setItem(SAVE_KEY, '{"profile": {"name": "trunc'); // écriture interrompue
  const b = new SaveStore(st);
  assert.equal(b.recovered, true);
  assert.equal(b.data.stats.wins, 3);
  st.setItem(BACKUP_KEY, 'n\'importe quoi');
  const c = new SaveStore(st);
  assert.deepEqual(c.data.stats, defaultSave().stats);
});

test('données invalides nettoyées champ par champ', () => {
  const d = sanitizeSave({
    profile: { name: 42, xp: -5, level: 'x', credits: Infinity },
    settings: { masterVolume: 7, quality: 'ultra', controls: { scale: 99, joystick: 'banane', airMode: 'aim' } },
    garage: { owned: ['p_rouge', 'inexistant', 12], equipped: { paint: 'p_or', body: 'bulle', wheels: 'w_standard' } },
    stats: { goals: '12', wins: 5 },
    challenges: { buteur: { progress: 'x', done: 'oui' } },
    history: 'pas un tableau',
    lastPlay: { teamSize: 9, arenaId: 'atlantide', duration: 17 },
  });
  assert.equal(d.profile.name, 'Pilote');
  assert.equal(d.profile.xp, 0);
  assert.equal(d.profile.level, 1);
  assert.equal(d.settings.masterVolume, 1);
  assert.equal(d.settings.quality, 'auto');
  assert.equal(d.settings.controls.scale, 1.4);
  assert.equal(d.settings.controls.joystick, 'floating');
  assert.equal(d.settings.controls.airMode, 'aim');
  assert.ok(d.garage.owned.includes('p_rouge') && !d.garage.owned.includes('inexistant'));
  assert.equal(d.garage.equipped.paint, DEFAULT_LOADOUT.paint, 'objet non possédé déséquipé');
  assert.equal(d.garage.equipped.body, DEFAULT_LOADOUT.body);
  assert.equal(d.stats.goals, 0);
  assert.equal(d.stats.wins, 5);
  assert.deepEqual(d.challenges.buteur, { progress: 0, done: false });
  assert.deepEqual(d.history, []);
  assert.equal(d.lastPlay.teamSize, 3);
  assert.equal(d.lastPlay.arenaId, 'horizon');
  assert.equal(d.lastPlay.duration, 180);
  assert.doesNotThrow(() => sanitizeSave(null));
  assert.doesNotThrow(() => sanitizeSave([1, 2]));
  assert.doesNotThrow(() => sanitizeSave('texte'));
});

test('stockage indisponible : la sauvegarde fonctionne en mémoire', () => {
  const broken = { getItem() { throw new Error('x'); }, setItem() { throw new Error('quota'); }, removeItem() {} };
  const s = new SaveStore(broken);
  assert.equal(s.persistent, false);
  s.data.stats.goals = 2;
  assert.equal(s.save(), true);
});

function fakeResult(over = {}) {
  return {
    mode: 'match', arenaId: 'horizon', difficulty: 'normal', teamSize: 1, score: [3, 1], winner: 0, overtime: false,
    players: [
      { id: 0, name: 'Moi', team: 0, isHuman: true, goals: 3, assists: 0, saves: 2, shots: 4, touches: 20, aerialHits: 2, flips: 3, points: 450 },
      { id: 1, name: 'Bot', team: 1, isHuman: false, goals: 1, assists: 0, saves: 1, shots: 2, touches: 15, aerialHits: 0, flips: 2, points: 200 },
    ],
    mvpId: 0, duration: 180, goals: [], ...over,
  };
}

test('progression : XP, niveaux, récompenses, défis et succès', () => {
  const save = defaultSave();
  const sum = applyMatchResult(save, fakeResult());
  assert.ok(sum.xp > 0 && sum.credits > 0);
  assert.equal(save.stats.matches, 1);
  assert.equal(save.stats.wins, 1);
  assert.equal(save.stats.goals, 3);
  assert.ok(save.achievements.premiere_victoire !== undefined);
  assert.ok(save.achievements.triple !== undefined);
  for (let i = 0; i < 6; i++) applyMatchResult(save, fakeResult());
  assert.ok(save.profile.level >= 2, `niveau ${save.profile.level}`);
  assert.ok(save.profile.xp < xpForLevel(save.profile.level));
  assert.ok(save.challenges.buteur.done, 'défi Buteur (15 buts) réussi');
  assert.ok(save.garage.owned.includes('d_vague'), 'récompense de défi débloquée');
  assert.ok(save.garage.owned.includes('fuseau') || save.profile.level < 3);
  const ch = CHALLENGES.find((c) => c.id === 'champion');
  applyMatchResult(save, fakeResult({ difficulty: 'hard' }));
  assert.ok(save.challenges[ch.id].done && save.garage.owned.includes('mantis'));
  const lost = applyMatchResult(save, fakeResult({ winner: 1, score: [0, 2] }));
  assert.equal(save.stats.winStreak, 0);
  assert.ok(lost.xp > 0);
});

test('précision, parcours et entraînement alimentent la progression', () => {
  const save = defaultSave();
  const p = applyPrecisionResult(save, { packId: 'bases', successes: 5, total: 5, stars: 3 });
  assert.equal(save.precision.bases, 3);
  assert.ok(p.newBest && save.achievements.precision3 !== undefined);
  const c1 = applyCourseResult(save, { courseId: 'ferraille', time: 30, medal: 'argent' });
  assert.ok(c1.newBest);
  const c2 = applyCourseResult(save, { courseId: 'ferraille', time: 35, medal: null });
  assert.ok(!c2.newBest);
  assert.equal(save.course.ferraille, 30);
  const t = applyTrainingProgress(save, { goals: 3, doubleJumps: 1, flipHits: 0, aerialHits: 0, wallTime: 0, goalsDelta: 3 });
  assert.ok(save.training.tr_but && save.training.tr_3buts && save.training.tr_saut);
  assert.ok(!save.training.tr_salto);
  assert.equal(save.stats.trainingGoals, 3);
  assert.ok(t.xp >= 150);
});

test('boutique fictive : offres du jour, achat, refus si crédits insuffisants', () => {
  const save = defaultSave();
  const day = new Date(2026, 4, 2);
  const offers = shopOffers(save, day);
  assert.equal(offers.length, 4);
  assert.deepEqual(offers.map((o) => o.item.id), shopOffers(save, day).map((o) => o.item.id), 'rotation déterministe');
  assert.ok(offers.every((o) => o.item.unlock === 'shop'));
  save.profile.credits = 0;
  assert.equal(buyItem(save, offers[0].item.id, day).ok, false);
  save.profile.credits = 100000;
  const r = buyItem(save, offers[0].item.id, day);
  assert.ok(r.ok);
  assert.ok(save.garage.owned.includes(offers[0].item.id));
  assert.equal(buyItem(save, offers[0].item.id, day).ok, false, 'pas de double achat');
  assert.equal(buyItem(save, 'mantis', day).ok, false, 'objet hors boutique refusé');
});

test('cosmétiques : catalogue cohérent et purement visuel', () => {
  const ids = new Set();
  for (const it of ITEMS) { assert.ok(!ids.has(it.id), `id unique ${it.id}`); ids.add(it.id); }
  for (const cat of Object.keys(DEFAULT_LOADOUT)) assert.equal(ITEM_BY_ID.get(DEFAULT_LOADOUT[cat]).cat, cat);
  const lo = resolveLoadout({ body: 'inconnu', paint: 'w_neon' });
  assert.equal(lo.body, 'rapace');
  assert.equal(lo.paint, ITEM_BY_ID.get('p_blanc').color, 'mauvaise catégorie ignorée');
  const r = randomLoadout(makeRng(3));
  assert.ok(r.body && r.paint && r.trail);
  // aucun champ de performance dans le catalogue
  for (const it of ITEMS) for (const k of Object.keys(it)) assert.ok(['id', 'cat', 'name', 'rarity', 'unlock', 'color', 'metallic'].includes(k), `champ inattendu ${k}`);
});
