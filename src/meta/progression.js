// Progression : expérience, niveaux, récompenses, défis, succès, statistiques et boutique (monnaie fictive).
import { ITEMS, ITEM_BY_ID, priceOf } from './cosmetics.js';
import { ARENA_DEFS } from '../core/arena.js';
import { makeRng, hashString } from '../core/math.js';

export function xpForLevel(level) { return 500 + 150 * (level - 1); }

/** Récompenses de niveau : crédits + éventuel cosmétique débloqué. */
export function levelRewards(level) {
  const items = ITEMS.filter((i) => i.unlock && i.unlock.level === level).map((i) => i.id);
  return { credits: 150 + level * 25, items };
}

export const CHALLENGES = [
  { id: 'debut', name: 'Premiers tours', desc: 'Joue 3 matchs', stat: 'matches', target: 3, reward: { credits: 300 } },
  { id: 'buteur', name: 'Buteur', desc: 'Marque 15 buts en match', stat: 'goals', target: 15, reward: { credits: 400, item: 'd_vague' } },
  { id: 'mur', name: 'Le Mur', desc: 'Réalise 10 arrêts', stat: 'saves', target: 10, reward: { credits: 400 } },
  { id: 'voltige', name: 'Voltige', desc: 'Touche 10 balles en l\'air', stat: 'aerialHits', target: 10, reward: { credits: 400 } },
  { id: 'vainqueur', name: 'Vainqueur', desc: 'Gagne 5 matchs', stat: 'wins', target: 5, reward: { credits: 600 } },
  { id: 'champion', name: 'Champion', desc: 'Bats l\'IA Champion', stat: 'hardWins', target: 1, reward: { credits: 800, item: 'mantis' } },
  { id: 'pilote', name: 'Pilote d\'essai', desc: 'Termine 3 parcours', stat: 'courseRuns', target: 3, reward: { credits: 300 } },
  { id: 'sniper', name: 'Tireur d\'élite', desc: 'Termine 3 séries de précision', stat: 'precisionRuns', target: 3, reward: { credits: 300 } },
];

export const ACHIEVEMENTS = [
  { id: 'premier_but', name: 'Premier but', desc: 'Marque ton premier but en match.' },
  { id: 'premiere_victoire', name: 'Première victoire', desc: 'Gagne un match.' },
  { id: 'triple', name: 'Coup du chapeau', desc: 'Marque 3 buts dans un même match.' },
  { id: 'cage_inviolee', name: 'Cage inviolée', desc: 'Gagne sans encaisser de but.' },
  { id: 'prolongation', name: 'Au bout du suspense', desc: 'Gagne en prolongation.' },
  { id: 'aerien', name: 'Pilote de chasse', desc: 'Marque un but après une touche aérienne.' },
  { id: 'niveau5', name: 'Habitué', desc: 'Atteins le niveau 5.' },
  { id: 'niveau10', name: 'Vétéran', desc: 'Atteins le niveau 10.' },
  { id: 'collection', name: 'Collectionneur', desc: 'Possède 20 objets cosmétiques.' },
  { id: 'globe', name: 'Globe-trotteur', desc: 'Joue dans toutes les arènes.' },
  { id: 'or_parcours', name: 'Médaille d\'or', desc: 'Obtiens l\'or sur un parcours.' },
  { id: 'precision3', name: 'Parfait', desc: '3 étoiles sur une série de précision.' },
];

export const TRAINING_OBJECTIVES = [
  { id: 'tr_but', name: 'Marque un but', test: (s) => s.goals >= 1 },
  { id: 'tr_3buts', name: 'Marque 3 buts', test: (s) => s.goals >= 3 },
  { id: 'tr_saut', name: 'Fais un double saut', test: (s) => s.doubleJumps >= 1 },
  { id: 'tr_salto', name: 'Frappe la balle pendant un salto', test: (s) => s.flipHits >= 1 },
  { id: 'tr_aerien', name: 'Touche la balle en l\'air (hauteur > 3)', test: (s) => s.aerialHits >= 1 },
  { id: 'tr_mur', name: 'Roule sur un mur ou au plafond', test: (s) => s.wallTime >= 1 },
];

