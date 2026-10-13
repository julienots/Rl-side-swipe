// Audio entièrement synthétisé (Web Audio) : aucun fichier externe, donc aucun problème de licence.
// Moteur, boost, impacts, rebonds, but, compte à rebours, interface et petite boucle musicale.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volumes = { master: 0.8, sfx: 0.9, music: 0.5 };
    this.musicOn = false;
    this._musicTimer = null;
    this._lastPlay = new Map();
  }

  /** À appeler dans un geste utilisateur (exigence des navigateurs mobiles). */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    try {
      const ctx = new AC();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.connect(ctx.destination);
      this.sfx = ctx.createGain(); this.sfx.connect(this.master);
      this.music = ctx.createGain(); this.music.connect(this.master);
      const len = ctx.sampleRate;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      let s = 1;
      for (let i = 0; i < len; i++) { s = (s * 16807) % 2147483647; d[i] = (s / 2147483647) * 2 - 1; }
      this._buildLoops();
      this.applyVolumes();
    } catch { this.enabled = false; }
  }

  setVolumes(master, sfx, music) {
    this.volumes = { master, sfx, music };
    this.applyVolumes();
  }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volumes.master, t, 0.05);
    this.sfx.gain.setTargetAtTime(this.volumes.sfx, t, 0.05);
    this.music.gain.setTargetAtTime(this.volumes.music * 0.35, t, 0.05);
  }

  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  _buildLoops() {
    const ctx = this.ctx;
    // moteur : dent de scie filtrée
    this.engOsc = ctx.createOscillator(); this.engOsc.type = 'sawtooth'; this.engOsc.frequency.value = 50;
    this.engOsc2 = ctx.createOscillator(); this.engOsc2.type = 'square'; this.engOsc2.frequency.value = 25;
    this.engFilter = ctx.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.frequency.value = 400;
    this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
    const g2 = ctx.createGain(); g2.gain.value = 0.4;
    this.engOsc.connect(this.engFilter); this.engOsc2.connect(g2); g2.connect(this.engFilter);
    this.engFilter.connect(this.engGain); this.engGain.connect(this.sfx);
    this.engOsc.start(); this.engOsc2.start();
    // boost : bruit filtré
    this.boostSrc = ctx.createBufferSource(); this.boostSrc.buffer = this.noiseBuf; this.boostSrc.loop = true;
    this.boostFilter = ctx.createBiquadFilter(); this.boostFilter.type = 'bandpass'; this.boostFilter.frequency.value = 900; this.boostFilter.Q.value = 0.8;
    this.boostGain = ctx.createGain(); this.boostGain.gain.value = 0;
    this.boostSrc.connect(this.boostFilter); this.boostFilter.connect(this.boostGain); this.boostGain.connect(this.sfx);
    this.boostSrc.start();
  }

  /** Mise à jour continue du moteur/boost du joueur. */
  updateCar(speed, throttle, boosting, active) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const on = active ? 1 : 0;
    this.engOsc.frequency.setTargetAtTime(48 + speed * 5.5 + Math.abs(throttle) * 10, t, 0.06);
    this.engOsc2.frequency.setTargetAtTime(24 + speed * 2.7, t, 0.06);
    this.engFilter.frequency.setTargetAtTime(300 + speed * 45, t, 0.08);
    this.engGain.gain.setTargetAtTime(on * (0.05 + Math.min(0.08, speed * 0.004) + Math.abs(throttle) * 0.03), t, 0.08);
    this.boostGain.gain.setTargetAtTime(on && boosting ? 0.22 : 0, t, boosting ? 0.03 : 0.1);
    this.boostFilter.frequency.setTargetAtTime(700 + speed * 40, t, 0.1);
  }

  _rate(key, minGap) {
    const now = performance.now();
    const last = this._lastPlay.get(key) || 0;
    if (now - last < minGap) return false;
    this._lastPlay.set(key, now);
    return true;
  }

  _env(node, t, peak, attack, decay) {
    node.gain.setValueAtTime(0.0001, t);
    node.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    node.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  tone(freq, dur, type = 'sine', vol = 0.3, slideTo = null, delay = 0, dest = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    this._env(g, t, vol, 0.01, dur);
    o.connect(g); g.connect(dest || this.sfx);
    o.start(t); o.stop(t + dur + 0.05);
  }

  noise(dur, freq, vol = 0.3, q = 1, type = 'bandpass', delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    this._env(g, t, vol, 0.005, dur);
    s.connect(f); f.connect(g); g.connect(this.sfx);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }

  play(name, intensity = 1) {
    if (!this.ctx || !this.enabled) return;
    const k = Math.min(1.5, Math.max(0.2, intensity));
    switch (name) {
      case 'hit':
        if (!this._rate('hit', 60)) return;
        this.tone(120 + 80 * k, 0.18, 'sine', 0.35 * k, 55);
        this.noise(0.08, 2500, 0.25 * k, 0.7);
        break;
      case 'bounce':
        if (!this._rate('bounce', 70)) return;
        this.tone(90 + 40 * k, 0.12, 'sine', 0.2 * k, 50);
        break;
      case 'carImpact':
        if (!this._rate('carImpact', 120)) return;
        this.noise(0.12, 500, 0.2 * k, 0.6, 'lowpass');
        break;
      case 'bump':
        if (!this._rate('bump', 120)) return;
        this.noise(0.15, 300, 0.35, 0.8, 'lowpass');
        this.tone(70, 0.15, 'square', 0.12, 40);
        break;
      case 'jump':
        this.noise(0.12, 1800, 0.08, 1.5, 'highpass');
        this.tone(220, 0.1, 'triangle', 0.06, 330);
        break;
      case 'flip':
        this.noise(0.25, 1200, 0.12, 0.8, 'bandpass');
        break;
      case 'land':
        if (!this._rate('land', 150)) return;
        this.noise(0.1, 400, 0.12 * k, 0.8, 'lowpass');
        break;
      case 'pad':
        this.tone(520, 0.12, 'triangle', 0.12, 1040);
        break;
      case 'countdown':
        this.tone(660, 0.16, 'square', 0.12);
        break;
      case 'go':
        this.tone(990, 0.4, 'square', 0.14);
        this.tone(1320, 0.4, 'triangle', 0.08);
        break;
      case 'goal':
        this.noise(1.6, 900, 0.25, 0.4, 'bandpass'); // foule
        [523, 659, 784].forEach((f, i) => this.tone(f, 0.9, 'sawtooth', 0.09, null, i * 0.02));
        this.tone(1046, 1.1, 'square', 0.06, null, 0.25);
        break;
      case 'whistle':
        this.tone(2100, 0.25, 'sine', 0.12, 2000);
        this.tone(2100, 0.5, 'sine', 0.12, 1900, 0.32);
        break;
      case 'save':
        this.tone(440, 0.15, 'triangle', 0.12, 660);
        break;
      case 'checkpoint':
        this.tone(784, 0.12, 'triangle', 0.16);
        this.tone(1175, 0.2, 'triangle', 0.14, null, 0.08);
        break;
      case 'success':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.14, null, i * 0.08));
        break;
      case 'fail':
        this.tone(300, 0.35, 'sawtooth', 0.1, 150);
        break;
      case 'levelup':
        [392, 523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.13, null, i * 0.09));
        break;
      case 'click':
        this.tone(880, 0.05, 'triangle', 0.08);
        break;
      case 'back':
        this.tone(520, 0.06, 'triangle', 0.07, 380);
        break;
      case 'buy':
        this.tone(1200, 0.08, 'square', 0.08); this.tone(1600, 0.15, 'triangle', 0.1, null, 0.07);
        break;
      default: break;
    }
  }

  /** Petite boucle musicale générative (accords + arpège), discrète. */
  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    const chords = [[220, 277, 330], [196, 247, 294], [175, 220, 262], [196, 247, 330]];
    let step = 0;
    const beat = 0.24;
    let next = this.ctx.currentTime + 0.1;
    const tick = () => {
      if (!this.musicOn || !this.ctx) return;
      while (next < this.ctx.currentTime + 0.5) {
        const bar = Math.floor(step / 16) % chords.length;
        const ch = chords[bar];
        const delay = next - this.ctx.currentTime;
        if (step % 16 === 0) ch.forEach((f) => this.tone(f, beat * 15, 'triangle', 0.05, null, delay, this.music));
        if (step % 4 === 0) this.tone(ch[0] / 2, beat * 3, 'sine', 0.12, null, delay, this.music);
        if (step % 2 === 0) this.tone(ch[(step / 2) % 3] * 2, beat * 0.9, 'square', 0.025, null, delay, this.music);
        next += beat; step++;
      }
      this._musicTimer = setTimeout(tick, 150);
    };
    tick();
  }

  stopMusic() {
    this.musicOn = false;
    if (this._musicTimer) clearTimeout(this._musicTimer);
    this._musicTimer = null;
  }
}
