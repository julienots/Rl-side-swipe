// Entrées : tactile multipoint (joystick + boutons), clavier et manette.
// Toutes les sources sont fusionnées en un instantané { mx, my, jump, boost }.
// reset() libère tout (pause, menu, perte de focus) pour éviter les commandes bloquées.

export class InputManager {
  constructor(els, settings) {
    this.els = els; // { root, stickZone, stickBase, stickKnob, jump, boost }
    this.settings = settings;
    this.enabled = false;
    this.keys = new Set();
    this.stick = { id: null, ox: 0, oy: 0, x: 0, y: 0, active: false };
    this.buttons = { jump: new Set(), boost: new Set() };
    this.out = { mx: 0, my: 0, jump: false, boost: false };
    this.lastSource = 'touch';
    this.onAction = null; // callback(actionName) pour pause etc.
    this._bind();
  }

  setSettings(settings) { this.settings = settings; this.layout(); }

  _bind() {
    const { stickZone, jump, boost } = this.els;
    const opt = { passive: false };
    stickZone.addEventListener('pointerdown', (e) => this._stickDown(e), opt);
    stickZone.addEventListener('pointermove', (e) => this._stickMove(e), opt);
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) stickZone.addEventListener(t, (e) => this._stickUp(e), opt);

    const bindBtn = (el, name) => {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (!this.enabled) return;
        try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        this.buttons[name].add(e.pointerId);
        el.classList.add('pressed');
        this.lastSource = 'touch';
        if (name === 'jump' && this.settings.controls.haptics && navigator.vibrate) navigator.vibrate(8);
      }, opt);
      const up = (e) => {
        this.buttons[name].delete(e.pointerId);
        if (this.buttons[name].size === 0) el.classList.remove('pressed');
      };
      for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(t, up, opt);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    };
    bindBtn(jump, 'jump');
    bindBtn(boost, 'boost');

    window.addEventListener('keydown', (e) => {
      if (e.repeat && this.keys.has(e.code)) return;
      const gameKey = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'ShiftLeft', 'ShiftRight', 'KeyK', 'KeyJ', 'KeyL'].includes(e.code);
      if (this.enabled && gameKey) e.preventDefault();
      this.keys.add(e.code);
      this.lastSource = 'keyboard';
      if (e.code === 'Escape' || e.code === 'KeyP') this.onAction?.('pause');
      if (e.code === 'KeyR') this.onAction?.('reset');
      if (e.code === 'KeyT') this.onAction?.('launch');
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.reset());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.reset(); });
  }

  _stickDown(e) {
    e.preventDefault();
    if (!this.enabled || this.stick.id !== null) return;
    const zone = this.els.stickZone;
    try { zone.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    const r = this.els.stickBase.getBoundingClientRect();
    this.stick.id = e.pointerId;
    if (this.settings.controls.joystick === 'fixed') {
      this.stick.ox = r.left + r.width / 2; this.stick.oy = r.top + r.height / 2;
    } else {
      this.stick.ox = e.clientX; this.stick.oy = e.clientY;
      const zr = zone.getBoundingClientRect();
      this.els.stickBase.style.left = `${e.clientX - zr.left}px`;
      this.els.stickBase.style.top = `${e.clientY - zr.top}px`;
    }
    this.stick.active = true;
    this.els.stickBase.classList.add('active');
    this.lastSource = 'touch';
    this._stickMove(e);
  }

  _stickMove(e) {
    if (e.pointerId !== this.stick.id) return;
    e.preventDefault();
    const radius = this.stickRadius();
    let dx = e.clientX - this.stick.ox, dy = e.clientY - this.stick.oy;
    const d = Math.hypot(dx, dy);
    if (d > radius) { dx *= radius / d; dy *= radius / d; }
    this.stick.x = dx / radius; this.stick.y = -dy / radius;
    this.els.stickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  _stickUp(e) {
    if (e.pointerId !== this.stick.id) return;
    this._releaseStick();
  }

  _releaseStick() {
    this.stick.id = null; this.stick.x = 0; this.stick.y = 0; this.stick.active = false;
    this.els.stickKnob.style.transform = 'translate(-50%, -50%)';
    this.els.stickBase.classList.remove('active');
    if (this.settings.controls.joystick !== 'fixed') {
      this.els.stickBase.style.left = '';
      this.els.stickBase.style.top = '';
    }
  }

  stickRadius() { return 52 * (this.settings.controls.scale || 1); }

  layout() {
    const c = this.settings.controls;
    const root = this.els.root;
    root.style.setProperty('--ctrl-scale', c.scale);
    root.style.setProperty('--ctrl-opacity', c.opacity);
    root.classList.toggle('left-handed', !!c.leftHanded);
    root.classList.toggle('fixed-stick', c.joystick === 'fixed');
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) this.reset();
  }

  /** Libère toutes les commandes (aucune touche ne reste enfoncée). */
  reset() {
    this.keys.clear();
    this._releaseStick();
    for (const k of ['jump', 'boost']) {
      this.buttons[k].clear();
      this.els[k].classList.remove('pressed');
    }
    this.out.mx = 0; this.out.my = 0; this.out.jump = false; this.out.boost = false;
  }

  read() {
    const o = this.out;
    let mx = 0, my = 0, jump = false, boost = false;
    if (this.enabled) {
      const k = this.keys;
      if (k.has('ArrowLeft') || k.has('KeyA')) mx -= 1;
      if (k.has('ArrowRight') || k.has('KeyD')) mx += 1;
      if (k.has('ArrowUp') || k.has('KeyW')) my += 1;
      if (k.has('ArrowDown') || k.has('KeyS')) my -= 1;
      jump = k.has('Space') || k.has('KeyJ');
      boost = k.has('ShiftLeft') || k.has('ShiftRight') || k.has('KeyK') || k.has('KeyL');
      if (mx && my) { mx *= Math.SQRT1_2; my *= Math.SQRT1_2; }
      if (this.stick.active) { mx = this.stick.x; my = this.stick.y; }
      if (this.buttons.jump.size) jump = true;
      if (this.buttons.boost.size) boost = true;
      // Manette
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const gp of pads) {
        if (!gp || !gp.connected) continue;
        const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
        if (Math.hypot(ax, ay) > 0.18) { mx = ax; my = -ay; this.lastSource = 'gamepad'; }
        const b = (i) => gp.buttons[i] && gp.buttons[i].pressed;
        if (b(0)) { jump = true; this.lastSource = 'gamepad'; }
        if (b(1) || b(7) || b(5)) { boost = true; this.lastSource = 'gamepad'; }
        if (b(14)) mx = -1;
        if (b(15)) mx = 1;
        if (b(9) && !this._startHeld) this.onAction?.('pause');
        this._startHeld = b(9);
        break;
      }
    }
    o.mx = mx; o.my = my; o.jump = jump; o.boost = boost;
    return o;
  }
}
