// ============ WebAudio 音效合成（无外部资源） ============
const AudioFX = (() => {
  let ctx = null, master = null, muted = false, vol = 0.5;
  let noiseBuf = null;

  function init() {
    if (ctx) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : vol;
      master.connect(ctx.destination);
      // 预生成白噪声
      const len = ctx.sampleRate * 1;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { /* 忽略音频不可用 */ }
  }

  function resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }
  function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : vol; }
  function setMasterVol(v) { vol = Math.max(0, Math.min(1, v)); if (master) master.gain.value = muted ? 0 : vol; }
  function getMasterVol() { return vol; }

  function noise(dur, vol, freq, type, fcut) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = freq || 1;
    const f = ctx.createBiquadFilter();
    f.type = type || 'lowpass';
    f.frequency.value = fcut || (type === 'highpass' ? 2600 : (type === 'bandpass' ? 1500 : 3200));
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t); src.stop(t + dur + 0.02);
  }

  function tone(freq, dur, vol, type, slide) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  // 第二泛音：错开音高（detune）制造层叠，可延迟（delay）加入
  function tone2(freq, dur, vol, type, detune, delay) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator();
    o.type = type || 'square';
    o.frequency.setValueAtTime(Math.max(20, freq * (detune || 1)), t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  // 回声：延时多拍、逐拍衰减并轻微降调，模拟轰鸣回荡
  function echoTone(freq, dur, vol, type, delay, fb, times) {
    if (!ctx || muted) return;
    let v = vol, f = freq;
    for (let i = 1; i <= times; i++) {
      v *= fb; f *= 0.985;
      if (v < 0.012) break;
      setTimeout(() => tone(f, Math.max(0.03, dur * 0.82), v, type), delay * 1000 * i);
    }
  }

  // ---------- 真实枪声采样（sounds/*.ogg，CC0 素材；加载失败静默回退合成） ----------
  const SND = {};   // file -> { buf }

  function playSample(s, meta, vm) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = s.buf;
    src.playbackRate.value = meta.pitch || 1;
    const g = ctx.createGain();
    g.gain.value = Math.min(1.5, (meta.vol || 1) * vm);
    let tail = src;
    if (meta.hp) {   // 低通滤波（消音/亚音速枪）
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = meta.hp;
      src.connect(f);
      tail = f;
    }
    if (meta.echo) { // 回声尾巴（轰鸣回荡）
      const delay = ctx.createDelay(1);
      delay.delayTime.value = 0.1 + (meta.echo || 0) * 0.5;
      const fb = ctx.createGain();
      fb.gain.value = meta.echo;
      const wet = ctx.createGain();
      wet.gain.value = 0.45;
      tail.connect(g);
      tail.connect(delay);
      delay.connect(fb); fb.connect(delay);
      delay.connect(wet); wet.connect(g);
    } else {
      tail.connect(g);
    }
    g.connect(master);
    src.start(t);
    src.stop(t + s.buf.duration / (meta.pitch || 1));   // 变速后实际时长 = 缓冲时长 / playbackRate
  }

  function loadGunSamples() {
    if (!ctx || typeof fetch !== 'function' || !ctx.decodeAudioData) return;
    const seen = new Set();
    for (const k of Object.keys(WEAPONS)) {
      const sf = WEAPONS[k] && WEAPONS[k].sndFile;
      if (!sf || seen.has(sf.file) || SND[sf.file]) continue;
      seen.add(sf.file);
      fetch('sounds/' + sf.file)
        .then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
        .then(buf => ctx.decodeAudioData(buf))
        .then(ab => { SND[sf.file] = { buf: ab }; })
        .catch(() => { /* 加载失败 → 回退合成音效 */ });
    }
  }

  // ---------- 单位独立语音（每类单位专属叫声，程序化合成） ----------
  // VOICES[unit][action] = 音符序列 { f 频率, d 时长, v 音量, t 波形, s 滑音目标 }
  // unit: human / z_normal / z_sprinter / z_boomer / z_mother / hero_light / hero_xuan
  const VOICES = {
    human: {
      hurt:  [{ f: 230, d: 0.09, v: 0.15, t: 'square', s: 150 }],                  // 短促"啊"
      roar:  [{ f: 190, d: 0.13, v: 0.18, t: 'square', s: 130 }],
      death: [{ f: 260, d: 0.22, v: 0.2, t: 'sawtooth', s: 90 }],
    },
    z_normal: {
      hurt:  [{ f: 130, d: 0.16, v: 0.22, t: 'sawtooth', s: 80 }],                 // 低沉呻吟
      roar:  [{ f: 105, d: 0.24, v: 0.26, t: 'sawtooth', s: 60 }],
      death: [{ f: 140, d: 0.42, v: 0.28, t: 'sawtooth', s: 40 }],
    },
    z_sprinter: {
      hurt:  [{ f: 640, d: 0.12, v: 0.2, t: 'sawtooth', s: 840 }],                 // 尖利嘶叫
      roar:  [{ f: 720, d: 0.18, v: 0.24, t: 'sawtooth', s: 980 }],
      death: [{ f: 820, d: 0.3, v: 0.26, t: 'sawtooth', s: 300 }],
    },
    z_boomer: {
      hurt:  [{ f: 160, d: 0.09, v: 0.18, t: 'square', s: 90 }, { f: 110, d: 0.1, v: 0.16, t: 'square', s: 60 }],  // 咕噜冒泡
      roar:  [{ f: 140, d: 0.12, v: 0.2, t: 'square', s: 75 }, { f: 95, d: 0.15, v: 0.18, t: 'square', s: 50 }],
      death: [{ f: 120, d: 0.22, v: 0.26, t: 'sawtooth', s: 42 }],
    },
    z_mother: {
      hurt:  [{ f: 72, d: 0.28, v: 0.34, t: 'sawtooth', s: 40 }],                  // 低沉巨吼
      roar:  [{ f: 55, d: 0.42, v: 0.4, t: 'sawtooth', s: 30 }],
      death: [{ f: 60, d: 0.6, v: 0.4, t: 'sawtooth', s: 22 }],
    },
    hero_light: {
      hurt:  [{ f: 400, d: 0.1, v: 0.16, t: 'triangle', s: 300 }],
      roar:  [{ f: 523, d: 0.12, v: 0.2, t: 'triangle' }, { f: 659, d: 0.13, v: 0.2, t: 'triangle' }, { f: 784, d: 0.22, v: 0.22, t: 'triangle' }],  // 明亮上行动机
      death: [{ f: 520, d: 0.32, v: 0.24, t: 'triangle', s: 200 }],
    },
    hero_xuan: {
      hurt:  [{ f: 260, d: 0.1, v: 0.2, t: 'sawtooth', s: 180 }],
      roar:  [{ f: 220, d: 0.16, v: 0.24, t: 'sawtooth' }, { f: 174, d: 0.24, v: 0.26, t: 'sawtooth' }],  // 暗色下行
      death: [{ f: 200, d: 0.36, v: 0.26, t: 'sawtooth', s: 80 }],
    },
  };

  // 播放单位语音：随机轻微变调，避免机械重复
  function playVoice(unit, action) {
    if (!ctx || muted) return;
    const seq = VOICES[unit] && VOICES[unit][action];
    if (!seq) return;
    const det = 0.94 + Math.random() * 0.12;
    let delay = 0;
    for (const n of seq) {
      setTimeout(() => tone(n.f * det, n.d, n.v, n.t, n.s), delay * 1000);
      delay += n.d;
    }
  }

  return {
    init, resume, setMuted, setMasterVol, getMasterVol,
    unlock() { this.init(); this.resume(); loadGunSamples(); },
    unitVoice(unit, action) { playVoice(unit, action); },
    shoot(key, volMul) {
      if (!ctx) return;
      const w = WEAPONS[key] || {};
      const vm = (volMul != null && volMul >= 0) ? volMul : 1;
      const sf = w.sndFile;
      if (sf && SND[sf.file] && SND[sf.file].buf) {   // 真实枪声采样已加载
        playSample(SND[sf.file], sf, vm);
        return;
      }
      if (w.snd) {   // 每把枪独立音效（config.js 注入）
        const s = w.snd;
        noise(s.nd, s.nv * vm, s.nf, s.nt);                                  // ① 主噪声（爆裂）
        if (s.n2v) noise(s.nd * 0.8, s.n2v * vm, s.n2f, s.nt2 || 'highpass'); // ② 噪声沙层（冲锋枪高频沙沙）
        tone(s.t, s.td, s.tv * vm, s.tw, s.slide);                            // ③ 主音调
        if (s.t2 && s.t2v) tone2(s.t2, s.td * 0.7, s.t2v * vm, s.tw, 1.02, 0.004); // ④ 泛音层叠
        if (s.echo) echoTone(s.t, s.td, s.tv * vm * 0.7, s.tw, s.echo, s.fb || 0.25, 5); // ⑤ 回声回荡
        return;
      }
      // 回退：按枪族合成
      const g = (WEAPON_GROUP_OF[key] || {}).id;
      if (g === 'sniper') { noise(0.18, 0.4 * vm, 0.6); tone(180, 0.15, 0.3 * vm, 'sawtooth', 60); echoTone(180, 0.15, 0.2 * vm, 'sawtooth', 0.16, 0.3, 4); }
      else if (g === 'shotgun') { noise(0.22, 0.5 * vm, 0.5); tone(120, 0.18, 0.3 * vm, 'square', 40); echoTone(120, 0.18, 0.2 * vm, 'square', 0.1, 0.22, 3); }
      else if (g === 'smg') { noise(0.07, 0.25 * vm, 1.2); noise(0.06, 0.12 * vm, 3.2, 'highpass'); tone(420, 0.05, 0.14 * vm, 'square', 180); }
      else if (g === 'pistol') { noise(0.1, 0.3 * vm, 0.9); tone(360, 0.06, 0.16 * vm, 'square', 140); }
      else if (g === 'lmg') { if (w.windup) { noise(0.05, 0.2 * vm, 1.6); tone(520, 0.04, 0.12 * vm, 'square', 240); } else { noise(0.07, 0.28 * vm, 1.1); noise(0.06, 0.08 * vm, 1.6, 'highpass'); tone(330, 0.06, 0.16 * vm, 'square', 160); } }
      else if (g === 'assault') { noise(0.08, 0.3 * vm, 1.0); noise(0.07, 0.05 * vm, 2.0, 'highpass'); tone(340, 0.06, 0.16 * vm, 'square', 150); echoTone(340, 0.06, 0.09 * vm, 'square', 0.04, 0.12, 3); }
      else { noise(0.09, 0.3 * vm, 1.0); tone(300, 0.07, 0.16 * vm, 'square', 120); }
    },
    melee() { noise(0.08, 0.3, 1.5); tone(700, 0.06, 0.18, 'sawtooth', 220); },
    throwGrenade() { noise(0.12, 0.25, 0.7); tone(300, 0.12, 0.14, 'square', 120); },
    pullPin() { tone(2400, 0.035, 0.16, 'square'); tone(1800, 0.05, 0.1, 'square', -500); },   // 拔销：清脆金属咔嗒
    reload(key) {
      const g = key && WEAPONS[key] ? WEAPONS[key].g : null;
      if (g === 'sniper') { tone(520, 0.05, 0.18, 'square'); setTimeout(() => tone(340, 0.09, 0.22, 'sawtooth', 140), 130); }        // 拉栓
      else if (g === 'shotgun') { tone(300, 0.05, 0.16, 'square'); setTimeout(() => tone(240, 0.07, 0.2, 'square', 90), 120); setTimeout(() => tone(420, 0.05, 0.14, 'square'), 260); } // 上弹
      else if (g === 'smg') { tone(640, 0.04, 0.14, 'square'); setTimeout(() => tone(760, 0.04, 0.14, 'square'), 90); }            // 咔哒
      else if (g === 'lmg') { tone(220, 0.1, 0.2, 'square'); setTimeout(() => tone(260, 0.12, 0.18, 'square'), 150); }             // 沉重
      else { tone(600, 0.04, 0.2, 'square'); setTimeout(() => tone(900, 0.04, 0.2, 'square'), 120); }
    },
    hit() { tone(220, 0.06, 0.25, 'triangle', 90); },
    zombieHit() { tone(140, 0.08, 0.28, 'sawtooth', 60); },
    infect() { tone(90, 0.5, 0.4, 'sawtooth', 30); noise(0.5, 0.3, 0.7, 'lowpass'); },
    boom() { noise(0.5, 0.6, 0.4); tone(70, 0.5, 0.5, 'sawtooth', 25); },
    slam() { noise(0.3, 0.5, 0.5); tone(80, 0.3, 0.45, 'square', 30); },
    jump() { tone(380, 0.09, 0.14, 'sine', 620); },
    dash() { noise(0.15, 0.25, 1.4); tone(500, 0.1, 0.12, 'sawtooth', 300); },
    count() { tone(660, 0.1, 0.2, 'square'); },
    go() { tone(880, 0.25, 0.3, 'square'); },
    win() { [523,659,784,1046].forEach((f,i)=>setTimeout(()=>tone(f,0.22,0.28,'triangle'),i*160)); },
    lose() { [300,240,180,120].forEach((f,i)=>setTimeout(()=>tone(f,0.3,0.28,'sawtooth'),i*200)); },
    empty() { tone(200, 0.03, 0.1, 'square'); },
  };
})();