function addXp(save, amount, summary) {
  const p = save.profile;
  p.xp += amount;
  while (p.xp >= xpForLevel(p.level)) {
    p.xp -= xpForLevel(p.level);
    p.level++;
    const r = levelRewards(p.level);
    p.credits += r.credits;
    summary.credits += r.credits;
    for (const id of r.items) unlockItem(save, id, summary);
    summary.levelUps.push(p.level);
  }
}

export function unlockItem(save, id, summary) {
  if (!ITEM_BY_ID.has(id) || save.garage.owned.includes(id)) return false;
  save.garage.owned.push(id);
  if (summary) summary.items.push(id);
  return true;
}

function unlockAchievement(save, id, summary) {
  if (save.achievements[id] !== undefined) return;
  save.achievements[id] = Date.now();
  summary.achievements.push(id);
}

function updateChallenges(save, summary) {
  for (const ch of CHALLENGES) {
    const st = save.challenges[ch.id] || (save.challenges[ch.id] = { progress: 0, done: false });
    st.progress = Math.min(ch.target, save.stats[ch.stat] || 0);
    if (!st.done && st.progress >= ch.target) {
      st.done = true;
      save.profile.credits += ch.reward.credits || 0;
      summary.credits += ch.reward.credits || 0;
      if (ch.reward.item) unlockItem(save, ch.reward.item, summary);
      summary.challenges.push(ch.id);
    }
  }
}

function checkGlobalAchievements(save, summary) {
  if (save.profile.level >= 5) unlockAchievement(save, 'niveau5', summary);
  if (save.profile.level >= 10) unlockAchievement(save, 'niveau10', summary);
  if (save.garage.owned.length >= 20) unlockAchievement(save, 'collection', summary);
  if (ARENA_DEFS.every((a) => save.arenasPlayed.includes(a.id))) unlockAchievement(save, 'globe', summary);
}

function newSummary() { return { xp: 0, credits: 0, levelUps: [], items: [], challenges: [], achievements: [], lines: [] }; }

/** Applique le résultat d'un match à la sauvegarde ; retourne un résumé pour l'écran de résultats. */
export function applyMatchResult(save, result, extra = {}) {
  const summary = newSummary();
  const me = result.players.find((p) => p.isHuman) || result.players[0];
  const st = save.stats;
  const won = result.winner === me.team;
  const lost = result.winner !== -1 && !won;
  const conceded = result.score[1 - me.team];

  st.matches++;
  if (won) { st.wins++; st.winStreak++; st.bestWinStreak = Math.max(st.bestWinStreak, st.winStreak); }
  if (lost) { st.losses++; st.winStreak = 0; }
  st.goals += me.goals; st.assists += me.assists; st.saves += me.saves; st.shots += me.shots;
  st.touches += me.touches; st.aerialHits += me.aerialHits; st.flips += me.flips;
  st.goalsConceded += conceded;
  st.playTime += Math.round(result.duration || 0);
  if (result.mvpId === me.id) st.mvps++;
  if (won && conceded === 0) { st.cleanSheets++; unlockAchievement(save, 'cage_inviolee', summary); }
  if (won && result.overtime) { st.overtimeWins++; unlockAchievement(save, 'prolongation', summary); }
  if (me.goals >= 3) { st.hatTricks++; unlockAchievement(save, 'triple', summary); }
  if (won && result.difficulty === 'hard') st.hardWins++;
  if (me.goals >= 1) unlockAchievement(save, 'premier_but', summary);
  if (won) unlockAchievement(save, 'premiere_victoire', summary);
  if (extra.aerialGoal) unlockAchievement(save, 'aerien', summary);
  if (!save.arenasPlayed.includes(result.arenaId)) save.arenasPlayed.push(result.arenaId);

  const diffMul = { easy: 0.8, normal: 1, hard: 1.3 }[result.difficulty] || 1;
  let xp = 120;
  xp += me.goals * 30 + me.assists * 15 + me.saves * 20 + me.shots * 8 + Math.min(20, me.aerialHits * 4);
  if (won) xp += 150;
  if (result.mvpId === me.id) xp += 40;
  xp = Math.round(xp * diffMul);
  const credits = Math.round((50 + (won ? 60 : 0) + me.goals * 10) * diffMul);
  summary.lines.push(['Participation', 120]);
  if (won) summary.lines.push(['Victoire', 150]);
  if (me.goals) summary.lines.push([`Buts ×${me.goals}`, me.goals * 30]);
  if (me.saves) summary.lines.push([`Arrêts ×${me.saves}`, me.saves * 20]);
  summary.xp = xp;
  save.profile.credits += credits;
  summary.credits += credits;
  addXp(save, xp, summary);
  updateChallenges(save, summary);
  checkGlobalAchievements(save, summary);
  save.history.push({ t: Date.now(), score: result.score, won, arena: result.arenaId, diff: result.difficulty, size: result.teamSize });
  if (save.history.length > 20) save.history.shift();
  return summary;
}

