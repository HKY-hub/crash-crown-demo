// ============================================================
// 子系统 2.4 通用UI组件库
// 原子组件 / 容器组件 / 数据展示组件 / 卡片组件 + 原生控件代理层
// 视觉规范见 css/ui-shell.css 的 token 段。
// ============================================================
const UIKit = (() => {
  const NS = 'http://www.w3.org/1999/xhtml';

  function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  const h = (tag, cls, html) => el(tag, cls, html);

  // ---------- 容器组件：斜切面板 ----------
  // .gf（描边层）> .gf-in（内容层）。所有面板/卡片共用这一结构。
  function frame(cls, inner) {
    const f = h('div', 'gf' + (cls ? ' ' + cls : ''));
    const i = h('div', 'gf-in');
    if (inner) i.appendChild(inner);
    f.appendChild(i);
    f.body = i;
    return f;
  }
  function panel(title, opts = {}) {
    const f = frame(opts.cls || '');
    if (title) f.body.appendChild(sect(title, opts).head);
    const body = h('div', opts.bodyCls || '');
    f.body.appendChild(body);
    f.content = body;
    return f;
  }
  // 分区：图标 + 标题 + 延伸线 + 右侧备注
  function sect(title, opts = {}) {
    const head = h('div', 'g-sect-h');
    if (opts.icon) head.appendChild(h('i', '', opts.icon));
    head.appendChild(h('b', '', title));
    head.appendChild(h('s', ''));
    if (opts.note) head.appendChild(h('em', '', opts.note));
    return { head };
  }

  // ---------- 原子组件 ----------
  const CUT = 'polygon(var(--cut) 0,100% 0,100% calc(100% - var(--cut)),calc(100% - var(--cut)) 100%,0 100%,0 var(--cut))';

  function btn(o = {}) {
    const b = h('button', 'g-btn' + (o.kind ? ' g-btn--' + o.kind : '') + (o.size ? ' g-btn--' + o.size : '') + (o.cls ? ' ' + o.cls : ''));
    b.type = 'button';
    b.innerHTML = (o.icon ? `<i style="font-style:normal">${o.icon}</i>` : '') + `<span>${o.label ?? ''}</span>`;
    if (o.disabled) b.disabled = true;
    if (o.tip) tooltipize(b, o.tip, o.tipTitle);
    if (o.onClick) b.addEventListener('click', ev => { sfx('click'); o.onClick(b.dataset.value, ev); });
    b.$label = b.querySelector('span');
    return b;
  }
  function cta(o = {}) {
    const b = h('button', 'g-cta');
    b.type = 'button';
    b.innerHTML = `<span>${o.label ?? '开始游戏'}</span>` + (o.sub ? `<em style="font-style:normal;font-size:10px;letter-spacing:2px;opacity:.7">${o.sub}</em>` : '');
    if (o.onClick) b.addEventListener('click', ev => { sfx('confirm'); o.onClick(ev); });
    if (o.tip) tooltipize(b, o.tip);
    return b;
  }
  function iconBtn(glyph, o = {}) {
    const b = h('button', 'g-ibtn' + (o.cls ? ' ' + o.cls : ''), glyph);
    b.type = 'button';
    if (o.tip) tooltipize(b, o.tip);
    if (o.onClick) b.addEventListener('click', () => { sfx('click'); o.onClick(b); });
    return b;
  }
  function chip(text, kind) { return h('span', 'g-chip' + (kind ? ' g-chip--' + kind : ''), text); }
  function badge(n) {
    if (n == null) return h('i', 'g-badge g-badge--dot');
    return h('span', 'g-badge', String(n > 99 ? '99+' : n));
  }
  function toggle(o = {}) {
    const w = h('div', 'g-switch' + (o.on ? ' is-on' : ''));
    w.innerHTML = '<i></i><span></span>';
    const label = w.querySelector('span');
    const sync = () => { label.textContent = w.classList.contains('is-on') ? 'ON' : 'OFF'; };
    sync();
    w.addEventListener('click', () => {
      w.classList.toggle('is-on'); sync(); sfx('toggle');
      if (o.onChange) o.onChange(w.classList.contains('is-on'));
    });
    w.set = v => { w.classList.toggle('is-on', !!v); sync(); };
    w.get = () => w.classList.contains('is-on');
    return w;
  }
  // 滑杆：内部仍用原生 <input type=range>，保证键盘可达与 game.js 兼容
  function slider(o = {}) {
    const w = h('div', 'g-slider');
    const inp = el('input');
    inp.type = 'range';
    inp.min = o.min ?? 0; inp.max = o.max ?? 1; inp.step = o.step ?? 0.01; inp.value = o.value ?? o.min ?? 0;
    w.innerHTML = '<div class="g-slider-track"></div><div class="g-slider-fill"></div><div class="g-slider-ticks"></div><div class="g-slider-knob"></div>';
    w.appendChild(inp);
    const fill = w.querySelector('.g-slider-fill'), knob = w.querySelector('.g-slider-knob');
    function paint() {
      const mn = Number(inp.min), mx = Number(inp.max), r = mx === mn ? 0 : (Number(inp.value) - mn) / (mx - mn);
      fill.style.width = (r * 100).toFixed(2) + '%';
      knob.style.left = (r * 100).toFixed(2) + '%';
    }
    inp.addEventListener('input', () => { paint(); if (o.onInput) o.onInput(Number(inp.value)); });
    inp.addEventListener('change', () => { paint(); sfx('toggle'); if (o.onChange) o.onChange(Number(inp.value)); });
    paint();
    w.input = inp;
    w.set = v => { inp.value = v; paint(); };
    w.get = () => Number(inp.value);
    return w;
  }
  // 分段选择：options=[{v,l,tip}]
  function segs(o = {}) {
    const w = h('div', 'g-segs' + (o.cls ? ' ' + o.cls : ''));
    const items = [];
    for (const opt of (o.options || [])) {
      const s = h('div', 'g-seg' + (String(opt.v) === String(o.value) ? ' is-on' : ''), opt.l);
      if (opt.tip) tooltipize(s, opt.tip);
      if (opt.disabled) s.setAttribute('disabled', '');
      s.dataset.value = opt.v;
      s.addEventListener('click', () => {
        if (s.hasAttribute('disabled')) return;
        for (const it of items) it.classList.remove('is-on');
        s.classList.add('is-on'); sfx('select');
        if (o.onChange) o.onChange(opt.v);
      });
      items.push(s); w.appendChild(s);
    }
    w.set = v => { items.forEach((it, i) => it.classList.toggle('is-on', String(o.options[i].v) === String(v))); };
    return w;
  }
  // 游戏化下拉（替代原生 select 的外观；值仍写回传入的隐藏 select）
  function dropdown(o = {}) {
    const w = h('div', 'g-drop');
    const b = h('button', 'g-drop-btn');
    b.type = 'button';
    b.innerHTML = '<span class="dv"></span><s>▼</s>';
    const menu = h('div', 'g-drop-menu g-scroll');
    w.append(b, menu);
    let value = o.value;
    const opts = o.options || [];
    function label(v) { const x = opts.find(z => String(z.v) === String(v)); return x ? x.l : String(v ?? ''); }
    function render() {
      b.querySelector('.dv').textContent = label(value);
      menu.innerHTML = '';
      for (const opt of opts) {
        const it = h('div', 'g-drop-opt' + (String(opt.v) === String(value) ? ' is-on' : ''));
        if (opt.color) it.innerHTML = `<i style="color:${opt.color}">◆</i><span>${opt.l}</span>` + (opt.note ? `<u>${opt.note}</u>` : '');
        else it.innerHTML = `<span>${opt.l}</span>` + (opt.note ? `<u>${opt.note}</u>` : '');
        it.addEventListener('click', () => {
          value = opt.v; w.classList.remove('is-open'); render(); sfx('select');
          if (o.onChange) o.onChange(opt.v);
        });
        menu.appendChild(it);
      }
    }
    b.addEventListener('click', ev => {
      ev.stopPropagation();
      document.querySelectorAll('.g-drop.is-open').forEach(x => { if (x !== w) x.classList.remove('is-open'); });
      w.classList.toggle('is-open'); sfx('click');
    });
    render();
    w.set = v => { value = v; render(); };
    w.get = () => value;
    return w;
  }
  document.addEventListener('click', () => {
    document.querySelectorAll('.g-drop.is-open').forEach(x => x.classList.remove('is-open'));
  });

  // ---------- 数据展示组件 ----------
  function bar(o = {}) {
    const w = h('div', 'g-bar' + (o.kind ? ' g-bar--' + o.kind : '') + (o.seg ? ' g-bar--seg' : '') + (o.cls ? ' ' + o.cls : ''));
    w.innerHTML = '<i></i>' + (o.label != null ? '<b></b>' : '');
    const fill = w.querySelector('i'), txt = w.querySelector('b');
    w.set = (v, max) => {
      const r = Math.max(0, Math.min(1, max ? v / max : v));
      fill.style.width = (r * 100).toFixed(1) + '%';
      if (txt && o.label != null) txt.textContent = typeof o.label === 'function' ? o.label(v, max) : `${v}/${max}`;
      if (o.lowClass) w.classList.toggle('low', r <= (o.lowAt ?? .3));
    };
    if (o.value != null) w.set(o.value, o.max);
    return w;
  }
  // 属性条：标签 + 轨道 + 数值（仓库/对比/详情共用）
  function stat(o = {}) {
    const w = h('div', 'g-stat' + (o.best ? ' is-best' : ''));
    w.innerHTML = `<s>${o.label}</s><div class="g-bar${o.kind ? ' g-bar--' + o.kind : ''}"><i style="width:${Math.round((o.ratio || 0) * 100)}%"></i></div><u>${o.text ?? ''}</u>`;
    if (o.tip) tooltipize(w, o.tip);
    return w;
  }
  function stars(n) {
    const s = Math.max(0, Math.min(5, Math.round(n)));
    let html = '';
    for (let i = 0; i < 5; i++) html += i < s ? '<b>★</b>' : '☆';
    return h('span', 'g-stars', html);
  }
  function kv(label, value, note) {
    const w = h('div', 'g-kv', `<s>${label}</s><i>${value}</i>` + (note ? `<em>${note}</em>` : ''));
    return w;
  }

  // ---------- 卡片组件（模板） ----------
  function modeCard(o = {}) {
    const f = frame('g-card g-card--mode' + (o.on ? ' is-on' : ''), null);
    f.style.setProperty('--cut', '10px');
    const inr = h('div', 'md-in');
    const bg = h('div', 'md-bg');
    bg.style.background = o.bg || 'linear-gradient(120deg,#0d3a2e,#04141a)';
    inr.append(bg, h('div', 'md-ico', o.icon || '◆'), h('div', 'md-name', o.name), h('div', 'md-desc', o.desc || ''));
    if (o.tag) { const t = chip(o.tag, o.tagKind); t.className += ' md-tag'; inr.appendChild(t); }
    f.body.appendChild(inr);
    if (o.tip) tooltipize(f, o.tip);
    f.addEventListener('click', () => { sfx('select'); if (o.onClick) o.onClick(o.value); });
    f.setSelected = v => f.classList.toggle('is-on', !!v);
    return f;
  }
  function weaponCard(o = {}) {
    const f = frame('g-card g-card--wpn' + (o.on ? ' is-on' : ''), null);
    f.style.setProperty('--cut', '9px');
    const inr = h('div', 'wp-in');
    const cv = el('canvas'); cv.width = 150; cv.height = 66;
    const ft = h('div', 'wp-ft');
    ft.innerHTML = `<div class="wp-name">${o.name}</div><div class="wp-meta"></div>`;
    inr.append(cv, ft);
    if (o.eq) inr.appendChild(h('div', 'wp-eq', o.eq));
    f.body.appendChild(inr);
    f.canvas = cv; f.$meta = ft.querySelector('.wp-meta'); f.$name = ft.querySelector('.wp-name');
    if (o.tip) tooltipize(f, o.tip);
    f.addEventListener('click', () => { sfx('select'); if (o.onClick) o.onClick(o.key); });
    f.setSelected = v => f.classList.toggle('is-on', !!v);
    return f;
  }
  function roleCard(o = {}) {
    const f = frame('g-card g-card--role' + (o.on ? ' is-on' : ''), null);
    f.style.setProperty('--cut', '9px');
    const cv = el('canvas'); cv.width = 52; cv.height = 76;
    f.body.append(cv, h('div', 'rl-name', o.name), h('div', 'rl-skill', o.skill || ''));
    f.canvas = cv;
    f.addEventListener('click', () => { sfx('select'); if (o.onClick) o.onClick(o.id); });
    f.setSelected = v => f.classList.toggle('is-on', !!v);
    return f;
  }
  function bannerCard(o = {}) {
    const f = frame('g-banner', null);
    f.style.setProperty('--cut', '16px');
    const inr = h('div', '');
    inr.style.position = 'relative'; inr.style.height = '100%';
    const art = h('div', 'bn-art'); art.style.background = o.bg || 'linear-gradient(120deg,#123,#050a0c)';
    inr.append(art, h('div', 'bn-shade'), h('div', 'bn-txt',
      `<div class="bn-kicker">${o.kicker || 'EVENT'}</div><div class="bn-title">${o.title}</div><div class="bn-sub">${o.sub || ''}</div>`));
    if (o.left) inr.appendChild(h('div', 'bn-left', o.left));
    f.body.appendChild(inr);
    f.addEventListener('click', () => { sfx('click'); if (o.onClick) o.onClick(o.id); });
    return f;
  }

  // ---------- 组件状态：默认 / 选中 / 禁用 ----------
  function setSelected(node, on) { node.classList.toggle('is-on', !!on); node.classList.toggle('active', !!on); }
  function setDisabled(node, off) {
    if (off) { node.setAttribute('disabled', ''); node.classList.add('is-off'); }
    else { node.removeAttribute('disabled'); node.classList.remove('is-off'); }
  }

  // ---------- 原生控件代理层（保住 game.js 的 DOM 契约） ----------
  // 游戏化控件不直接持有状态，一律写回 index.html 里保留的原生 radio/checkbox/select，
  // 这样 game.js 的 querySelector('input[name=mode]:checked') 等读取路径完全不变。
  function rawRadio(name, value) {
    const r = document.querySelector(`input[name="${name}"][value="${value}"]`);
    if (r) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); }
    return !!r;
  }
  function rawRadioGet(name) {
    const r = document.querySelector(`input[name="${name}"]:checked`);
    return r ? r.value : null;
  }
  function rawCheck(id, on) {
    const c = document.getElementById(id);
    if (c) { c.checked = !!on; c.dispatchEvent(new Event('change', { bubbles: true })); }
  }
  function rawCheckGet(id) { const c = document.getElementById(id); return !!(c && c.checked); }
  function rawSelect(id, v) {
    const s = document.getElementById(id);
    if (s) { s.value = String(v); s.dispatchEvent(new Event('change', { bubbles: true })); }
  }
  function rawSelectGet(id) { const s = document.getElementById(id); return s ? s.value : null; }
  function rawSelectOptions(id) {
    const s = document.getElementById(id);
    return s ? [...s.options].map(o => ({ v: o.value, l: o.textContent.trim() })) : [];
  }
  // 把一组 segs 绑到原生 radio 组上
  function bindRadioGroup(name, options, extra) {
    return segs({
      options, value: rawRadioGet(name),
      onChange: v => { rawRadio(name, v); if (extra) extra(v); },
    });
  }
  // 把 dropdown 绑到原生 select 上
  function bindSelect(id, extra) {
    const opts = rawSelectOptions(id);
    return dropdown({
      options: opts, value: rawSelectGet(id),
      onChange: v => { rawSelect(id, v); if (extra) extra(v); },
    });
  }

  // ---------- 浮层：Tooltip ----------
  let tipEl = null;
  function tooltipize(node, text, title) {
    if (!text) return node;
    node.dataset.tip = text;
    if (title) node.dataset.tipTitle = title;
    if (!node.__tipBound) {
      node.__tipBound = 1;
      node.addEventListener('mouseenter', () => showTip(node));
      node.addEventListener('mouseleave', hideTip);
      node.addEventListener('focus', () => showTip(node));
      node.blur && node.addEventListener('blur', hideTip);
    }
    return node;
  }
  function showTip(node) {
    if (!tipEl) { tipEl = h('div', ''); tipEl.id = 'tooltip'; document.body.appendChild(tipEl); }
    tipEl.innerHTML = (node.dataset.tipTitle ? `<b>${node.dataset.tipTitle}</b>` : '') + node.dataset.tip;
    tipEl.classList.add('on');
    const r = node.getBoundingClientRect();
    const w = tipEl.offsetWidth, hh = tipEl.offsetHeight;
    let x = r.left + r.width / 2 - w / 2, y = r.top - hh - 8;
    if (y < 6) y = r.bottom + 8;
    x = Math.max(6, Math.min(window.innerWidth - w - 6, x));
    tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px';
  }
  function hideTip() { if (tipEl) tipEl.classList.remove('on'); }

  // ---------- UI 音效反馈（让界面"像游戏"的听觉部分） ----------
  const SFX = {
    hover: [660, .04, .05, 'square', 220],
    click: [880, .05, .09, 'square', -260],
    select: [1180, .06, .08, 'triangle', 340],
    toggle: [520, .05, .07, 'square', 120],
    confirm: [720, .12, .12, 'triangle', 520],
    back: [420, .08, .08, 'square', -160],
    error: [180, .16, .12, 'sawtooth', -60],
    page: [300, .07, .06, 'triangle', 180],
    reward: [980, .1, .1, 'triangle', 640],
  };
  let lastHover = 0;
  function sfx(kind) {
    const p = SFX[kind]; if (!p) return;
    if (kind === 'hover') { const n = performance.now(); if (n - lastHover < 90) return; lastHover = n; }
    try {
      if (typeof AudioFX === 'undefined') return;
      if (!AudioFX.__uiReady) { try { AudioFX.init && AudioFX.init(); AudioFX.unlock && AudioFX.unlock(); } catch (e) { } AudioFX.__uiReady = true; }
      AudioFX.tone(p[0], p[1], p[2], p[3], p[4]);
    } catch (e) { /* 音频未就绪时静默 */ }
  }

  // ---------- 程序化像素画工具（启动贴图 / Banner 图集 / 加载页美术） ----------
  function seeded(seed) { let s = (seed >>> 0) || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
  // 战术网格底纹：所有页面共用的程序化背景
  function paintGrid(ctx, W, H, o = {}) {
    const rnd = seeded(o.seed || 7);
    ctx.fillStyle = o.bg || '#04080b'; ctx.fillRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, o.tintA || 'rgba(20,72,62,.55)'); g.addColorStop(1, o.tintB || 'rgba(6,16,24,.1)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = o.line || 'rgba(53,240,160,.07)';
    const step = o.step || 26;
    for (let x = 0; x < W; x += step) ctx.fillRect(x, 0, 1, H);
    for (let y = 0; y < H; y += step) ctx.fillRect(0, y, W, 1);
    for (let i = 0; i < (o.dots || 260); i++) {
      const a = rnd();
      ctx.fillStyle = `rgba(${o.dotRgb || '53,240,160'},${(a * .3).toFixed(3)})`;
      ctx.fillRect((rnd() * W) | 0, (rnd() * H) | 0, rnd() < .2 ? 2 : 1, 1);
    }
    return rnd;
  }
  // 程序化"启动贴图"：远景废墟剪影 + 血月
  function paintSplash(ctx, W, H, t = 0) {
    const rnd = seeded(1337);
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#0a0d16'); sky.addColorStop(.55, '#1a0f12'); sky.addColorStop(1, '#04070a');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,90,60,.9)';
    ctx.beginPath(); ctx.arc(W * .74, H * .3, 46, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,180,120,.14)';
    ctx.beginPath(); ctx.arc(W * .74, H * .3, 86, 0, 7); ctx.fill();
    for (let i = 0; i < 220; i++) {
      ctx.fillStyle = `rgba(200,240,255,${(rnd() * .5).toFixed(2)})`;
      ctx.fillRect((rnd() * W) | 0, (rnd() * H * .5) | 0, 1, 1);
    }
    for (let layer = 0; layer < 3; layer++) {
      const base = H * (.62 + layer * .11), amp = 34 - layer * 8;
      ctx.fillStyle = ['#0d1a20', '#0a1418', '#060f12'][layer];
      ctx.beginPath(); ctx.moveTo(0, H);
      for (let x = 0; x <= W; x += 12) {
        const n = Math.sin(x * .011 + layer * 2.1) * amp + Math.sin(x * .037 + layer) * amp * .35;
        ctx.lineTo(x, base + n);
      }
      ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
      if (layer === 1) {
        for (let x = 40; x < W; x += 90) {
          const hh = 26 + ((x * 37) % 54);
          ctx.fillRect(x, base - hh, 16 + ((x * 13) % 22), hh);
          ctx.fillStyle = 'rgba(255,176,32,.5)';
          for (let wy = base - hh + 6; wy < base - 6; wy += 11)
            for (let wx = x + 3; wx < x + 14; wx += 6) if (((wx * wy) % 7) < 2) ctx.fillRect(wx, wy, 2, 3);
          ctx.fillStyle = '#0a1418';
        }
      }
    }
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
    const fl = .5 + .5 * Math.sin(t / 300);
    ctx.fillStyle = `rgba(53,240,160,${(.1 + fl * .12).toFixed(3)})`;
    ctx.fillRect(0, H * .62, W, 2);
    return rnd;
  }
  // 程序化 Banner 图集：按主题画一张活动图
  function paintBanner(ctx, W, H, theme) {
    const T = {
      bio: ['#2a0d10', '#0d1a16', '#ff5a4a', '⌬'],
      siege: ['#0d1f2a', '#101018', '#45d8ff', '⌖'],
      arena: ['#2a1408', '#120808', '#ffb020', '⚔'],
      villa: ['#1a1408', '#0d0f12', '#b9ff45', '⌂'],
      ddt: ['#101a2a', '#1a0d2a', '#a45cff', '◍'],
      hero: ['#0d2a24', '#04121a', '#35f0a0', '✦'],
    }[theme] || ['#0d1a20', '#04080b', '#35f0a0', '◆'];
    const rnd = seeded(T[0].length * 977 + W);
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, T[0]); g.addColorStop(1, T[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.globalAlpha = .5;
    for (let i = 0; i < 26; i++) {
      ctx.strokeStyle = T[2]; ctx.lineWidth = 1;
      ctx.beginPath(); const y0 = (i / 26) * H;
      ctx.moveTo(0, y0); ctx.lineTo(W * .45 + rnd() * W * .2, y0 + (rnd() - .5) * 40); ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = 'rgba(0,0,0,.42)';
    for (let i = 0; i < 9; i++) { const bw = 22 + rnd() * 54, bh = 30 + rnd() * 80; ctx.fillRect(W - 40 - i * 62 - bw, H - bh, bw, bh); }
    ctx.fillStyle = T[2]; ctx.globalAlpha = .16;
    ctx.beginPath(); ctx.arc(W * .72, H * .42, 40, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
    return T;
  }

  // ---------- 同源渲染入口：武器 / 角色（复用正式游戏的美术档案） ----------
  function drawWeapon(canvas, key, o = {}) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (typeof WeaponViews === 'undefined' || typeof WEAPONS === 'undefined' || !WEAPONS[key]) {
      ctx.fillStyle = 'rgba(53,240,160,.25)'; ctx.fillRect(6, canvas.height / 2 - 3, canvas.width - 12, 6);
      return;
    }
    const isThrow = WEAPONS[key].g === 'throw';
    const centerY = canvas.height / 2 + 2 - (isThrow ? 4 : 0);
    const fitY = isThrow ? Math.min(96, 2 * Math.min(centerY, canvas.height - 6 - centerY)) : Math.min(96, canvas.height - 8);
    try {
      WeaponViews.render(ctx, key, {
        scale: o.scale || 'inspect', x: canvas.width / 2, y: centerY,
        fit: [canvas.width - 14, fitY], attachments: o.attachments || [],
      });
    } catch (e) { /* 档案缺失时留占位条 */ }
  }
  function drawRole(canvas, skinId, o = {}) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    let art = null;
    try { art = (typeof OperatorSkins !== 'undefined') ? OperatorSkins.get(skinId) : null; } catch (e) { }
    if (!art) { ctx.fillStyle = '#123'; ctx.fillRect(0, 0, canvas.width, canvas.height); return; }
    const img = art.get(o.pose || 'idle');
    const s = o.scale || (canvas.height / 74);
    const w = img.width * s, hh = img.height * s;
    ctx.drawImage(img, (canvas.width - w) / 2, canvas.height - hh, w, hh);
  }

  // ---------- 小工具 ----------
  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); return node; }
  function mount(parent, ...kids) { for (const k of kids) if (k) parent.appendChild(k); return parent; }
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  return {
    el, h, frame, panel, sect,
    btn, cta, iconBtn, chip, badge, toggle, slider, segs, dropdown,
    bar, stat, stars, kv,
    modeCard, weaponCard, roleCard, bannerCard,
    setSelected, setDisabled,
    rawRadio, rawRadioGet, rawCheck, rawCheckGet, rawSelect, rawSelectGet, rawSelectOptions,
    bindRadioGroup, bindSelect,
    tooltipize, showTip, hideTip,
    sfx, seeded, paintGrid, paintSplash, paintBanner, drawWeapon, drawRole,
    clear, mount, esc, CUT,
  };
})();
