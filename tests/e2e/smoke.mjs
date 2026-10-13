// Test de bout en bout dans Chromium (Playwright) : écrans, multitouch, pause, match complet,
// modes, garage, sauvegarde après rechargement, ratios d'écran, erreurs console.
// Usage : node tests/e2e/smoke.mjs [dossier_captures]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from '../../scripts/serve.mjs';

const OUT = process.argv[2] || path.resolve('test-results');
fs.mkdirSync(OUT, { recursive: true });
const PORT = 8200 + Math.floor(Math.random() * 500);
const server = createServer().listen(PORT);
const URL = `http://localhost:${PORT}/index.html?nosw`;

let failures = 0;
const log = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function newPage(browser, viewport, touch = true) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: touch, isMobile: touch });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => !!window.__bolid);
  return { ctx, page, errors };
}

const game = (page, fn, arg) => page.evaluate(fn, arg);

/** Multitouch réel via CDP (plusieurs doigts simultanés). */
async function touch(page, cdp, type, points) {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, i) => ({ x: p.x, y: p.y, id: p.id ?? i, radiusX: 4, radiusY: 4, force: 1 })) });
}

async function center(page, sel) {
  const b = await page.locator(sel).boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

async function checkLayout(page, label) {
  const res = await page.evaluate(() => {
    const W = window.innerWidth;
    const issues = [];
    if (document.documentElement.scrollWidth > W + 1) issues.push('défilement horizontal');
    for (const el of document.querySelectorAll('.screen.active button, .overlay:not(.hidden) button, #hud:not(.hidden) button')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || getComputedStyle(el).visibility === 'hidden') continue;
      if (r.left < -1 || r.right > W + 1) issues.push(`bouton hors écran : ${el.textContent.trim().slice(0, 20)}`);
      if (r.height < 34 && !el.closest('.item-grid') && !el.closest('.tabs')) issues.push(`bouton trop petit (${Math.round(r.height)}px) : ${el.textContent.trim().slice(0, 20)}`);
      // texte coupé
      if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow !== 'visible') issues.push(`texte coupé : ${el.textContent.trim().slice(0, 20)}`);
    }
    return issues;
  });
  log(res.length === 0, `${label} : mise en page ${res.length ? res.join(' | ') : 'OK'}`);
}

