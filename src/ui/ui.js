// Interface DOM : navigation entre écrans, garage, boutique, progression, paramètres, HUD et résultats.
import { ARENA_DEFS, COURSE_DEFS } from '../core/arena.js';
import { PRECISION_PACKS } from '../core/challenge.js';
import { DIFFICULTIES } from '../core/ai.js';
import { CATEGORIES, ITEMS, ITEM_BY_ID, RARITY, itemsOf, resolveLoadout } from '../meta/cosmetics.js';
import { xpForLevel, CHALLENGES, ACHIEVEMENTS, TRAINING_OBJECTIVES, shopOffers, buyItem } from '../meta/progression.js';
import { getTheme } from '../game/themes.js';
import { drawCarPreview } from '../game/renderer.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function formatClock(sec, overtime = false) {
  const s = Math.max(0, overtime ? Math.floor(sec) : Math.ceil(sec));
  const m = Math.floor(s / 60);
  return `${overtime ? '+' : ''}${m}:${String(s % 60).padStart(2, '0')}`;
}

export function formatTime(t) {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

const STAT_LABELS = {
  matches: 'Matchs joués', wins: 'Victoires', losses: 'Défaites', goals: 'Buts', assists: 'Passes décisives', saves: 'Arrêts',
  shots: 'Tirs', touches: 'Touches de balle', aerialHits: 'Frappes aériennes', flips: 'Saltos', mvps: 'Titres de MVP',
  goalsConceded: 'Buts encaissés', cleanSheets: 'Cages inviolées', overtimeWins: 'Victoires en prolongation', hatTricks: 'Coups du chapeau',
  bestWinStreak: 'Meilleure série', trainingGoals: "Buts à l'entraînement", precisionRuns: 'Séries de précision', courseRuns: 'Parcours terminés',
  playTime: 'Temps de jeu',
};

export class UI {
  constructor(app) {
    this.app = app;
    this.stack = [];
    this.current = null;
    this.garageCat = 'body';
    this.garageTeam = 0;
    this.progressTab = 'stats';
    this.hudCache = {};
    this._bannerTimer = null;
    this._toastTimer = null;
    this.bind();
  }

  get save() { return this.app.store.data; }

  click() { this.app.audio.play('click'); }

  bind() {
    $$('[data-nav]').forEach((b) => b.addEventListener('click', () => { this.click(); this.show(b.dataset.nav); }));
    $$('[data-back]').forEach((b) => b.addEventListener('click', () => { this.app.audio.play('back'); this.back(); }));
    $$('[data-mode]').forEach((b) => b.addEventListener('click', () => { this.click(); this.app.chooseMode(b.dataset.mode); }));
    $('#btn-start-match').addEventListener('click', () => { this.click(); this.app.startMatchFromSetup(); });
    $$('#hud [data-act]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); this.app.hudAction(b.dataset.act); b.blur(); }));
    $('#btn-pause').addEventListener('click', () => this.app.pause());
    $$('[data-pause]').forEach((b) => b.addEventListener('click', () => { this.click(); this.app.pauseAction(b.dataset.pause); }));
    $('#btn-rematch').addEventListener('click', () => { this.click(); this.app.rematch(); });
    $('#btn-menu').addEventListener('click', () => { this.click(); this.app.toMenu(); });
    $$('#progress-tabs button').forEach((b) => b.addEventListener('click', () => { this.click(); this.progressTab = b.dataset.tab; this.buildProgress(); }));
    $$('#garage-team button').forEach((b) => b.addEventListener('click', () => { this.garageTeam = +b.dataset.v; this.buildGarage(); }));
    // Segments de configuration
    for (const id of ['opt-size', 'opt-diff', 'opt-dur']) {
      $$(`#${id} button`).forEach((b) => b.addEventListener('click', () => {
        this.click();
        const lp = this.save.lastPlay;
        if (id === 'opt-size') lp.teamSize = +b.dataset.v;
        if (id === 'opt-diff') lp.difficulty = b.dataset.v;
        if (id === 'opt-dur') lp.duration = +b.dataset.v;
        this.buildSetup();
      }));
    }
  }

  // ---------------------------------------------------------------- navigation
  show(id, { replace = false } = {}) {
    if (this.current && !replace) this.stack.push(this.current);
    this.current = id;
    $$('.screen').forEach((s) => s.classList.toggle('active', s.id === `screen-${id}`));
    const builders = { menu: 'refreshMenu', setup: 'buildSetup', garage: 'buildGarage', shop: 'buildShop', progress: 'buildProgress', settings: 'buildSettings', precision: 'buildPrecision', course: 'buildCourse' };
    if (builders[id]) this[builders[id]]();
  }

  back() {
    const prev = this.stack.pop() || 'menu';
    this.current = null;
    this.show(prev, { replace: true });
    if (prev === 'menu') this.stack = [];
  }

  hideScreens() {
    this.current = null;
    this.stack = [];
    $$('.screen').forEach((s) => s.classList.remove('active'));
  }

  // ---------------------------------------------------------------- menu
  refreshMenu() {
    const p = this.save.profile;
    $('#menu-level').textContent = p.level;
    $('#menu-name').textContent = p.name;
    $('#menu-xp').style.width = `${Math.min(100, (p.xp / xpForLevel(p.level)) * 100)}%`;
    $('#menu-credits').textContent = p.credits;
    $$('.credits-val').forEach((e) => (e.textContent = p.credits));
  }

  buildSetup() {
    const lp = this.save.lastPlay;
    const mark = (id, v) => $$(`#${id} button`).forEach((b) => b.classList.toggle('active', b.dataset.v === String(v)));
    mark('opt-size', lp.teamSize); mark('opt-diff', lp.difficulty); mark('opt-dur', lp.duration);
    const list = $('#opt-arena');
    list.innerHTML = '';
    for (const a of ARENA_DEFS) {
      const th = getTheme(a.theme);
      const b = document.createElement('button');
      b.className = 'arena-card' + (lp.arenaId === a.id ? ' active' : '');
      b.innerHTML = `<div class="sw" style="background:linear-gradient(180deg,${th.skyTop},${th.skyBottom})"></div><b>${esc(a.name)}</b>${a.event ? '<span class="tag-event">ÉVÉNEMENT</span>' : ''}<small>${esc(a.desc)}</small>`;
      b.addEventListener('click', () => { this.click(); lp.arenaId = a.id; this.buildSetup(); });
      list.appendChild(b);
    }
  }

  buildPrecision() {
    const list = $('#precision-list');
    list.innerHTML = '';
    for (const pack of PRECISION_PACKS) {
      const best = this.save.precision[pack.id] || 0;
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `<h3>${esc(pack.name)}</h3><p>${esc(pack.desc)} · ${pack.scenarios.length} essais</p>
        <div class="stars">${'★'.repeat(best)}<span class="off">${'★'.repeat(3 - best)}</span></div>`;
      const b = document.createElement('button');
      b.className = 'mid primary'; b.textContent = 'Jouer';
      b.addEventListener('click', () => { this.click(); this.app.startPrecision(pack.id); });
      card.appendChild(b);
      list.appendChild(card);
    }
  }

  buildCourse() {
    const list = $('#course-list');
    list.innerHTML = '';
    for (const c of COURSE_DEFS) {
      const best = this.save.course[c.id];
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `<h3>${esc(c.name)}</h3><p>${esc(c.desc)}</p>
        <p>Or ${formatTime(c.medals.gold)} · Argent ${formatTime(c.medals.silver)} · Bronze ${formatTime(c.medals.bronze)}</p>
        <p><b>Record : ${best !== undefined ? formatTime(best) : '—'}</b></p>`;
      const b = document.createElement('button');
      b.className = 'mid primary'; b.textContent = 'Jouer';
      b.addEventListener('click', () => { this.click(); this.app.startCourse(c.id); });
      card.appendChild(b);
      list.appendChild(card);
    }
  }

  // ---------------------------------------------------------------- garage
  lockText(item) {
    const u = item.unlock;
    if (u === 'shop') return 'Boutique';
    if (u && u.level) return `Niveau ${u.level}`;
    if (u && u.challenge) { const ch = CHALLENGES.find((c) => c.id === u.challenge); return ch ? `Défi : ${ch.name}` : 'Défi'; }
    return '';
  }

  buildGarage() {
    this.refreshMenu();
    $$('#garage-team button').forEach((b) => b.classList.toggle('active', +b.dataset.v === this.garageTeam));
    const tabs = $('#garage-tabs');
    tabs.innerHTML = '';
    for (const c of CATEGORIES) {
      const b = document.createElement('button');
      b.textContent = c.name;
      b.classList.toggle('active', c.id === this.garageCat);
      b.addEventListener('click', () => { this.click(); this.garageCat = c.id; this.buildGarage(); });
      tabs.appendChild(b);
    }
    const grid = $('#garage-items');
    grid.innerHTML = '';
    const g = this.save.garage;
    for (const item of itemsOf(this.garageCat)) {
      const owned = g.owned.includes(item.id);
      const el = document.createElement('button');
      el.className = 'item' + (g.equipped[item.cat] === item.id ? ' equipped' : '') + (owned ? '' : ' locked');
      el.appendChild(this.itemVisual(item));
      const name = document.createElement('span'); name.textContent = item.name; el.appendChild(name);
      const rar = document.createElement('span'); rar.className = 'rar'; rar.style.color = RARITY[item.rarity].color; rar.textContent = RARITY[item.rarity].name; el.appendChild(rar);
      if (!owned) { const l = document.createElement('span'); l.className = 'lock'; l.textContent = '🔒 ' + this.lockText(item); el.appendChild(l); }
      el.addEventListener('click', () => {
        if (!owned) { this.toast(`Verrouillé — ${this.lockText(item)}`); return; }
        this.click();
        g.equipped[item.cat] = item.id;
        this.app.store.save();
        this.buildGarage();
      });
      grid.appendChild(el);
    }
  }

  itemVisual(item) {
    if (item.cat === 'paint') {
      const s = document.createElement('div'); s.className = 'sw';
      s.style.background = item.metallic ? `linear-gradient(135deg, #fff, ${item.color} 45%, #333)` : item.color;
      return s;
    }
    if (item.cat === 'body' || item.cat === 'decal' || item.cat === 'wheels') {
      const c = document.createElement('canvas'); c.width = 176; c.height = 88;
      const lo = { ...this.save.garage.equipped, [item.cat]: item.id };
      drawCarPreview(c, resolveLoadout(lo), this.garageTeam, 0);
      return c;
    }
    const s = document.createElement('div'); s.className = 'sw';
    const colors = {
      t_flamme: 'linear-gradient(90deg,#ff4b2b,#ffd36e)', t_plasma: 'linear-gradient(90deg,#9fe2ff,#fff)', t_etincelles: 'repeating-linear-gradient(90deg,#ffb03a 0 3px,transparent 3px 7px)',
      t_bulles: 'radial-gradient(circle,#bfefff 30%,transparent 32%) 0 0/10px 10px', t_pixels: 'repeating-linear-gradient(90deg,#2bb5ff 0 5px,#9fe2ff 5px 10px)',
      t_arcenciel: 'linear-gradient(90deg,#ff4d4d,#ffe94d,#4dff88,#4dc3ff,#9b6bff)', e_onde: 'radial-gradient(circle,transparent 40%,#fff 42%,transparent 50%)',
      e_confettis: 'repeating-linear-gradient(45deg,#ff4d4d 0 3px,#4dc3ff 3px 6px,#ffe94d 6px 9px)', e_feu: 'radial-gradient(circle,#ffe94d,#ff4d4d 60%,transparent 70%)',
      e_pixels: 'repeating-linear-gradient(0deg,#2bb5ff 0 4px,transparent 4px 8px)', e_vortex: 'conic-gradient(#2bb5ff,#fff,#2bb5ff,#fff,#2bb5ff)',
    };
    s.style.background = colors[item.id] || '#888';
    return s;
  }

  drawGaragePreview(t) {
    const c = $('#garage-canvas');
    if (!c) return;
    drawCarPreview(c, resolveLoadout(this.save.garage.equipped), this.garageTeam, t);
  }

  // ---------------------------------------------------------------- boutique
  buildShop() {
    this.refreshMenu();
    const grid = $('#shop-items');
    grid.innerHTML = '';
    for (const offer of shopOffers(this.save)) {
      const it = offer.item;
      const el = document.createElement('div');
      el.className = 'shop-item';
      el.style.borderColor = RARITY[it.rarity].color;
      const vis = this.itemVisual(it);
      if (vis.tagName === 'CANVAS') { vis.width = 280; vis.height = 140; drawCarPreview(vis, resolveLoadout({ ...this.save.garage.equipped, [it.cat]: it.id }), 0, 0); }
      el.appendChild(vis);
      const cat = CATEGORIES.find((c) => c.id === it.cat)?.name || '';
      el.insertAdjacentHTML('beforeend', `<b>${esc(it.name)}</b><small style="color:${RARITY[it.rarity].color}">${RARITY[it.rarity].name} · ${esc(cat)}</small><span class="price">⬢ ${offer.price}</span>`);
      const b = document.createElement('button');
      b.className = 'mid' + (offer.owned ? '' : ' primary');
      b.textContent = offer.owned ? 'Possédé' : 'Acheter';
      b.disabled = offer.owned;
      b.addEventListener('click', () => {
        const r = buyItem(this.save, it.id);
        if (!r.ok) { this.toast(r.reason); this.app.audio.play('fail'); return; }
        this.app.audio.play('buy');
        this.app.store.save();
        this.toast(`${it.name} ajouté au garage !`);
        this.buildShop();
      });
      el.appendChild(b);
      grid.appendChild(el);
    }
    const now = new Date();
    const mid = new Date(now); mid.setHours(24, 0, 0, 0);
    const h = Math.floor((mid - now) / 3600000), m = Math.floor(((mid - now) % 3600000) / 60000);
    $('#shop-reset').textContent = `Nouvelle sélection dans ${h} h ${m} min.`;
  }

  // ---------------------------------------------------------------- progression
  buildProgress() {
    $$('#progress-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === this.progressTab));
    const body = $('#progress-body');
    const s = this.save;
    let html = '';
    if (this.progressTab === 'stats') {
      const p = s.profile;
      html += `<div class="stat"><span>Niveau</span><b>${p.level}</b></div>`;
      html += `<div class="stat"><span>Expérience</span><b>${p.xp} / ${xpForLevel(p.level)}</b></div>`;
      for (const [k, label] of Object.entries(STAT_LABELS)) {
        let v = s.stats[k] ?? 0;
        if (k === 'playTime') v = `${Math.floor(v / 60)} min`;
        html += `<div class="stat"><span>${label}</span><b>${v}</b></div>`;
      }
      const ratio = s.stats.matches ? Math.round((s.stats.wins / s.stats.matches) * 100) : 0;
      html += `<div class="stat"><span>% de victoires</span><b>${ratio} %</b></div>`;
    } else if (this.progressTab === 'challenges') {
      for (const ch of CHALLENGES) {
        const st = s.challenges[ch.id] || { progress: Math.min(ch.target, s.stats[ch.stat] || 0), done: false };
        const pct = Math.min(100, (st.progress / ch.target) * 100);
        const reward = `⬢ ${ch.reward.credits}${ch.reward.item ? ' + ' + esc(ITEM_BY_ID.get(ch.reward.item)?.name || '') : ''}`;
        html += `<div class="ach ${st.done ? 'done' : ''}"><h4>${esc(ch.name)} ${st.done ? '✔' : ''}</h4><p>${esc(ch.desc)} — ${Math.floor(st.progress)}/${ch.target}</p><p>Récompense : ${reward}</p><div class="bar"><div style="width:${pct}%"></div></div></div>`;
      }
    } else if (this.progressTab === 'achievements') {
      for (const a of ACHIEVEMENTS) {
        const done = s.achievements[a.id] !== undefined;
        html += `<div class="ach ${done ? 'done' : ''}"><h4>${done ? '🏆' : '🔒'} ${esc(a.name)}</h4><p>${esc(a.desc)}</p></div>`;
      }
    } else {
      for (const o of TRAINING_OBJECTIVES) {
        const done = !!s.training[o.id];
        html += `<div class="ach ${done ? 'done' : ''}"><h4>${done ? '✔' : '○'} ${esc(o.name)}</h4><p>Mode entraînement libre · +50 XP</p></div>`;
      }
    }
    body.innerHTML = html;
  }

  // ---------------------------------------------------------------- paramètres
  buildSettings(container = $('#settings-body'), onlyControls = false) {
    const st = this.save.settings;
    const c = st.controls;
    container.innerHTML = '';
    const section = (t) => { const h = document.createElement('h3'); h.textContent = t; container.appendChild(h); };
    const row = (label, el) => { const d = document.createElement('div'); d.className = 'setting'; const s = document.createElement('span'); s.textContent = label; d.append(s, el); container.appendChild(d); };
    const commit = () => { this.app.applySettings(); this.app.store.save(); };
    const toggle = (obj, key, label) => {
      const b = document.createElement('button'); b.className = 'toggle' + (obj[key] ? ' on' : ''); b.setAttribute('aria-label', label);
      b.addEventListener('click', () => { obj[key] = !obj[key]; b.classList.toggle('on', obj[key]); this.click(); commit(); });
      row(label, b);
    };
    const slider = (obj, key, label, min, max, step) => {
      const i = document.createElement('input'); i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = obj[key];
      i.addEventListener('input', () => { obj[key] = parseFloat(i.value); this.app.applySettings(); });
      i.addEventListener('change', commit);
      row(label, i);
    };
    const seg = (obj, key, label, options) => {
      const s = document.createElement('div'); s.className = 'seg small';
      for (const [v, t] of options) {
        const b = document.createElement('button'); b.textContent = t; b.classList.toggle('active', obj[key] === v);
        b.addEventListener('click', () => { obj[key] = v; this.click(); commit(); $$('button', s).forEach((x) => x.classList.toggle('active', x === b)); });
        s.appendChild(b);
      }
      row(label, s);
    };

    if (!onlyControls) {
      section('Profil');
      const name = document.createElement('input'); name.type = 'text'; name.maxLength = 16; name.value = this.save.profile.name;
      name.addEventListener('change', () => { this.save.profile.name = name.value.trim().slice(0, 16) || 'Pilote'; this.app.store.save(); this.refreshMenu(); });
      row('Nom du pilote', name);
      section('Audio');
      slider(st, 'masterVolume', 'Volume général', 0, 1, 0.05);
      slider(st, 'sfxVolume', 'Effets sonores', 0, 1, 0.05);
      slider(st, 'musicVolume', 'Musique', 0, 1, 0.05);
      section('Affichage');
      seg(st, 'quality', 'Qualité graphique', [['auto', 'Auto'], ['haute', 'Haute'], ['basse', 'Basse']]);
      toggle(st, 'cameraShake', 'Tremblement de caméra');
      toggle(st, 'showFps', 'Afficher les FPS');
    }
    section('Commandes');
    seg(c, 'joystick', 'Joystick', [['floating', 'Flottant'], ['fixed', 'Fixe']]);
    seg(c, 'airMode', 'Contrôle aérien', [['rotate', 'Rotation'], ['aim', 'Visée directe']]);
    toggle(c, 'invertAir', 'Inverser la rotation aérienne');
    toggle(c, 'autoTurn', 'Demi-tour automatique');
    toggle(c, 'leftHanded', 'Disposition gaucher');
    slider(c, 'scale', 'Taille des boutons', 0.7, 1.4, 0.05);
    slider(c, 'opacity', 'Opacité des boutons', 0.15, 1, 0.05);
    toggle(c, 'haptics', 'Vibrations');
    if (!onlyControls) {
      section('Données');
      const reset = document.createElement('button'); reset.className = 'mid danger'; reset.textContent = 'Réinitialiser';
      reset.addEventListener('click', () => this.confirm('Effacer toute la progression, les objets et les réglages ?', () => {
        this.app.store.reset(); this.app.applySettings(); this.toast('Progression réinitialisée'); this.buildSettings();
      }));
      row('Effacer la sauvegarde', reset);
      if (!this.app.store.persistent) {
        const w = document.createElement('p'); w.className = 'note warn'; w.textContent = 'Stockage local indisponible : la progression ne sera pas conservée après fermeture.';
        container.appendChild(w);
      }
    }
  }

  confirm(text, onYes) {
    $('#confirm-text').textContent = text;
    const ov = $('#confirm');
    ov.classList.remove('hidden');
    const close = () => ov.classList.add('hidden');
    $('#confirm-yes').onclick = () => { close(); onYes(); };
    $('#confirm-no').onclick = close;
  }

  // ---------------------------------------------------------------- HUD
  setHudMode(mode) {
    $('#hud').classList.remove('hidden');
    $('#training-bar').classList.toggle('hidden', mode !== 'training');
    $('#course-bar').classList.toggle('hidden', mode !== 'course');
    $('#scoreboard').classList.toggle('solo', mode !== 'match');
    $('#feed').innerHTML = '';
    this.hideBanner();
    this.hudCache = {};
  }

  hideHud() { $('#hud').classList.add('hidden'); this.hideBanner(); }

  setText(id, text) {
    if (this.hudCache[id] === text) return;
    this.hudCache[id] = text;
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  updateHud(h) {
    if (h.mode === 'match') {
      this.setText('score0', String(h.score[0]));
      this.setText('score1', String(h.score[1]));
      this.setText('clock', formatClock(h.clock, h.overtime));
      const ot = !!h.overtime;
      if (this.hudCache.ot !== ot) { this.hudCache.ot = ot; $('#clock').classList.toggle('ot', ot); }
      this.setText('mode-info', h.overtime ? 'PROLONGATION · but en or' : '');
    } else if (h.mode === 'training') {
      this.setText('clock', 'Entraînement');
      this.setText('mode-info', `Buts : ${h.trainingGoals}`);
    } else if (h.mode === 'precision') {
      this.setText('clock', h.state === 'playing' ? `${h.timeLeft.toFixed(1)} s` : `${Math.min(h.index + 1, h.total)}/${h.total}`);
      const marks = Array.from({ length: h.total }, (_, i) => (h.results[i] === true ? '●' : h.results[i] === false ? '✕' : '○')).join(' ');
      this.setText('mode-info', `${h.name} · ${marks}`);
    } else if (h.mode === 'course') {
      this.setText('clock', formatTime(h.time));
      this.setText('mode-info', `Point ${Math.min(h.next + 1, h.total)}/${h.total} · Or ${formatTime(h.medals.gold)}`);
    }
    const boost = Math.round(h.boost);
    const unlimited = !!h.unlimitedBoost;
    const key = unlimited ? '∞' : String(boost);
    if (this.hudCache.boost !== key) {
      this.hudCache.boost = key;
      $('#boost-value').textContent = key;
      $('#boost-ring').style.strokeDashoffset = String(276.5 * (1 - (unlimited ? 1 : boost / 100)));
    }
  }

  banner(main, sub = '', team = null, duration = 1200) {
    const b = $('#banner');
    b.classList.remove('hidden', 'team0', 'team1');
    if (team === 0 || team === 1) b.classList.add(`team${team}`);
    const m = $('#banner-main');
    m.textContent = main;
    m.style.animation = 'none'; void m.offsetWidth; m.style.animation = '';
    $('#banner-sub').textContent = sub;
    clearTimeout(this._bannerTimer);
    if (duration > 0) this._bannerTimer = setTimeout(() => this.hideBanner(), duration);
  }

  hideBanner() { clearTimeout(this._bannerTimer); $('#banner').classList.add('hidden'); }

  feed(text) {
    const f = $('#feed');
    const d = document.createElement('div');
    d.textContent = text;
    f.appendChild(d);
    while (f.children.length > 4) f.firstChild.remove();
    setTimeout(() => d.remove(), 3200);
  }

  toast(text, ms = 2200) {
    const t = $('#toast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }

  // ---------------------------------------------------------------- pause / résultats
  showPause(show, onlyControls = false) {
    $('#pause').classList.toggle('hidden', !show);
  }

  showResults(data) {
    const ov = $('#results');
    ov.classList.remove('hidden');
    $('#res-title').textContent = data.title;
    $('#res-score').innerHTML = data.scoreHtml || '';
    $('#res-table').innerHTML = data.tableHtml || '';
    const r = data.summary;
    let rw = '';
    if (r) {
      const p = this.save.profile;
      rw += `<div class="xp-line">+${r.xp} XP · +⬢ ${r.credits}<div class="bar"><div style="width:${Math.min(100, (p.xp / xpForLevel(p.level)) * 100)}%"></div></div></div>`;
      if (r.levelUps.length) rw += `<div class="tagline2">Niveau ${r.levelUps[r.levelUps.length - 1]} atteint !</div>`;
      for (const id of r.items) rw += `<div>🎁 Nouvel objet : <b>${esc(ITEM_BY_ID.get(id)?.name || id)}</b></div>`;
      for (const id of r.challenges) rw += `<div>✔ Défi terminé : <b>${esc(CHALLENGES.find((c) => c.id === id)?.name || id)}</b></div>`;
      for (const id of r.achievements) {
        const a = ACHIEVEMENTS.find((x) => x.id === id);
        if (a) rw += `<div>🏆 Succès : <b>${esc(a.name)}</b></div>`;
      }
      if (r.newBest) rw += '<div class="tagline2">Nouveau record !</div>';
    }
    if (data.extra) rw += data.extra;
    $('#res-rewards').innerHTML = rw;
    $('#btn-rematch').textContent = data.rematchLabel || 'Revanche';
  }

  hideResults() { $('#results').classList.add('hidden'); }

  matchTable(result, playerId) {
    const rows = [...result.players].sort((a, b) => a.team - b.team || b.points - a.points);
    let h = '<table class="res"><tr><th>Joueur</th><th>Pts</th><th>Buts</th><th>Passes</th><th>Arrêts</th><th>Tirs</th></tr>';
    for (const p of rows) {
      h += `<tr class="t${p.team} ${p.id === playerId ? 'me' : ''}"><td>${esc(p.name)}${result.mvpId === p.id ? ' ★MVP' : ''}</td><td>${p.points}</td><td>${p.goals}</td><td>${p.assists}</td><td>${p.saves}</td><td>${p.shots}</td></tr>`;
    }
    return h + '</table>';
  }

  difficultyName(id) { return DIFFICULTIES[id]?.name || id; }

  itemsCount() { return ITEMS.length; }
}