export function applyPrecisionResult(save, result) {
  const summary = newSummary();
  save.stats.precisionRuns++;
  const prev = save.precision[result.packId] || 0;
  if (result.stars > prev) save.precision[result.packId] = result.stars;
  if (result.stars >= 3) unlockAchievement(save, 'precision3', summary);
  const xp = 60 + result.successes * 25;
  const credits = 20 + result.successes * 15;
  summary.xp = xp; summary.credits += credits; save.profile.credits += credits;
  summary.lines.push([`Réussites ×${result.successes}`, result.successes * 25]);
  summary.newBest = result.stars > prev;
  addXp(save, xp, summary);
  updateChallenges(save, summary);
  checkGlobalAchievements(save, summary);
  return summary;
}

export function applyCourseResult(save, result) {
  const summary = newSummary();
  save.stats.courseRuns++;
  const prev = save.course[result.courseId];
  summary.newBest = prev === undefined || result.time < prev;
  if (summary.newBest) save.course[result.courseId] = result.time;
  if (result.medal === 'or') unlockAchievement(save, 'or_parcours', summary);
  const medalXp = { or: 200, argent: 140, bronze: 100 }[result.medal] || 60;
  summary.xp = medalXp;
  const credits = Math.round(medalXp / 2);
  summary.credits += credits; save.profile.credits += credits;
  addXp(save, medalXp, summary);
  updateChallenges(save, summary);
  checkGlobalAchievements(save, summary);
  return summary;
}

/** Objectifs d'entraînement : validés une fois, rapportent de l'XP. */
export function applyTrainingProgress(save, sessionStats) {
  const summary = newSummary();
  for (const obj of TRAINING_OBJECTIVES) {
    if (!save.training[obj.id] && obj.test(sessionStats)) {
      save.training[obj.id] = true;
      summary.achievements.push(obj.id);
      addXp(save, 50, summary);
      summary.xp += 50;
    }
  }
  if (sessionStats.goalsDelta) save.stats.trainingGoals += sessionStats.goalsDelta;
  checkGlobalAchievements(save, summary);
  return summary;
}

// ---------------------------------------------------------------------------
// Boutique de démonstration (monnaie fictive locale, aucun achat réel)

export function dayKey(date = new Date()) {
  const y = date.getFullYear(), m = String(date.getMonth() + 1).padStart(2, '0'), d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function shopOffers(save, date = new Date(), count = 4) {
  const key = dayKey(date);
  const rng = makeRng(hashString('boutique-' + key));
  const pool = ITEMS.filter((i) => i.unlock === 'shop');
  const offers = [];
  const copy = [...pool];
  while (offers.length < count && copy.length) offers.push(copy.splice(Math.floor(rng() * copy.length), 1)[0]);
  return offers.map((it) => ({ item: it, price: priceOf(it), owned: save.garage.owned.includes(it.id) }));
}

export function buyItem(save, itemId, date = new Date()) {
  const offer = shopOffers(save, date).find((o) => o.item.id === itemId);
  if (!offer) return { ok: false, reason: 'Objet indisponible aujourd\'hui' };
  if (offer.owned) return { ok: false, reason: 'Déjà possédé' };
  if (save.profile.credits < offer.price) return { ok: false, reason: 'Crédits insuffisants' };
  save.profile.credits -= offer.price;
  unlockItem(save, itemId);
  save.shop.day = dayKey(date);
  save.shop.purchases.push(itemId);
  const summary = newSummary();
  checkGlobalAchievements(save, summary);
  return { ok: true, summary };
}