const browser = await chromium.launch();
try {
  // ------------------------------------------------------------------ parcours principal (téléphone 19.5:9)
  {
    const { ctx, page, errors } = await newPage(browser, { width: 844, height: 390 });
    const cdp = await ctx.newCDPSession(page);
    await sleep(600);
    await page.screenshot({ path: `${OUT}/01-menu.png` });
    await checkLayout(page, 'menu');

    // Garage : équiper une peinture et une carrosserie
    await page.click('[data-nav=garage]');
    await page.click('#garage-tabs button:nth-child(2)'); // Peinture
    await page.locator('#garage-items .item', { hasText: 'Piment' }).click();
    const paint = await game(page, () => window.__bolid.save.garage.equipped.paint);
    log(paint === 'p_rouge', `garage : peinture équipée (${paint})`);
    await page.screenshot({ path: `${OUT}/02-garage.png` });
    await checkLayout(page, 'garage');
    await page.click('#screen-garage [data-back]');

    for (const nav of ['shop', 'progress', 'settings']) {
      await page.click(`[data-nav=${nav}]`);
      await sleep(150);
      await page.screenshot({ path: `${OUT}/03-${nav}.png` });
      await checkLayout(page, nav);
      await page.click(`#screen-${nav} [data-back]`);
    }

    // Match 1c1 Débutant, 2 min
    await page.click('[data-nav=play]');
    await page.click('[data-mode=match]');
    await page.click('#opt-size [data-v="1"]');
    await page.click('#opt-diff [data-v="easy"]');
    await page.click('#opt-dur [data-v="120"]');
    await checkLayout(page, 'configuration du match');
    await page.screenshot({ path: `${OUT}/04-setup.png` });
    await page.click('#btn-start-match');
    await sleep(1500);
    await page.screenshot({ path: `${OUT}/05-countdown.png` });
    const frozen = await game(page, () => window.__bolid.session.player.frozen);
    log(frozen, 'voiture figée pendant le compte à rebours');
    await page.waitForFunction(() => window.__bolid.session.state === 'playing', null, { timeout: 8000 });
    const cosOk = await game(page, () => window.__bolid.session.player.cosmetics.paint === '#e2384d');
    log(cosOk, 'cosmétique équipé visible sur la voiture en match');
    await checkLayout(page, 'HUD');

    // Multitouch : joystick vers la droite + boost + saut simultanés
    const stickZone = await page.locator('#stick-zone').boundingBox();
    const s0 = { x: stickZone.x + 120, y: stickZone.y + stickZone.height - 90 };
    const boost = await center(page, '#btn-boost');
    const jump = await center(page, '#btn-jump');
    const x0 = await game(page, () => window.__bolid.session.player.x);
    await touch(page, cdp, 'touchStart', [{ ...s0, id: 1 }]);
    await touch(page, cdp, 'touchMove', [{ x: s0.x + 60, y: s0.y, id: 1 }]);
    await touch(page, cdp, 'touchStart', [{ x: s0.x + 60, y: s0.y, id: 1 }, { ...boost, id: 2 }]);
    await sleep(400);
    const mid = await game(page, () => { const i = window.__bolid.input.read(); const p = window.__bolid.session.player; return { mx: i.mx, boost: i.boost, boosting: p.boosting, vx: p.vx }; });
    log(mid.mx > 0.8 && mid.boost, `joystick + boost simultanés (mx=${mid.mx.toFixed(2)}, boost=${mid.boost})`);
    await touch(page, cdp, 'touchStart', [{ x: s0.x + 60, y: s0.y, id: 1 }, { ...boost, id: 2 }, { ...jump, id: 3 }]);
    await sleep(120);
    const air = await game(page, () => ({ y: window.__bolid.session.player.y, jump: window.__bolid.input.read().jump }));
    log(air.jump && air.y > 0.8, `saut avec deux autres doigts posés (y=${air.y.toFixed(2)})`);
    await page.screenshot({ path: `${OUT}/06-multitouch.png` });
    const x1 = await game(page, () => window.__bolid.session.player.x);
    log(x1 > x0 + 2, `la voiture avance (${x0.toFixed(1)} → ${x1.toFixed(1)})`);

    // Pause pendant que les doigts sont posés, relâcher pendant la pause, reprendre : rien ne reste bloqué
    await page.keyboard.press('Escape');
    await sleep(100);
    const paused = await game(page, () => window.__bolid.paused);
    log(paused, 'pause ouverte (Échap)');
    await page.screenshot({ path: `${OUT}/07-pause.png` });
    await checkLayout(page, 'pause');
    const tPause = await game(page, () => window.__bolid.session.world.time);
    await sleep(500);
    const tPause2 = await game(page, () => window.__bolid.session.world.time);
    log(tPause === tPause2, 'simulation figée pendant la pause');
    await touch(page, cdp, 'touchEnd', []);
    await page.click('[data-pause=resume]');
    await sleep(200);
    const after = await game(page, () => window.__bolid.input.read());
    log(!after.boost && !after.jump && after.mx === 0, 'aucune commande bloquée après la pause');

    // Clavier aussi
    await page.keyboard.down('ArrowLeft');
    await sleep(300);
    const kb = await game(page, () => window.__bolid.input.read().mx);
    await page.keyboard.up('ArrowLeft');
    log(kb < -0.5, 'commandes clavier actives');

    // Fin de match accélérée : on avance la simulation jusqu'au bout
    await game(page, () => { const s = window.__bolid.session; s.clock = 0.5; s.score = [2, 1]; });
    await page.waitForSelector('#results:not(.hidden)', { timeout: 8000 });
    await sleep(300);
    await page.screenshot({ path: `${OUT}/08-results.png` });
    await checkLayout(page, 'résultats');
    const stats = await game(page, () => ({ matches: window.__bolid.save.stats.matches, wins: window.__bolid.save.stats.wins, xp: window.__bolid.save.profile.xp, lvl: window.__bolid.save.profile.level }));
    log(stats.matches === 1 && stats.wins === 1, `résultat enregistré (${JSON.stringify(stats)})`);

    // Revanche
    await page.click('#btn-rematch');
    await sleep(300);
    const st = await game(page, () => [window.__bolid.session.state, window.__bolid.session.score.join('-'), window.__bolid.resultShown]);
    log(st[0] === 'prep' || st[0] === 'countdown', `revanche relancée (${st.join(', ')})`);
    // Quitter
    await page.keyboard.press('Escape');
    await page.click('[data-pause=quit]');
    await sleep(200);
    const inMenu = await page.locator('#screen-menu.active').count();
    log(inMenu === 1, 'retour au menu');

    // Entraînement
    await page.click('[data-nav=play]');
    await page.click('[data-mode=training]');
    await sleep(1200);
    await page.click('#training-bar [data-act=launch]');
    await sleep(150);
    const launched = await game(page, () => window.__bolid.session.ball.vy);
    log(launched > 5, 'entraînement : balle lancée');
    await page.screenshot({ path: `${OUT}/09-training.png` });
    await page.click('#training-bar [data-act=resetBall]');
    const reset = await game(page, () => window.__bolid.session.ball.x);
    log(Math.abs(reset) < 0.5, 'entraînement : balle replacée');
    await page.keyboard.press('Escape');
    await page.click('[data-pause=quit]');

    // Défis de précision
    await page.click('[data-nav=play]');
    await page.click('[data-mode=precision]');
    await page.locator('#precision-list button').first().click();
    await sleep(1600);
    await page.screenshot({ path: `${OUT}/10-precision.png` });
    const prec = await game(page, () => window.__bolid.session.mode);
    log(prec === 'precision', 'défi de précision lancé');
    await page.keyboard.press('Escape');
    await page.click('[data-pause=quit]');

    // Parcours
    await page.click('[data-nav=play]');
    await page.click('[data-mode=course]');
    await page.locator('#course-list button').nth(1).click();
    await sleep(2600);
    await page.screenshot({ path: `${OUT}/11-course.png` });
    const course = await game(page, () => [window.__bolid.session.mode, window.__bolid.session.state]);
    log(course[0] === 'course' && course[1] === 'playing', `parcours lancé (${course})`);
    await page.keyboard.press('Escape');
    await page.click('[data-pause=quit]');

    // Changement d'arène dans un match (chaque arène se charge et se rend)
    for (const id of ['boite', 'fonderie', 'orbitale', 'neon', 'cratere']) {
      await game(page, (arenaId) => window.__bolid.startSession({ kind: 'match', teamSize: 2, difficulty: 'normal', arenaId, duration: 120 }), id);
      await sleep(4300);
      await page.screenshot({ path: `${OUT}/12-arena-${id}.png` });
      const ok = await game(page, () => window.__bolid.session.arenaDef.id);
      log(ok === id, `arène ${id} chargée et jouable`);
    }
    await game(page, () => window.__bolid.toMenu());

    // Rechargement : la sauvegarde est conservée
    await page.reload();
    await page.waitForFunction(() => !!window.__bolid);
    const persisted = await game(page, () => ({ paint: window.__bolid.save.garage.equipped.paint, matches: window.__bolid.save.stats.matches }));
    log(persisted.paint === 'p_rouge' && persisted.matches >= 1, `sauvegarde conservée après rechargement (${JSON.stringify(persisted)})`);

    log(errors.length === 0, `aucune erreur console (${errors.slice(0, 3).join(' | ')})`);
    await ctx.close();
  }

  // ------------------------------------------------------------------ ratios d'écran
  for (const vp of [{ width: 800, height: 480, n: 'android-5x3' }, { width: 1024, height: 768, n: 'tablette-4x3' }, { width: 932, height: 430, n: 'telephone-20x9' }, { width: 390, height: 844, n: 'portrait' }, { width: 1280, height: 720, n: 'pc-16x9' }]) {
    const { ctx, page, errors } = await newPage(browser, { width: vp.width, height: vp.height }, vp.n !== 'pc-16x9');
    await sleep(500);
    await checkLayout(page, `${vp.n} menu`);
    await page.screenshot({ path: `${OUT}/20-${vp.n}-menu.png` });
    await game(page, () => window.__bolid.startSession({ kind: 'match', teamSize: 3, difficulty: 'hard', arenaId: 'horizon', duration: 120 }));
    await sleep(4500);
    await checkLayout(page, `${vp.n} HUD`);
    await page.screenshot({ path: `${OUT}/21-${vp.n}-match.png` });
    // la balle et le joueur restent dans le cadre
    const inView = await game(page, () => {
      const a = window.__bolid; const cam = a.camera; const asp = a.renderer.aspect;
      const halfW = cam.viewH * asp / 2, halfH = cam.viewH / 2;
      const inside = (o) => Math.abs(o.x - cam.x) < halfW && Math.abs(o.y - cam.y) < halfH;
      return inside(a.session.ball) && inside(a.session.player);
    });
    log(inView, `${vp.n} : balle et joueur visibles`);
    log(errors.length === 0, `${vp.n} : aucune erreur console`);
    await ctx.close();
  }

  // ------------------------------------------------------------------ performance : plusieurs matchs simulés dans le navigateur
  {
    const { ctx, page, errors } = await newPage(browser, { width: 844, height: 390 });
    const perf = await game(page, async () => {
      const a = window.__bolid;
      const frames = [];
      for (let m = 0; m < 3; m++) {
        a.startSession({ kind: 'match', teamSize: 3, difficulty: 'hard', arenaId: 'orbitale', duration: 120 });
        a.session.brains.unshift(new (a.session.brains[0].constructor)(a.session.player, 'hard', Math.random));
        for (let f = 0; f < 600; f++) {
          const t0 = performance.now();
          for (let k = 0; k < 2; k++) { a.session.step(1 / 120, {}); a.handleEvents(a.session.drainEvents()); }
          a.particles.update(1 / 60);
          a.camera.update(1 / 60, a.session, a.renderer.aspect, true);
          a.renderer.render(a.session, 1, a.camera, a.particles, { playerId: 0 });
          frames.push(performance.now() - t0);
        }
      }
      frames.sort((x, y) => x - y);
      return { median: frames[frames.length >> 1], p95: frames[Math.floor(frames.length * 0.95)], heap: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null };
    });
    log(perf.p95 < 16, `performance 3c3 (sim + rendu) : médiane ${perf.median.toFixed(2)} ms, p95 ${perf.p95.toFixed(2)} ms / image, tas ${perf.heap ? perf.heap.toFixed(1) + ' Mo' : 'n/d'}`);
    log(errors.length === 0, 'performance : aucune erreur console');
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}
console.log(failures ? `\n${failures} échec(s)` : '\nTous les tests de bout en bout sont passés.');
process.exit(failures ? 1 : 0);
