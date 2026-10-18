// ============================================================
// 游戏客户端壳层：2.1 启动与登录 · 2.2 大厅 · 2.5 路由 · 2.6 仓库 · 2.7 准星/灵敏度
// 依赖：UIKit(ui-kit.js) · Overlay/Notify/Toast/Guide(ui-overlay.js)
// 与 game.js 的契约：所有原生控件（radio/checkbox/select/按钮）保留在 #uiRaw 宿主内，
// 游戏化控件只负责写回它们并派发 change，不复制一份状态。
// ============================================================

// ---------- 契约保全层 ----------
// game.js / js/net.js / index.html 内联脚本靠 id 与 name 读写 DOM。
// 这里在重建界面之前，把那些元素从旧结构里"摘出来保住"，再按新布局插回原位，
// 因此 index.html 的 body 结构无需改动，控件的 id / name / checkedness 全部原样保留。
const Contract = (() => {
  const kept = {};        // id → node
  const groups = {};      // radio 组名 → [{value, checked}]
  function pick(id) {
    const n = document.getElementById(id);
    if (n) { n.remove(); kept[id] = n; }
    return kept[id] || null;
  }
  function pickAll(sel) {
    const out = [];
    for (const n of [...document.querySelectorAll(sel)]) { n.remove(); out.push(n); }
    return out;
  }
  function snapshotRadios(name) {
    const g = groups[name] = [];
    for (const r of document.querySelectorAll(`input[name="${name}"]`)) g.push({ v: r.value, c: r.checked });
    return g;
  }
  function restoreRadios() {
    for (const [name, g] of Object.entries(groups)) {
      for (const it of g) {
        const r = document.querySelector(`input[name="${name}"][value="${it.v}"]`);
        if (r) r.checked = it.c;      // 摘除/重插后显式回写 checkedness，不依赖浏览器保留
      }
    }
  }
  const get = id => kept[id] || null;
  function take(id, cls) {
    const n = kept[id];
    if (n && cls) n.className = cls;
    return n || null;
  }
  return { pick, pickAll, snapshotRadios, restoreRadios, get, take };
})();

// ---------- 玩家资源缓存（2.2 四级底层数据） ----------
const Profile = (() => {
  const KEY = 'zombie_profile';
  const DEF = {
    nick: '幸存者-0731', uid: '', channel: 'official', server: 'cn-east-1',
    level: 12, exp: 3400, gold: 128600, diam: 2480, stamina: 120, staminaMax: 150,
    rank: '青铜 III', matches: 0, wins: 0, created: Date.now(),
  };
  let p = null;
  function load() {
    if (p) return p;
    p = Object.assign({}, DEF);
    try { Object.assign(p, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { }
    if (!p.uid) { p.uid = 'UID' + Math.floor(1e8 + Math.random() * 8e8); save(); }
    return p;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { } }
  function patch(o) { Object.assign(p, o); save(); bus.emit('profile', p); }
  // 经验入账并结算升级：升级后刷新大厅
  function addExp(n) {
    load(); const need = 1000 + p.level * 420;
    p.exp += n;
    let ups = 0;
    while (p.exp >= need) { p.exp -= need; p.level++; ups++; }
    save(); if (ups) bus.emit('levelup', ups);
    return ups;
  }
  const bus = (() => {
    const m = {};
    return {
      on(k, f) { (m[k] = m[k] || []).push(f); },
      emit(k, v) { (m[k] || []).forEach(f => { try { f(v); } catch (e) { console.warn(e); } }); },
    };
  })();
  return {
    get data() { return load(); }, save, patch, addExp, bus,
    get nick() { return load().nick; }, get uid() { return load().uid; },
  };
})();

// ---------- 2.5 界面路由 & 跳转管理子系统 ----------
const Router = (() => {
  // 四级底层数据：功能解锁配置
  const UNLOCK = {
    'ddt': { need: 99, reason: '弹弹堂入口为活动预留，当前版本尚未开放', flag: 'zombie_unlock_ddt' },
  };
  // 四级底层数据：页面跳转关系（谁允许跳到谁）
  const EDGES = {
    boot: ['login'],
    login: ['lobby'],
    lobby: ['loading'],
    loading: ['lobby'], result: ['lobby', 'loading'],
  };
  // 底部导航下的同级一级页之间允许任意互切，不必逐条登记
  const TOP = ['lobby', 'warehouse', 'training', 'online', 'settings', 'ddt'];
  const edgeOk = (from, to) => (TOP.includes(from) && TOP.includes(to)) || !!((EDGES[from] || []).includes(to));
  const pages = new Map();   // id → {id, el, onEnter, onLeave, ready}
  const interceptors = [];   // (from,to,params) => true 表示已处理、取消本次跳转
  const history = [];
  let cur = null, busy = false;

  function register(id, def) {
    const el = def.el || document.getElementById('page-' + id);
    const p = { id, el, onEnter: def.onEnter, onLeave: def.onLeave, build: def.build, ready: false, title: def.title || id };
    pages.set(id, p);
    if (el) el.classList.add('g-page');
    return p;
  }
  function addInterceptor(fn) { interceptors.push(fn); }
  // 跳转拦截器：未保存更改 / 功能未解锁 / 非法跳转
  function blocked(from, to) {
    const u = { ddt: 'ddt' };
    if (to === 'ddt') {
      const k = UNLOCK.ddt;
      if (!localStorage.getItem(k.flag)) {
        Overlay.alert({ title: '功能未解锁', alert: false, icon: '🔒', text: k.reason, okText: '返回大厅' });
        return true;
      }
    }
    const dirty = window.__uiDirty && window.__uiDirty();
    if (dirty && from === 'warehouse' && to !== 'warehouse') {
      Overlay.confirm({
        title: '有未保存的装备配置', text: '离开仓库将放弃本次修改，确定继续？',
        okText: '放弃并离开', cancelText: '留在仓库', alert: true,
        onOk: () => { window.__uiDirtyClear(); go(to, null, true); },
      });
      return true;
    }
    if (from && !edgeOk(from, to)) {
      // 关系表只用于提示开发者，不阻断玩家操作（历史栈仍可回退）
      console.warn(`[Router] 非常规跳转 ${from} → ${to}`);
    }
    return false;
  }
  function go(id, params, force, noPush) {
    const p = pages.get(id);
    if (!p) { console.warn('[Router] 未注册页面', id); return false; }
    if (cur === id) return false;
    if (!force && cur && blocked(cur, id)) return false;
    const from = cur;
    if (from) {
      const old = pages.get(from);
      if (old && old.el) {
        old.el.classList.add('is-out');
        setTimeout(() => { old.el.classList.remove('is-active', 'is-out', 'is-in'); }, 170);
        old.onLeave && old.onLeave();
      }
      // noPush：回退产生的跳转不再入栈，否则 A→B→back→B→back 会在栈里来回震荡
      if (!noPush && (!history.length || history[history.length - 1] !== from)) history.push(from);
    }
    busy = true;
    if (!p.ready && p.build) { try { p.build(p); } catch (e) { console.error('[Router] build ' + id, e); } p.ready = true; }
    cur = id;
    // 不能等 requestAnimationFrame 才加 is-active：面板/标签页在后台时 rAF 被挂起，
    // 结果是页面建好了却永远不显示。改为立即生效 + 一次强制重排来触发入场动画。
    p.el.classList.add('is-active');
    void p.el.offsetWidth;
    p.el.classList.add('is-in');
    p.onEnter && p.onEnter(params || {});
    UIKit.sfx('page');
    Notify.refreshAll(p.el);
    busy = false;
    document.dispatchEvent(new CustomEvent('uiroute', { detail: { from, to: id } }));
    return true;
  }
  function back() {
    if (Overlay.count) return Overlay.closeTop();
    if (Guide.active) { Guide.stop(false); return true; }
    const prev = history.pop();
    if (prev) { go(prev, null, true, true); return true; }
    return false;
  }
  // 预加载资源清单：进入页面前把该页要用的绘制依赖跑一遍，避免首帧空图
  const PRELOAD = {
    lobby: () => { try { if (typeof WH_SPRITES !== 'undefined') WH_SPRITES.preload(Object.keys(WEAPONS).slice(0, 24)); } catch (e) { } },
    warehouse: () => { try { if (typeof WH_SPRITES !== 'undefined') WH_SPRITES.preload(Object.keys(WEAPONS)); } catch (e) { } },
  };
  function warm(id) { PRELOAD[id] && PRELOAD[id](); }
  addEventListener('keydown', e => {
    if (e.key === 'Escape' && !Overlay.count && !Guide.active && cur && cur !== 'lobby' && cur !== 'boot') { e.preventDefault(); back(); }
  });
  return { register, go, back, addInterceptor, warm, get current() { return cur; }, get history() { return history; }, UNLOCK };
})();

// ---------- 2.1 启动与登录子系统 ----------
const Boot = (() => {
  // 四级底层数据：版本配置表
  const VERSION = {
    client: '1.4.2', res: '2026.10.01-r7', proto: 12, channel: 'official',
    build: '20261001.0731', engine: 'PX2D/1.4',
  };
  // 四级底层数据：热更资源清单（本地缓存指纹 → 是否需要下载）
  const MANIFEST = [
    { name: '武器美术档案', key: 'art-guns', size: 8.4, ver: 'r7' },
    { name: '近战与投掷档案', key: 'art-melee', size: 3.1, ver: 'r7' },
    { name: '角色与干员像素', key: 'px-chars', size: 5.7, ver: 'r6' },
    { name: '地图主题（列车/别墅/古堡）', key: 'themes', size: 11.2, ver: 'r7' },
    { name: '音效包', key: 'sfx', size: 6.9, ver: 'r5' },
    { name: 'UI 图集与字体', key: 'ui-atlas', size: 2.3, ver: 'r7' },
  ];
  const CACHE_KEY = 'zombie_res_cache';
  function cached() { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch (e) { return {}; } }
  function need() { const c = cached(); return MANIFEST.filter(m => c[m.key] !== m.ver); }

  const TIPS = [
    '提示：人类踩上绿色前线后倒计时才会开始，别在原地等。',
    '提示：投掷物长按可蓄力，抛物线会变远变直；右键先拔插销可控制空爆。',
    '提示：补给点按 E 切背包，B 键可全图切背包（30 秒冷却）。',
    '提示：能量满后按 H 变英雄，英雄形态下背包锁定。',
    '提示：滚轮在同一类别内切换具体枪械，数字键 1-4 切槽位。',
    '提示：战术攻防里守方按 1 放绊线雷、按 2 加固墙体。',
    '提示：仓库里的武器预览与局内手持是同一份美术档案，所见即所得。',
  ];

  let root = null, bar = null, txt = null, tipEl = null, stepEl = null, cv = null;
  function build(page) {
    root = page.el;
    root.innerHTML = '';
    const bg = UIKit.h('div', 'bt-bg'); cv = document.createElement('canvas'); cv.width = 960; cv.height = 540;
    bg.appendChild(cv); bg.appendChild(UIKit.h('div', 'bt-vig'));
    const logo = UIKit.h('div', 'bt-logo', `<h1>生<span>化</span>追击</h1><p>BIO · PURSUIT · HORIZONTAL</p><div class="bt-line"></div>`);
    const warn = UIKit.h('div', 'bt-warn', '本游戏含轻微惊吓与血腥表现 · 未成年人请在监护人陪同下游玩');
    const load = UIKit.h('div', 'bt-load');
    load.innerHTML = `<div class="bt-bar"><i></i></div>
      <div class="bt-tip">正在初始化引擎…</div>
      <div class="bt-row"><span class="bt-step">引擎启动</span><s></s><span class="bt-pct">0%</span></div>`;
    bar = load.querySelector('.bt-bar i');
    txt = load.querySelector('.bt-tip');
    stepEl = load.querySelector('.bt-step');
    const pct = load.querySelector('.bt-pct');
    const skip = UIKit.btn({ label: '跳过动画', kind: 'ghost', size: 'sm', cls: 'bt-skip', onClick: () => finish(true) });
    root.append(bg, logo, warn, load, skip);
    const meta = UIKit.h('div', '');
    meta.style.cssText = 'position:absolute;left:26px;bottom:22px;font-size:10px;letter-spacing:1px;color:#587a76;line-height:1.9';
    meta.innerHTML = `客户端 v${VERSION.client} · 资源 ${VERSION.res} · 协议 ${VERSION.proto}<br>渠道 ${VERSION.channel} · 引擎 ${VERSION.engine}`;
    root.appendChild(meta);
    return { pct };
  }

  let raf = 0, refs = null, t0 = 0, done = false;
  function enter() {
    if (!root) root = document.getElementById('page-boot');
    if (!root) { console.warn('[Boot] 缺少 #page-boot'); return; }
    if (done) { Router.go('login'); return; }
    refs = build({ el: root });
    t0 = performance.now();
    const STEPS = [
      { n: '引擎启动', to: 14, ms: 380 },
      { n: '版本校验', to: 26, ms: 320 },
      { n: '检查热更清单', to: 44, ms: 520 },
      { n: '下载资源', to: 72, ms: 900 },
      { n: '解压与校验', to: 88, ms: 480 },
      { n: '预热武器档案', to: 100, ms: 520 },
    ];
    let si = 0, shown = 0;
    const missing = need();
    const total = MANIFEST.reduce((a, m) => a + m.size, 0);
    function tick(now) {
      const el = now - t0;
      UIKit.paintSplash(cv.getContext('2d'), cv.width, cv.height, now);
      const s = STEPS[si];
      if (!s) { if (!done) finish(false); return; }
      const local = (now - (s._t || (s._t = now))) / s.ms;
      const span = s.to - (si ? STEPS[si - 1].to : 0);
      shown = (si ? STEPS[si - 1].to : 0) + span * Math.min(1, local);
      bar.style.width = shown.toFixed(1) + '%';
      refs.pct.textContent = Math.floor(shown) + '%';
      stepEl.textContent = s.n;
      if (si === 2) txt.innerHTML = missing.length
        ? `发现 <b style="color:#ffb020">${missing.length}</b> 项资源待更新（${missing.reduce((a, m) => a + m.size, 0).toFixed(1)} MB / 共 ${total.toFixed(1)} MB）`
        : `资源清单一致（${MANIFEST.length} 项 / ${total.toFixed(1)} MB），无需热更`;
      else if (si === 3) txt.textContent = `正在下载：${(missing[0] || MANIFEST[0]).name}…`;
      else if (si === 4) txt.textContent = `正在解压并逐文件校验哈希（${MANIFEST.length} 个包）…`;
      else if (si === 5) txt.textContent = '正在预热 WeaponArt 档案与像素角色表…';
      else if (el % 4200 < 20) txt.textContent = TIPS[(el / 4200 | 0) % TIPS.length];
      if (local >= 1) { si++; }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    // 页面在后台时 rAF 挂起，但 performance.now() 照走：等切回前台再画的话，
    // 各阶段会按挂起期间累积的 elapsed 一次性跳过，启动动画一闪就没。
    // 所以隐藏状态下先停住，真正可见时重置计时起点、从头播。
    if (document.hidden) {
      cancelAnimationFrame(raf);
      const startWhenVisible = () => {
        if (!document.hidden) {
          document.removeEventListener('visibilitychange', startWhenVisible);
          t0 = performance.now();
          for (const s of STEPS) delete s._t;
          raf = requestAnimationFrame(tick);
        }
      };
      document.addEventListener('visibilitychange', startWhenVisible);
    }
    // 真实预热：把武器档案跑一遍，让大厅首帧不空
    try { if (typeof WH_SPRITES !== 'undefined') WH_SPRITES.preload(Object.keys(WEAPONS).slice(0, 16)); } catch (e) { }
  }
  function finish(skipped) {
    if (done) return; done = true;
    cancelAnimationFrame(raf);
    try { const c = cached(); for (const m of MANIFEST) c[m.key] = m.ver; localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch (e) { }
    bar.style.width = '100%'; refs && (refs.pct.textContent = '100%');
    stepEl.textContent = '完成';
    txt.textContent = skipped ? '已跳过启动动画' : '资源就绪，正在进入登录…';
    setTimeout(() => { root.classList.remove('is-active'); Router.go('login'); }, skipped ? 120 : 420);
  }
  return { VERSION, MANIFEST, TIPS, enter, build, get done() { return done; } };
})();

const Auth = (() => {
  // 四级底层数据：渠道账号
  const CHANNELS = [
    { v: 'official', l: '官方', icon: '◈' }, { v: 'wechat', l: '微信', icon: '◉' },
    { v: 'qq', l: 'QQ', icon: '◍' }, { v: 'guest', l: '游客', icon: '◇' },
  ];
  // 四级底层数据：服务器列表（延迟/负载/推荐）
  const SERVERS = [
    { v: 'cn-east-1', l: '华东 · 生化一号', ping: 18, load: .42, rec: true, region: '电信' },
    { v: 'cn-north-2', l: '华北 · 封锁区', ping: 34, load: .68, region: '联通' },
    { v: 'cn-south-1', l: '华南 · 货运站', ping: 46, load: .31, region: '电信' },
    { v: 'cn-west-3', l: '西部 · 废弃矿线', ping: 88, load: .12, region: '移动' },
    { v: 'sea-1', l: '东南亚 · 新加坡', ping: 142, load: .55, region: '海外' },
  ];
  let root = null;
  function enter() {
    if (!root) return;
    root.innerHTML = '';
    const bg = UIKit.h('div', 'bt-bg'); const cv = document.createElement('canvas'); cv.width = 960; cv.height = 540;
    bg.appendChild(cv); bg.appendChild(UIKit.h('div', 'bt-vig'));
    root.appendChild(bg);
    UIKit.paintSplash(cv.getContext('2d'), 960, 540, performance.now());

    const box = UIKit.frame('lg-box', null);
    box.style.setProperty('--cut', '18px');
    const b = box.body;
    b.innerHTML = `<div class="lg-title">连 入 防 线</div><div class="lg-sub">BIO-PURSUIT · CLIENT AUTH</div>`;

    b.appendChild(UIKit.h('div', '', '<s class="cap" style="display:block;letter-spacing:2px;margin-bottom:6px">登录渠道</s>'));
    const chs = UIKit.h('div', 'lg-channels');
    let ch = Profile.data.channel || 'official';
    for (const c of CHANNELS) {
      const n = UIKit.h('div', 'lg-ch' + (c.v === ch ? ' is-on' : ''), `<i>${c.icon}</i>${c.l}`);
      n.addEventListener('click', () => {
        ch = c.v; [...chs.children].forEach(x => x.classList.remove('is-on')); n.classList.add('is-on');
        UIKit.sfx('select'); Profile.patch({ channel: c.v });
      });
      chs.appendChild(n);
    }
    b.appendChild(chs);

    const field = UIKit.h('div', 'lg-field');
    field.innerHTML = '<s>呼号 / 昵称</s>';
    const inp = UIKit.h('input', 'ui-dlg-input'); inp.value = Profile.data.nick; inp.maxLength = 12;
    inp.placeholder = '2-12 个字符，支持中文';
    field.appendChild(inp); b.appendChild(field);

    const legal = UIKit.h('div', 'lg-legal');
    const agree = UIKit.toggle({ on: true });
    legal.append(agree, UIKit.h('span', '', '我已阅读并同意<a href="javascript:void(0)">《用户协议》</a>与<a href="javascript:void(0)">《隐私政策》</a>，理解本游戏含<b style="color:#ff8a8a">生化惊悚</b>元素。'));
    b.appendChild(legal);

    const check = UIKit.h('div', 'lg-check', '<div class="ck-spin"></div><span>正在校验账号与实名状态…</span>');
    b.appendChild(check);

    const row = UIKit.h('div', 'row');
    const svBtn = UIKit.btn({ label: '选择服务器', kind: 'dark', icon: '⌖', onClick: () => pickServer() });
    const svName = UIKit.h('span', 'cap', '');
    row.append(svBtn, svName, UIKit.h('span', 'spacer'));
    b.appendChild(row);

    const go = UIKit.btn({ label: '进 入 大 厅', kind: 'primary', size: 'xl', onClick: () => login() });
    go.style.width = '100%'; go.style.marginTop = '14px';
    b.appendChild(go);
    const castleGuest = UIKit.h('a', 'g-btn', '古堡探索');
    castleGuest.href = 'index.html?castleWalk=1';
    castleGuest.style.cssText = 'display:block;text-align:center;margin-top:10px;padding:10px';
    b.appendChild(castleGuest);
    root.appendChild(box);

    let server = Profile.data.server || 'cn-east-1';
    const paintSv = () => { const s = SERVERS.find(x => x.v === server); svName.innerHTML = `当前：<b style="color:#35f0a0">${s.l}</b> · ${s.ping}ms`; };
    paintSv();
    function pickServer() {
      Overlay.picker({
        title: '选择服务器', cls: '',
        options: SERVERS.map(s => ({
          l: s.l + (s.rec ? '　' + '<span style="color:#b9ff45;font-size:10px">推荐</span>' : ''),
          note: `${s.region} · ${s.ping}ms · ${Math.round(s.load * 100)}% 负载`,
          icon: s.ping < 40 ? '●' : (s.ping < 100 ? '◐' : '○'), value: s.v,
        })),
        onPick: v => { server = v; Profile.patch({ server: v }); paintSv(); },
      });
    }
    // 账号校验：实名 + 防沉迷（本地模拟，结果如实呈现）
    function login() {
      const nick = inp.value.trim();
      if (nick.length < 2) { Toast.err('呼号至少 2 个字符'); UIKit.sfx('error'); return; }
      if (!agree.get()) { Toast.warn('请先同意用户协议与隐私政策'); UIKit.sfx('error'); return; }
      Profile.patch({ nick, server, channel: ch });
      check.className = 'lg-check';
      check.innerHTML = '<div class="ck-spin"></div><span>账号校验中…</span>';
      setTimeout(() => {
        check.classList.add('ok');
        const adult = true;
        check.innerHTML = `<b>✓</b><span>账号 <b>${Profile.uid}</b> 校验通过 · 实名已认证 · ${adult ? '成年人（无时长限制）' : '未成年人（21:00-8:00 禁入）'}</span>`;
        UIKit.sfx('confirm');
        setTimeout(() => Router.go('lobby'), 520);
      }, 620);
    }
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
  }
  return { enter, SERVERS, CHANNELS, init(el) { root = el; } };
})();

// ---------- 2.5 对局加载中转页 ----------
const Loading = (() => {
  let root = null, raf = 0;
  function enter() { }
  // run(fn)：显示加载页 → 进度推进 → 执行真实开局 → 关闭
  function run(fn, label) {
    if (!root) return fn();
    root.classList.add('is-active');
    root.innerHTML = '';
    const w = UIKit.h('div', 'ld-wrap');
    const art = UIKit.h('div', 'ld-art');
    const cv = document.createElement('canvas'); cv.width = 760; cv.height = 300;
    art.append(cv, UIKit.h('div', 'ld-shade'), UIKit.h('div', 'ld-mode', `<b>${label || '生化追击'}</b><em>LOADING OPERATION</em>`));
    const tip = UIKit.h('div', 'ld-tip');
    tip.innerHTML = `<div class="g-bar g-bar--seg"><i></i></div>
      <div class="ld-steps"><span>建立房间</span><span>生成关卡</span><span>填充 AI</span><span>预热美术档案</span><span>就绪</span></div>
      <div class="ld-txt">${Boot.TIPS[Math.floor(Math.random() * Boot.TIPS.length)]}</div>`;
    const bar = tip.querySelector('.g-bar i');
    w.append(art, tip);
    root.appendChild(w);
    const t0 = performance.now();
    let phase = 0, ran = false;
    const STEPS = [18, 42, 66, 88, 100];
    function tick(now) {
      const e = now - t0;
      UIKit.paintGrid(cv.getContext('2d'), 760, 300, { seed: 31 + phase, tintA: 'rgba(33,214,139,.4)', tintB: 'rgba(6,20,30,.2)' });
      bar.style.width = Math.min(100, STEPS[phase]) * Math.min(1, (e - phase * 210) / 200) + '%';
      if (e > phase * 210 + 200) {
        phase++;
        if (phase === 3 && !ran) { ran = true; try { fn(); } catch (err) { console.error('[Loading] 开局失败', err); } }
      }
      if (phase >= STEPS.length) {
        cancelAnimationFrame(raf);
        setTimeout(() => { root.classList.remove('is-active'); root.innerHTML = ''; }, 180);
        return;
      }
      raf = requestAnimationFrame(tick);
    }
    // 若加载页自身要执行的 fn 抛错，兜底直接跑
    setTimeout(() => { if (!ran) { ran = true; try { fn(); } catch (err) { console.error(err); } } }, 1400);
    raf = requestAnimationFrame(tick);
  }
  return { enter, init(el) { root = el; }, run };
})();

// ---------- 开局统一入口（接管 game.js 的原生按钮） ----------
const Launcher = (() => {
  const MODE_LABEL = { escape: '逃亡模式', arena: '竞技模式', siege: '战术攻防', villa: '别墅突袭' };
  function currentMode() { return UIKit.rawRadioGet('mode') || 'escape'; }
  function launch() {
    const mode = currentMode();
    Profile.patch({ matches: (Profile.data.matches || 0) + 1 });
    // 体力消耗：无体力时提示，不阻断（本地单机不做真门槛，如实说明）
    if ((Profile.data.stamina || 0) <= 0) Toast.warn('体力不足，本局收益将减半');
    else Profile.patch({ stamina: Math.max(0, Profile.data.stamina - 1) });
    Loading.run(() => { try { startGame(); } catch (e) { console.error(e); Toast.err('开局失败：' + e.message); } }, MODE_LABEL[mode] || '生化追击');
  }
  function training() {
    const kind = UIKit.rawRadioGet('training') || 'range';
    const zt = UIKit.rawRadioGet('trainingZtype') || 'normal';
    const w = UIKit.rawSelectGet('trainingWeapon') || 'm4a1';
    Loading.run(() => { try { startTraining(kind, zt, w); } catch (e) { console.error(e); } }, kind === 'skill' ? '僵尸技能测试' : '枪械靶场');
  }
  function again() {
    Overlay.confirm({
      title: '再来一局', text: '将按当前大厅配置重新建立房间。', okText: '开始', cancelText: '返回大厅',
      onOk: launch, onCancel: () => { UI.showMenu(); Router.go('lobby'); },
    });
  }
  // 卸掉 game.js 在原生按钮上注册的监听（克隆替换），改由游戏化按钮驱动
  function neutralize(id) {
    const n = document.getElementById(id);
    if (!n) return null;
    const c = n.cloneNode(true);
    n.parentNode && n.parentNode.replaceChild(c, n);
    return c;
  }
  function init() {
    neutralize('startBtn'); neutralize('againBtn'); neutralize('trainingStartBtn');
    const ab = document.getElementById('againBtn');
    if (ab) ab.addEventListener('click', again);
    const tb = document.getElementById('trainingStartBtn');
    if (tb) tb.addEventListener('click', training);
  }
  return { launch, training, again, init };
})();

// ---------- 2.2 大厅主界面子系统 ----------
const Lobby = (() => {
  const MODES = [
    { v: 'escape', name: '逃亡模式', desc: '生化追逃 · 30 人房间推进撤离', icon: '⌛', tag: '经典', kind: 'neon',
      bg: 'linear-gradient(120deg,#0d3a2c,#04141a)', tip: '<b>逃亡模式</b>开局全员人类，10 秒后随机 4 人变异为母体；人类踩线推进、守倒计时、越前线，逃到终点撤离获胜。' },
    { v: 'arena', name: '竞技模式', desc: '红蓝对枪 · 战火英雄式回合', icon: '⚔', tag: 'PVP', kind: 'amber',
      bg: 'linear-gradient(120deg,#3a1a0d,#140806)', tip: '<b>竞技模式</b>两队实时对枪，先达成分数者胜，无感染机制。' },
    { v: 'siege', name: '战术攻防', desc: '彩虹六号式攻守回合 · 干员技能', icon: '⌖', tag: '回合', kind: 'virus',
      bg: 'linear-gradient(120deg,#1e0d3a,#0a0616)', tip: '<b>战术攻防</b>攻方安装爆破弹、守方拆除；准备阶段守方可放绊线雷与加固墙体。' },
    { v: 'villa', name: '别墅突袭', desc: '四层室内地图 · 包点不在一层', icon: '⌂', tag: '新图', kind: 'ice',
      bg: 'linear-gradient(120deg,#0d2a3a,#06121a)', tip: '<b>别墅突袭</b>沿用攻防回合机制，地图换为四层别墅室内。' },
    // 疾驰列车借的是**逃亡回合**那一套（踩线→守倒计时→越前线），所以卡片不显示攻防的
    // 准备阶段面板（selectMode 里 siegeBox 只对 siege/villa 打开）。
    { v: 'train', name: '疾驰列车', desc: '60~72 节程序化编组 · 护送至机车', icon: '⛟', tag: '新图', kind: 'amber',
      bg: 'linear-gradient(120deg,#2a1a0d,#0d0a14)',
      tip: '<b>疾驰列车</b>开局在车尾倒数第二节，往后是尸潮死路、往前是机车驾驶室；'
        + '沿途 7 个检查点各要守住一段写进关卡数据的秒数，守满才开锁推进。'
        + '车厢连接处的门只挡幽灵，人类随手穿过、也可以按 E 关上去拖慢追兵。' },
    { v: 'ddt', name: '弹弹堂', desc: '抛物线炮击 · 活动入口', icon: '◍', tag: '未开放', kind: '',
      bg: 'linear-gradient(120deg,#2a0d2a,#0d0a1a)', tip: '<b>弹弹堂入口</b>为联动活动预留位，当前版本未开放。' },
  ];
  const BANNERS = [
    { id: 'event', theme: 'bio', kicker: 'SEASON 07', title: '生化狂潮 · 第七赛季', sub: '登录送「幽蓝猎手」皮肤 · 赛季通行证经验 ×2', left: '剩余 12 天 06:31' },
    { id: 'siege', theme: 'siege', kicker: 'NEW MODE', title: '战术攻防 · 干员重做', sub: '侦察兵标记机制调整，新增绊线雷配额可视化', left: '查看更新' },
    { id: 'villa', theme: 'villa', kicker: 'NEW MAP', title: '别墅突袭 · 四层室内', sub: '36 扇可穿行窗洞 / 6 个包点 / 垂直攻防', left: '前往体验' },
    { id: 'hero', theme: 'hero', kicker: 'FEATURE', title: '英雄形态 · 全武器档案', sub: '47 把程序化像素武器与英雄专属形态上线', left: '了解详情' },
  ];
  let root, els = {};
  let bi = 0, btimer = 0;

  function build(page) {
    root = page.el;
    root.innerHTML = '';
    const shell = UIKit.h('div', 'g-shell');

    // ---- 顶部资源栏 ----
    const top = UIKit.h('header', 'g-top'); top.id = 'lbTopRes';
    const ava = UIKit.h('div', 'g-ava');
    const face = UIKit.h('div', 'av-face');
    const fc = document.createElement('canvas'); fc.width = 40; fc.height = 52; face.appendChild(fc);
    const lv = UIKit.h('span', 'av-lv', '');
    face.appendChild(lv);
    const info = UIKit.h('div', 'av-info');
    info.innerHTML = `<div class="av-name"><span class="nk"></span><s class="rk"></s></div>
      <div class="g-bar g-bar--thin g-bar--ice"><i></i></div><div class="av-exp"></div>`;
    ava.append(face, info);
    const expBar = info.querySelector('.g-bar i'), expTxt = info.querySelector('.av-exp');

    const res = UIKit.h('div', 'row');
    function resItem(kind, icon, label) {
      const n = UIKit.h('div', 'g-res g-res--' + kind);
      n.innerHTML = `<i>${icon}</i><b>0</b>` + (kind === 'stam' ? '<div class="g-bar"><i></i></div>' : '<span class="rs-plus">+</span>');
      n.title = label;
      UIKit.tooltipize(n, label, label);
      return n;
    }
    const rGold = resItem('gold', '◈', '金币 · 用于解锁背包槽位与仓库消耗'),
      rDiam = resItem('diam', '◆', '钻石 · 稀有武器与皮肤货币'),
      rStam = resItem('stam', '⚡', '体力 · 每局消耗 1 点，随时间恢复');
    res.append(rGold, rDiam, rStam);
    [rGold, rDiam].forEach(n => n.querySelector('.rs-plus').addEventListener('click', () => {
      Overlay.alert({ title: '本地版本无内购', alert: false, text: '当前为单机网页版本，商店与支付未接入。金币与钻石会通过结算奖励自动发放。', okText: '知道了' });
    }));

    const icons = UIKit.h('div', 'row');
    const ibMail = UIKit.iconBtn('▣', { tip: '<b>邮件</b>系统尚未接入本地版本', onClick: () => Toast.info('暂无新邮件') });
    const ibBag = UIKit.iconBtn('⛁', { tip: '打开仓库', onClick: () => Router.go('warehouse') });
    const ibSet = UIKit.iconBtn('⚙', { tip: '打开设置（画质 / 音频 / 操控 / 准星）', onClick: () => Router.go('settings') });
    ibBag.dataset.reddot = 'nav.warehouse';
    icons.append(ibMail, ibBag, ibSet);

    top.append(UIKit.h('div', 'tp-brand', '<b>生化追击</b><em>HORIZONTAL CLIENT</em>'),
      ava, UIKit.h('div', 'tp-spacer'), res, UIKit.h('div', 'g-nav-sep'), icons);
    shell.appendChild(top);

    // ---- 主体三栏 ----
    const body = UIKit.h('div', 'g-body');
    const grid = UIKit.h('div', 'lb-grid');

    // 左：模式选择 Tab
    const left = UIKit.h('div', 'lb-col');
    left.appendChild(UIKit.sect('作战模式', { icon: '' }).head);
    const modes = UIKit.h('div', 'lb-modes'); modes.id = 'lbModes';
    els.modeCards = {};
    for (const m of MODES) {
      const c = UIKit.modeCard({
        name: m.name, desc: m.desc, icon: m.icon, bg: m.bg, tag: m.tag, tagKind: m.kind, tip: m.tip, value: m.v,
        onClick: v => selectMode(v),
      });
      c.dataset.reddot = m.v === 'siege' ? 'mode.siege' : '';
      if (m.v === 'ddt') { c.dataset.reddot = 'nav.ddt'; c.classList.add('g-card--locked'); }
      modes.appendChild(c); els.modeCards[m.v] = c;
    }
    left.appendChild(modes);
    const castleExplore = UIKit.h('a', 'g-btn', '古堡探索');
    castleExplore.href = 'index.html?castleWalk=1';
    castleExplore.style.cssText = 'display:block;text-align:center;margin-top:10px;padding:10px';
    castleExplore.title = '探索固定古堡地图；生化回合尚未开放';
    left.appendChild(castleExplore);
    // 房间人数 + 开关（单人面板的原生控件代理）
    const opt = UIKit.h('div', '');
    opt.appendChild(UIKit.sect('房间设置', { icon: '' }).head);
    const roomRow = UIKit.h('div', 'row wrap');
    roomRow.appendChild(UIKit.h('span', 'cap nowrap', '人数'));
    roomRow.appendChild(UIKit.bindRadioGroup('room', [8, 16, 24, 30].map(n => ({ v: String(n), l: n + ' 人' }))));
    opt.appendChild(roomRow);
    const swCustom = UIKit.h('div', 'row'); swCustom.style.marginTop = '8px';
    swCustom.append(
      UIKit.toggle({ on: UIKit.rawCheckGet('useCustomMap'), onChange: v => UIKit.rawCheck('useCustomMap', v) }),
      UIKit.h('span', 'cap', '使用自定义地图（编辑器）'));
    opt.appendChild(swCustom);
    const swBp = UIKit.h('div', 'row'); swBp.style.marginTop = '8px';
    swBp.append(
      UIKit.toggle({ on: UIKit.rawCheckGet('backpackItem'), onChange: v => UIKit.rawCheck('backpackItem', v) }),
      UIKit.h('span', 'cap', '携带生化追击背包道具'));
    opt.appendChild(swBp);
    const siegeBox = UIKit.h('div', ''); siegeBox.style.marginTop = '10px';
    siegeBox.appendChild(UIKit.sect('攻防干员', { icon: '☣' }).head);
    const atkRow = UIKit.h('div', 'col'); atkRow.style.gap = '6px';
    atkRow.appendChild(UIKit.h('span', 'cap', '攻方')); atkRow.appendChild(UIKit.bindSelect('siegeAtkRole'));
    const defRow = UIKit.h('div', 'col'); defRow.style.cssText = 'gap:6px;margin-top:8px';
    defRow.appendChild(UIKit.h('span', 'cap', '守方')); defRow.appendChild(UIKit.bindSelect('siegeDefRole'));
    siegeBox.append(atkRow, defRow);
    els.siegeBox = siegeBox;
    opt.appendChild(siegeBox);
    left.appendChild(opt);

    // 中：角色展示 + Banner
    const center = UIKit.h('div', 'lb-center');
    const stage = UIKit.h('div', 'lb-stage');
    const heroWrap = UIKit.h('div', 'lb-hero');
    const heroCv = document.createElement('canvas'); heroCv.width = 190; heroCv.height = 274;
    heroWrap.appendChild(heroCv);
    const floor = UIKit.h('div', 'lb-floor');
    const radar = UIKit.h('div', 'lb-radar');
    const nm = UIKit.h('div', 'lb-name', '<b></b><em></em>');
    stage.append(floor, heroWrap, nm, radar);
    center.appendChild(stage);
    els.heroCv = heroCv; els.heroName = nm.querySelector('b'); els.heroSub = nm.querySelector('em');

    const bn = UIKit.h('div', ''); bn.id = 'lbBanner';
    const bnHost = UIKit.h('div', '');
    const dots = UIKit.h('div', 'g-banner-dots');
    bn.append(bnHost, dots);
    center.appendChild(bn);
    els.bnHost = bnHost; els.bnDots = dots;

    // 右：出战背包 + 武器快速预览
    const right = UIKit.h('div', 'lb-col');
    const slotHead = UIKit.sect('出战装备', { icon: '⛃', note: '开局背包' });
    const slotSel = UIKit.bindSelect('startBackpack', () => renderSlots());
    slotSel.style.marginBottom = '8px';
    const slotRow = UIKit.h('div', 'lb-slotrow'); slotRow.id = 'lbSlotRow';
    right.append(slotHead.head, slotSel, slotRow);
    els.slotRow = slotRow;

    const wpnPanel = UIKit.h('div', 'lb-wpn'); wpnPanel.id = 'lbWpnPanel';
    wpnPanel.appendChild(UIKit.sect('武器快速预览', { icon: '' }).head);
    const prev = UIKit.h('div', 'lb-wpn-prev');
    const pcv = document.createElement('canvas'); pcv.width = 320; pcv.height = 116;
    prev.appendChild(pcv); els.prevCv = pcv;
    const pName = UIKit.h('div', 'row'); pName.style.cssText = 'justify-content:space-between;margin-top:6px';
    pName.innerHTML = '<b class="lime" style="font-size:15px;letter-spacing:1px"></b><span class="cap"></span>';
    els.pName = pName.querySelector('b'); els.pCat = pName.querySelector('span');
    const pStats = UIKit.h('div', 'col'); pStats.style.gap = '4px'; pStats.style.marginTop = '8px'; els.pStats = pStats;
    const pFx = UIKit.h('div', 'g-hint'); pFx.style.marginTop = '6px'; els.pFx = pFx;
    wpnPanel.append(prev, pName, pStats, pFx);
    right.appendChild(wpnPanel);

    grid.append(left, center, right);
    body.appendChild(grid);
    shell.appendChild(body);

    // ---- 底部导航 ----
    const nav = UIKit.h('nav', 'g-nav'); nav.id = 'lbNav';
    const navItems = [
      { id: 'lobby', icon: '⌂', label: '大厅' }, { id: 'warehouse', icon: '⛃', label: '仓库', rd: 'nav.warehouse' },
      { id: 'training', icon: '⌖', label: '训练营' }, { id: 'online', icon: '⛶', label: '多人' },
      { id: 'settings', icon: '⚙', label: '设置', rd: 'settings.crosshair' },
    ];
    els.navBtns = {};
    for (const it of navItems) {
      const b = UIKit.h('button', 'g-nav-item' + (it.id === 'lobby' ? ' is-on' : ''));
      b.type = 'button';
      b.innerHTML = `<i>${it.icon}</i><span>${it.label}</span>`;
      if (it.rd) { b.dataset.reddot = it.rd; }
      b.addEventListener('click', () => { UIKit.sfx('click'); Router.go(it.id); });
      nav.appendChild(b); els.navBtns[it.id] = b;
    }
    nav.appendChild(UIKit.h('div', 'nv-spacer'));
    const startBtn = UIKit.cta({ label: '开始游戏', onClick: () => Launcher.launch() });
    startBtn.id = 'lbStartBtn';
    const bpBtn = UIKit.btn({ label: '仓库', kind: 'dark', icon: '⛃', onClick: () => Router.go('warehouse') });
    nav.append(bpBtn, startBtn);
    shell.appendChild(nav);

    root.appendChild(shell);

    // 顶栏引用回填
    els.avaFace = fc; els.avaLv = lv; els.nick = info.querySelector('.nk'); els.rank = info.querySelector('.rk');
    els.expBar = expBar; els.expTxt = expTxt;
    els.rGold = rGold.querySelector('b'); els.rDiam = rDiam.querySelector('b');
    els.rStam = rStam.querySelector('b'); els.rStamBar = rStam.querySelector('.g-bar i');
    els.nav = nav;
  }

  let mode = 'escape';
  function selectMode(v) {
    if (v === 'ddt') { Router.go('ddt'); return; }
    mode = v;
    UIKit.rawRadio('mode', v);
    for (const [k, c] of Object.entries(els.modeCards)) c.setSelected(k === v);
    if (els.siegeBox) els.siegeBox.style.display = (v === 'siege' || v === 'villa') ? '' : 'none';
    Notify.seen('mode.' + v); Notify.refreshAll(root);
    renderHero(); renderPreview();
  }
  function renderTop() {
    const p = Profile.data;
    els.nick.textContent = p.nick;
    els.rank.textContent = p.rank || '';
    els.avaLv.textContent = 'LV' + p.level;
    const need = 1000 + p.level * 420;
    els.expBar.style.width = Math.min(100, p.exp / need * 100) + '%';
    els.expTxt.textContent = `EXP ${p.exp} / ${need}`;
    els.rGold.textContent = fmt(p.gold); els.rDiam.textContent = fmt(p.diam);
    els.rStam.textContent = `${p.stamina}/${p.staminaMax}`;
    els.rStamBar.style.width = (p.stamina / p.staminaMax * 100) + '%';
    UIKit.drawRole(els.avaFace, currentSkin(), { scale: .68 });
  }
  const fmt = n => n >= 10000 ? (n / 10000).toFixed(1) + '万' : String(n);
  function currentSkin() {
    try { return (typeof OperatorSkins !== 'undefined') ? OperatorSkins.normalize(UIKit.rawSelectGet('operatorSkin')) : null; } catch (e) { return null; }
  }
  function renderHero() {
    const skin = currentSkin();
    const cv = els.heroCv;
    cv.width = 190; cv.height = 274;
    UIKit.drawRole(cv, skin, { scale: 3.6 });
    let name = '特战队员', sub = 'SURVIVOR';
    try {
      if (typeof OperatorSkins !== 'undefined' && skin && OperatorSkins.info[skin]) {
        name = OperatorSkins.info[skin].name; sub = 'OPERATOR · ' + (name);
      }
    } catch (e) { }
    els.heroName.textContent = name;
    els.heroSub.textContent = MODES.find(m => m.v === mode) ? MODES.find(m => m.v === mode).name + ' · ' + (UIKit.rawRadioGet('room') || '30') + ' 人房' : '';
  }
  function backpackKeys() {
    try {
      const i = parseInt(UIKit.rawSelectGet('startBackpack') || '0', 10);
      const bp = (typeof BACKPACKS !== 'undefined') ? BACKPACKS[i] : null;
      return bp ? bp.loadout : {};
    } catch (e) { return {}; }
  }
  function renderSlots() {
    const row = els.slotRow; UIKit.clear(row);
    const lo = backpackKeys();
    const SLOT_ICON = { primary: 'Ⅰ', secondary: 'Ⅱ', melee: 'Ⅲ', throw: 'Ⅳ' };
    const SLOT_NAME = { primary: '主武器', secondary: '副武器', melee: '近战', throw: '投掷' };
    for (const gid of (typeof WEAPON_GROUP_ORDER !== 'undefined' ? WEAPON_GROUP_ORDER : ['primary', 'secondary', 'melee', 'throw'])) {
      const k = lo[gid]; const w = (typeof WEAPONS !== 'undefined' && k) ? WEAPONS[k] : null;
      const f = UIKit.frame('lb-slot' + (w ? '' : ' is-empty'), null);
      f.style.setProperty('--cut', '7px');
      f.body.innerHTML = `<i>${SLOT_ICON[gid] || '◆'}</i><span>${w ? w.name : '未配置'}</span>`;
      UIKit.tooltipize(f, `<b>${SLOT_NAME[gid] || gid}</b>${w ? '点击到仓库更换武器' : '尚未配置，点击打开仓库'}`, SLOT_NAME[gid] || gid);
      f.addEventListener('click', () => Router.go('warehouse'));
      row.appendChild(f);
    }
  }
  function renderPreview() {
    const lo = backpackKeys();
    const key = lo.primary || Object.values(lo)[0];
    const w = (typeof WEAPONS !== 'undefined' && key) ? WEAPONS[key] : null;
    const cv = els.prevCv;
    UIKit.drawWeapon(cv, key, {});
    if (!w) { els.pName.textContent = '未配置武器'; els.pCat.textContent = ''; UIKit.clear(els.pStats); return; }
    els.pName.textContent = w.name;
    const gm = (typeof GROUP_META !== 'undefined') ? GROUP_META[w.g] : null;
    els.pCat.innerHTML = gm ? `<span style="color:${gm.color}">${gm.name}</span>` : w.g;
    UIKit.clear(els.pStats);
    try {
      const metrics = (typeof WH_METRICS !== 'undefined') ? WH_METRICS[w.grenade ? 'throw' : (w.melee ? 'melee' : 'gun')] : [['dmg', '伤害'], ['rpm', '射速'], ['acc', '精准']];
      const ranges = (typeof WH_RANGES !== 'undefined' && WH_RANGES[w.g]) || {};
      for (const [m, label] of metrics) {
        const v = (typeof whMetricVal !== 'undefined') ? whMetricVal(w, m) : 0;
        const r = ranges[m] || { min: 0, max: 1 };
        const ratio = r.max === r.min ? .5 : (v - r.min) / (r.max - r.min);
        els.pStats.appendChild(UIKit.stat({ label, ratio, text: String(Math.round(v * 10) / 10), kind: ratio > .66 ? '' : (ratio > .33 ? 'amber' : 'blood') }));
      }
    } catch (e) { }
    els.pFx.innerHTML = (w.fx && typeof FX_META !== 'undefined' && FX_META[w.fx])
      ? `<b style="color:${FX_META[w.fx].color}">特色 · ${FX_META[w.fx].name}</b>　${FX_META[w.fx].desc}`
      : '<span class="dim">无特色效果</span>';
  }
  function renderBanner() {
    const host = els.bnHost, dots = els.bnDots;
    clearInterval(btimer);
    function paint() {
      const b = BANNERS[bi % BANNERS.length];
      UIKit.clear(host);
      const f = UIKit.bannerCard({
        title: b.title, sub: b.sub, kicker: b.kicker, left: b.left, id: b.id,
        bg: 'transparent',
        onClick: id => {
          Notify.seen('banner.event'); Notify.refreshAll(root);
          Overlay.alert({
            title: b.title, alert: false, icon: '◈',
            html: `<div class="row" style="gap:14px;align-items:flex-start">${''}
              <div style="flex:1">${b.sub}<div class="g-div"></div>
              <div class="g-hint">活动说明：本客户端为单机网页版本，活动内容为<b>展示与引导</b>，奖励在结算里以金币/经验形式体现。</div></div></div>`,
            okText: '关闭',
          });
        },
      });
      const cv = document.createElement('canvas'); cv.width = 336; cv.height = 128;
      f.querySelector('.bn-art').appendChild(cv);
      cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
      UIKit.paintBanner(cv.getContext('2d'), 336, 128, b.theme);
      host.appendChild(f);
      UIKit.clear(dots);
      BANNERS.forEach((_, i) => {
        const d = UIKit.h('i', i === bi % BANNERS.length ? 'is-on' : '');
        d.addEventListener('click', () => { bi = i; paint(); });
        dots.appendChild(d);
      });
    }
    paint();
    btimer = setInterval(() => { bi++; paint(); }, 6500);
  }
  function enter() {
    renderTop(); selectMode(UIKit.rawRadioGet('mode') || 'escape'); renderSlots(); renderPreview(); renderBanner();
    for (const [id, b] of Object.entries(els.navBtns)) b.classList.toggle('is-on', id === 'lobby');
    if (!localStorage.getItem('zombie_guide_done')) setTimeout(() => Guide.start(0), 900);
  }
  function leave() { clearInterval(btimer); if (Guide.active) Guide.stop(false); }
  return { build, enter, leave, renderTop, renderSlots, renderPreview, MODES, BANNERS, get els() { return els; } };
})();

// ---------- 2.6 仓库 & 背包 UI（在原生槽位编辑器之上补：武器库/筛选/近战/角色/道具页签） ----------
const Armory = (() => {
  let root, tab = 'gun', filter = 'all', search = '';
  const CATS = [
    { id: 'gun', l: '枪械', icon: '⌖' }, { id: 'melee', l: '近战武器', icon: '⚔' },
    { id: 'throw', l: '投掷物', icon: '◍' }, { id: 'role', l: '角色', icon: '☗' },
    { id: 'item', l: '弹药 / 道具', icon: '⛃' },
  ];
  const FILTERS = [
    { v: 'all', l: '全部' }, { v: 'assault', l: '突击' }, { v: 'smg', l: '冲锋' }, { v: 'sniper', l: '狙击' },
    { v: 'shotgun', l: '霰弹' }, { v: 'lmg', l: '机枪' }, { v: 'pistol', l: '手枪' },
    { v: 'melee', l: '近战' }, { v: 'throw', l: '投掷' }, { v: 'fx', l: '带特效' }, { v: 'equipped', l: '已装备' },
  ];
  function equipped() {
    const s = new Set();
    try { for (const bp of BACKPACKS) for (const k of Object.values(bp.loadout)) s.add(k); } catch (e) { }
    return s;
  }
  // 优先复用 index.html 原有容器（内联脚本靠 id 找它们），拿不到才新建
  function host(id, cls, tag) {
    let n = Contract.take(id, cls);
    if (!n) { n = document.createElement(tag || 'div'); n.id = id; if (cls) n.className = cls; }
    return n;
  }
  function build(page) {
    root = page.el;
    root.innerHTML = '';
    const shell = UIKit.h('div', 'g-shell');
    const body = UIKit.h('div', 'g-body');
    const head = UIKit.h('div', 'g-phead');
    head.innerHTML = '<b>仓 库</b><s></s>';
    head.appendChild(UIKit.btn({ label: '返回大厅', kind: 'dark', icon: '‹', onClick: () => Router.go('lobby') }));
    body.appendChild(head);
    shell.appendChild(body);

    const grid = UIKit.h('div', 'wh-grid');
    // 左：背包编组 + 原生槽位宿主（内联脚本按这些 id 渲染，优先复用而不是新建）
    const left = UIKit.h('div', 'wh-col');
    left.appendChild(UIKit.sect('背包编组', { icon: '⛁', note: '8 组' }).head);
    const bpList = host('whBackpackList', 'wh-bplist');
    left.appendChild(bpList);
    const acts = UIKit.h('div', 'row wrap'); acts.style.marginTop = '10px';
    acts.append(
      UIKit.btn({ label: '重命名', kind: 'dark', size: 'sm', onClick: () => whRename() }),
      UIKit.btn({ label: '设为开局', kind: 'ghost', size: 'sm', onClick: () => whSetStart() }),
      UIKit.btn({ label: '恢复默认', kind: 'dark', size: 'sm', onClick: () => whReset() }));
    left.appendChild(acts);
    left.appendChild(UIKit.h('div', 'g-hint', '开局背包 = 出生即装备的 1-8 号背包。保存后进入对局立即生效，局内补给点按 E / B 切换同样适用。')).style.marginTop = '10px';
    const status = host('whStatus', 'wh-status'); left.appendChild(status);

    // 中：页签 + 筛选 + 武器库网格 + 四槽编辑
    const mid = UIKit.h('div', 'wh-col');
    const tabs = UIKit.h('div', 'wh-tabs');
    for (const t of CATS) {
      const b = UIKit.h('button', 'wh-tab' + (t.id === tab ? ' is-on' : ''), `${t.icon} ${t.l}`);
      b.type = 'button';
      b.addEventListener('click', () => { tab = t.id; [...tabs.children].forEach(x => x.classList.remove('is-on')); b.classList.add('is-on'); renderMid(); UIKit.sfx('select'); });
      tabs.appendChild(b);
    }
    mid.appendChild(tabs);

    const loadBox = UIKit.h('div', '');
    loadBox.appendChild(UIKit.sect('当前背包四槽', { icon: '⛃' }).head);
    const slots = host('whSlots', 'wh-load');
    loadBox.appendChild(slots);
    const saveRow = UIKit.h('div', 'row'); saveRow.style.marginTop = '10px';
    saveRow.append(UIKit.btn({ label: '保存配置', icon: '✓', onClick: () => { whSave(); Toast.ok('背包配置已保存'); } }),
      UIKit.btn({ label: '武器对比', kind: 'ghost', icon: '⚖', onClick: () => { try { whOpenCompare('primary'); } catch (e) { } } }));
    loadBox.appendChild(saveRow);
    mid.appendChild(loadBox);

    const armoryBox = UIKit.h('div', 'col'); armoryBox.style.cssText = 'flex:1;min-height:0;gap:8px';
    armoryBox.appendChild(UIKit.sect('武器库 / 图鉴', { icon: '⛭', note: '点击卡片装备到对应槽位' }).head);
    const fbar = UIKit.h('div', 'row wrap');
    const si = UIKit.h('input', 'ui-dlg-input'); si.style.cssText = 'width:150px;flex:none;padding:4px 8px;font-size:12px';
    si.placeholder = '搜索武器名';
    si.addEventListener('input', () => { search = si.value.trim(); renderCards(); });
    const fsegs = UIKit.segs({
      options: FILTERS.map(f => ({ v: f.v, l: f.l })), value: filter,
      onChange: v => { filter = v; renderCards(); },
    });
    fsegs.style.flex = '1';
    fbar.append(si, fsegs);
    armoryBox.appendChild(fbar);
    const cards = UIKit.h('div', 'wh-cards'); cards.id = 'whArmory';
    armoryBox.appendChild(cards);
    mid.appendChild(armoryBox);
    els_cards = cards;

    // 右：武器详情预览
    const right = UIKit.h('div', 'wh-col');
    right.appendChild(UIKit.sect('武器详情', { icon: '⌖' }).head);
    const prevBox = UIKit.h('div', 'wh-detail-prev');
    const pcv = host('whPrevCanvas', null, 'canvas');
    prevBox.appendChild(pcv);
    right.appendChild(prevBox);
    const nameEl = host('whPrevName', 'lime'); nameEl.style.cssText = 'font-size:17px;font-weight:900;letter-spacing:1px';
    const catEl = host('whPrevCat', 'cap');
    const starsEl = host('whPrevStars', 'col'); starsEl.style.gap = '4px';
    const roleEl = host('whPrevRole', 'g-hint');
    const fxEl = host('whPrevFx', 'g-hint');
    const flagEl = host('whPrevFlags', 'wh-eqrow');
    const trajCv = host('whTrajCanvas', null, 'canvas');
    trajCv.style.cssText = 'width:100%;margin-top:6px;background:#061014;box-shadow:inset 0 0 0 1px #1d4450';
    right.append(nameEl, catEl, trajCv, starsEl, roleEl, fxEl, flagEl);
    // 近战 / 角色 / 道具页签的专属面板
    const extra = UIKit.h('div', ''); extra.id = 'whExtra'; right.appendChild(extra);
    els_extra = extra;

    grid.append(left, mid, right);
    body.appendChild(grid);
    root.appendChild(shell);
  }
  let els_cards, els_extra;

  function listFor(tab) {
    const keys = (typeof WEAPON_KEYS !== 'undefined') ? WEAPON_KEYS : [];
    let out = keys.filter(k => {
      const w = WEAPONS[k]; if (!w) return false;
      if (tab === 'gun') return !w.melee && !w.grenade;
      if (tab === 'melee') return !!w.melee;
      if (tab === 'throw') return !!w.grenade;
      return false;
    });
    if (tab === 'role' || tab === 'item') return [];
    if (filter !== 'all') {
      if (filter === 'fx') out = out.filter(k => WEAPONS[k].fx);
      else if (filter === 'equipped') { const eq = equipped(); out = out.filter(k => eq.has(k)); }
      else out = out.filter(k => WEAPONS[k].g === filter);
    }
    if (search) out = out.filter(k => WEAPONS[k].name.includes(search) || k.includes(search));
    return out;
  }
  function renderCards() {
    const host = els_cards; if (!host) return;
    UIKit.clear(host);
    if (tab === 'role') { renderRoleTab(); return; }
    if (tab === 'item') { renderItemTab(); return; }
    UIKit.clear(els_extra);
    const eq = equipped();
    const keys = listFor(tab);
    host.innerHTML = `<div class="cap" style="grid-column:1/-1">共 ${keys.length} 件 · 已装备 ${eq.size} 件</div>`;
    for (const k of keys) {
      const w = WEAPONS[k];
      const gm = (typeof GROUP_META !== 'undefined') ? GROUP_META[w.g] : null;
      const c = UIKit.weaponCard({
        key: k, name: w.name, on: eq.has(k),
        eq: eq.has(k) ? '装备中' : '',
        tip: `<b>${w.name}</b>${gm ? gm.name : w.g}<br>伤害 ${w.pellets > 1 ? w.dmg + '×' + w.pellets : w.dmg}${w.rpm ? ' · 射速 ' + w.rpm : ''}${w.mag ? ' · 弹匣 ' + w.mag : ''}<br><em>点击装备到 ${slotOfWeapon(k) || '对应'} 槽位</em>`,
        onClick: key => equip(key),
      });
      UIKit.drawWeapon(c.canvas, k, {});
      c.$meta.innerHTML = (gm ? `<span class="wp-cat" style="color:${gm.color}">${gm.name}</span>` : '')
        + (w.fx && FX_META[w.fx] ? `<span class="g-chip" style="color:${FX_META[w.fx].color};box-shadow:inset 0 0 0 1px ${FX_META[w.fx].color}55">${FX_META[w.fx].name}</span>` : '');
      host.appendChild(c);
    }
  }
  function equip(key) {
    const gid = (typeof slotOfWeapon !== 'undefined') ? slotOfWeapon(key) : null;
    if (!gid) { Toast.warn('该武器不进入背包槽（英雄枪 / 地面拾取限定）'); return; }
    const sel = document.querySelector(`#whSlots .wh-select[data-gid="${gid}"]`);
    if (!sel) { Toast.err('未找到槽位选择器'); return; }
    sel.value = key; sel.dispatchEvent(new Event('change', { bubbles: true }));
    window.__uiDirtyFlag && window.__uiDirtyFlag();
    const nm = (typeof SLOT_META !== 'undefined' && SLOT_META[gid]) ? SLOT_META[gid].name : gid;
    Toast.ok(`${WEAPONS[key].name} 已放入「${nm}」槽（记得保存配置）`);
    renderCards();
  }
  // 近战武器面板：挥砍轨迹 + 范围可视化
  function renderRoleTab() {
    UIKit.clear(els_cards);
    els_cards.style.gridTemplateColumns = 'repeat(auto-fill,minmax(128px,1fr))';
    let ids = [];
    try { ids = OperatorSkins.ids.slice(); } catch (e) { }
    els_cards.innerHTML = `<div class="cap" style="grid-column:1/-1">特战队员外观 · ${ids.length} 套 · 点击切换出战角色</div>`;
    for (const id of ids) {
      const info = OperatorSkins.info[id];
      const c = UIKit.roleCard({
        id, name: info.name, skill: info.desc || '', on: currentSkinId() === id,
        onClick: v => {
          UIKit.rawSelect('operatorSkin', v); renderCards(); renderRoleTabExtra(v);
          Toast.ok('出战角色已切换：' + info.name);
        },
      });
      UIKit.drawRole(c.canvas, id, { scale: 1.15 });
      els_cards.appendChild(c);
    }
    renderRoleTabExtra(currentSkinId());
  }
  function currentSkinId() { try { return OperatorSkins.normalize(UIKit.rawSelectGet('operatorSkin')); } catch (e) { return null; } }
  function renderRoleTabExtra(id) {
    UIKit.clear(els_extra);
    let info = null; try { info = OperatorSkins.info[id]; } catch (e) { }
    if (!info) return;
    const box = UIKit.frame('', null); box.style.setProperty('--cut', '9px');
    box.body.innerHTML = `<div class="cap" style="letter-spacing:2px;color:#35f0a0">角色面板</div>
      <div class="lime" style="font-size:15px;font-weight:900;margin:4px 0">${info.name}</div>
      <div class="g-hint">${UIKit.esc(info.desc || '标准特战队员，无专属技能。')}</div>`;
    els_extra.appendChild(box);
  }
  // 弹弹堂弹药 / 道具预览（脑图 2.6 末项：入口未开放时如实呈现清单）
  function renderItemTab() {
    UIKit.clear(els_cards);
    const items = [
      { n: '强化弹', d: '伤害 +12%，穿透 1 层', i: '◈', c: '#ffb020' },
      { n: '空爆弹', d: '设定距离空中引爆', i: '◉', c: '#ff6b6b' },
      { n: '照明弹', d: '夜间区域照亮 8 秒', i: '☀', c: '#ffe98a' },
      { n: '烟雾覆盖剂', d: '扩大烟雾半径 25%', i: '☁', c: '#8fb8b0' },
      { n: '应急治疗包', d: '3 秒内回复 40 HP', i: '✚', c: '#35f0a0' },
      { n: '角度修正器', d: '弹弹堂式抛物线微调', i: '◍', c: '#a45cff', locked: true },
    ];
    els_cards.innerHTML = `<div class="cap" style="grid-column:1/-1">道具预览 · 消耗品与弹药附件（弹弹堂联动道具未开放）</div>`;
    for (const it of items) {
      const f = UIKit.frame('', null); f.style.setProperty('--cut', '8px');
      f.body.innerHTML = `<div class="row" style="gap:8px"><span style="font-size:20px;color:${it.c}">${it.i}</span>
        <div style="flex:1"><div style="font-size:13px;font-weight:700">${it.n}</div>
        <div class="cap">${it.d}</div></div>${it.locked ? '<span class="g-chip g-chip--blood">未开放</span>' : '<span class="g-chip g-chip--on">可用</span>'}</div>`;
      f.style.minHeight = '56px';
      els_cards.appendChild(f);
    }
    UIKit.clear(els_extra);
    const box = UIKit.frame('', null); box.style.setProperty('--cut', '9px');
    box.body.innerHTML = `<div class="cap" style="letter-spacing:2px;color:#35f0a0">说明</div>
      <div class="g-hint" style="margin-top:4px">道具清单为<b>展示层</b>：当前版本没有掉落、购买与消耗经济，因此这里只呈现名称与效果文案，不提供实际加成。</div>`;
    els_extra.appendChild(box);
  }
  function renderMid() { renderCards(); }
  function enter() {
    try { whRenderList(); whRenderSlots(); whSetStatus(''); } catch (e) { console.warn('[Armory] 原生仓库渲染', e); }
    renderCards();
    if (tab === 'gun' || tab === 'melee' || tab === 'throw') {
      const k = (backpackPrimary()) || 'm4a1';
      try { whDrawPreview(k); } catch (e) { }
    }
  }
  function backpackPrimary() {
    try { const i = parseInt(UIKit.rawSelectGet('startBackpack') || '0', 10); return BACKPACKS[i].loadout.primary; } catch (e) { return null; }
  }
  return { build, enter, renderCards, CATS };
})();

// ---------- 训练营 / 多人 页面（把原生控件搬进游戏化外壳） ----------
const TrainingUI = (() => {
  let root;
  function build(page) {
    root = page.el; root.innerHTML = '';
    const shell = UIKit.h('div', 'g-shell');
    const body = UIKit.h('div', 'g-body');
    const head = UIKit.h('div', 'g-phead', '<b>训 练 营</b><s></s>');
    head.appendChild(UIKit.btn({ label: '返回大厅', kind: 'dark', icon: '‹', onClick: () => Router.go('lobby') }));
    body.appendChild(head);
    const grid = UIKit.h('div', 'tr-grid');

    const left = UIKit.h('div', 'wh-col');
    left.appendChild(UIKit.sect('训练场景', { icon: '⌖' }).head);
    const scene = UIKit.bindRadioGroup('training', [{ v: 'range', l: '枪械靶场' }, { v: 'skill', l: '僵尸技能测试' }], () => sync());
    left.appendChild(scene);
    const ztBox = UIKit.h('div', ''); ztBox.style.marginTop = '14px';
    ztBox.appendChild(UIKit.sect('变身僵尸', { icon: '☣' }).head);
    ztBox.appendChild(UIKit.bindRadioGroup('trainingZtype', [
      { v: 'normal', l: '小僵尸' }, { v: 'sprinter', l: '疾行' }, { v: 'boomer', l: '自爆' }, { v: 'mother', l: '母体' }]));
    left.appendChild(ztBox);
    const tip = UIKit.h('div', 'g-hint');
    tip.innerHTML = '<b>枪械靶场</b>：选好测试武器后入场即手持，射击无敌木桩观察扩散 / 曳光 / 枪口火光 / 音色差异；入场后屏幕顶部可切换木桩行为（站立 / 左移 / 右移 / 跳跃）。<div class="g-div"></div><b>僵尸技能测试</b>：变身所选僵尸攻击人类沙包，E / 右键放技能，Q 放 Buff。';
    left.appendChild(tip);

    const right = UIKit.h('div', 'wh-col');
    right.appendChild(UIKit.sect('测试武器', { icon: '⛃', note: '类别 → 具体枪械' }).head);
    const catSel = UIKit.h('div', ''); const wSel = UIKit.h('div', '');
    right.append(catSel, wSel);
    const start = UIKit.cta({ label: '开 始 训 练', sub: '进入靶场', onClick: () => Launcher.training() });
    start.style.marginTop = 'auto';
    right.appendChild(start);
    grid.append(left, right);
    body.appendChild(grid);
    shell.appendChild(body);
    root.appendChild(shell);
    // 把原生 select 的选项搬进游戏化下拉
    setTimeout(() => {
      catSel.appendChild(UIKit.bindSelect('trainingWeaponCat', () => setTimeout(rebuild, 30)));
      rebuild();
    }, 0);
    function rebuild() {
      UIKit.clear(wSel);
      wSel.appendChild(UIKit.h('div', 'cap', '具体武器'));
      const d = UIKit.bindSelect('trainingWeapon');
      d.style.marginTop = '6px';
      wSel.appendChild(d);
    }
    function sync() { ztBox.style.display = (UIKit.rawRadioGet('training') === 'skill') ? '' : 'none'; }
    sync();
  }
  return { build };
})();

const OnlineUI = (() => {
  function build(page) {
    const root = page.el; root.innerHTML = '';
    const shell = UIKit.h('div', 'g-shell');
    const body = UIKit.h('div', 'g-body');
    const head = UIKit.h('div', 'g-phead', '<b>联 网 多 人</b><s></s>');
    head.appendChild(UIKit.btn({ label: '返回大厅', kind: 'dark', icon: '‹', onClick: () => Router.go('lobby') }));
    body.appendChild(head);
    const grid = UIKit.h('div', 'mp-grid');

    const left = UIKit.h('div', 'wh-col');
    left.appendChild(UIKit.sect('连接设置', { icon: '⛶' }).head);
    function field(label, id, ph) {
      const w = UIKit.h('div', 'lg-field');
      w.appendChild(UIKit.h('s', '', label));
      const inp = document.getElementById(id);
      if (inp) { inp.classList.add('ui-native'); inp.style.cssText = 'width:100%;padding:8px 12px;background:#061014;border:0;outline:none;box-shadow:inset 0 0 0 1px #1d4450;color:#dff7ee;font-family:var(--f-px);font-size:14px'; w.appendChild(inp); }
      return w;
    }
    left.append(field('服务器地址', 'mpServer'), field('房间名', 'mpRoom'));
    const sizeRow = UIKit.h('div', 'row wrap');
    sizeRow.appendChild(UIKit.h('span', 'cap nowrap', '房间人数'));
    sizeRow.appendChild(UIKit.bindRadioGroup('mpSize', [8, 16, 24, 30].map(n => ({ v: String(n), l: n + ' 人' }))));
    left.appendChild(sizeRow);
    const acts = UIKit.h('div', 'row'); acts.style.marginTop = '14px';
    acts.append(
      UIKit.btn({ label: '创建房间', icon: '＋', onClick: () => document.getElementById('mpHostBtn').click() }),
      UIKit.btn({ label: '加入房间', kind: 'ghost', icon: '⇥', onClick: () => document.getElementById('mpJoinBtn').click() }));
    left.appendChild(acts);
    const raw = UIKit.h('div', 'row'); raw.style.marginTop = '10px';
    raw.append(
      UIKit.btn({ label: '开始对局', kind: 'amber', onClick: () => { const b = document.getElementById('mpStartBtn'); if (b) b.click(); else Toast.warn('等待创建房间后再开始'); } }),
      UIKit.btn({ label: '离开房间', kind: 'dark', onClick: () => { const b = document.getElementById('mpLeaveBtn'); if (b) b.click(); } }));
    left.appendChild(raw);
    left.appendChild(UIKit.h('div', 'g-hint', '多人需先运行 <b>node server.js</b> 再打开本页；主持者运行完整战局，其余玩家实时同步。')).style.marginTop = '12px';

    const right = UIKit.h('div', 'wh-col');
    right.appendChild(UIKit.sect('房间状态', { icon: '⛭' }).head);
    const st = document.getElementById('mpStatus');
    if (st) { st.style.cssText = 'font-size:13px;color:#ffb020;letter-spacing:1px;min-height:20px'; right.appendChild(st); }
    right.appendChild(UIKit.sect('房间成员', { icon: '☗' }).head);
    const pl = document.getElementById('mpPlayers');
    if (pl) { pl.style.cssText = 'font-size:12px;color:#8fb8b0;line-height:2'; right.appendChild(pl); }
    grid.append(left, right);
    body.appendChild(grid);
    shell.appendChild(body);
    root.appendChild(shell);
    // 昵称字段挪进左栏顶部
    const nf = field('呼号', 'mpName');
    left.insertBefore(nf, left.children[1]);
  }
  return { build };
})();

// ---------- 2.7 设置面板（分组导航） + 准星 + 灵敏度 ----------
const SettingsUI = (() => {
  let root, nav, bodyEl, tab = '画面';
  const GROUPS = ['画面', '音频', '开镜', '操控', '准星', '辅助', '武器·弹道', '游戏', '数值·人类', '数值·僵尸', '投掷', '训练营'];
  function build(page) {
    root = page.el; root.innerHTML = '';
    const shell = UIKit.h('div', 'g-shell');
    const body = UIKit.h('div', 'g-body');
    const head = UIKit.h('div', 'g-phead', '<b>设 置</b><s></s>');
    head.appendChild(UIKit.btn({ label: '返回大厅', kind: 'dark', icon: '‹', onClick: () => Router.go('lobby') }));
    body.appendChild(head);
    const grid = UIKit.h('div', 'set-grid');
    nav = UIKit.h('div', 'set-nav');
    bodyEl = UIKit.h('div', 'set-body g-scroll');
    grid.append(nav, bodyEl);
    body.appendChild(grid);
    shell.appendChild(body);
    root.appendChild(shell);
    renderNav(); render();
  }
  function renderNav() {
    UIKit.clear(nav);
    for (const g of GROUPS) {
      const b = UIKit.h('button', 'set-nav-item' + (g === tab ? ' is-on' : ''), g);
      b.type = 'button';
      b.addEventListener('click', () => { tab = g; renderNav(); render(); UIKit.sfx('select'); });
      nav.appendChild(b);
    }
    nav.appendChild(UIKit.h('div', 'g-div'));
    nav.appendChild(UIKit.btn({
      label: '重放新手引导', kind: 'dark', size: 'sm', icon: '✦',
      onClick: () => { Router.go('lobby'); setTimeout(() => Guide.replay(), 320); },
    }));
  }
  function render() {
    UIKit.clear(bodyEl);
    if (tab === '准星') { bodyEl.appendChild(Crosshair.panel()); return; }
    if (tab === '操控') { bodyEl.appendChild(controls()); }
    if (tab === '辅助') { bodyEl.appendChild(aux()); }
    const host = UIKit.h('div', '');
    bodyEl.appendChild(host);
    // 复用 Settings 的数据定义与持久化，只替换外观：先渲染原生表单，再逐项换皮
    try { Settings.mount(host); } catch (e) { console.warn('[Settings] mount', e); return; }
    const self = ['操控', '辅助', '准星'].indexOf(tab) >= 0;
    if (self) {
      // 这三个分组由壳层自建，摘掉 Settings 渲染出的同名组，避免两份控件抢同一份值
      host.querySelectorAll('.set-group').forEach(g => {
        const t = (g.querySelector('.set-group-title') || {}).textContent || '';
        if (['操控', '辅助', '准星'].indexOf(t) >= 0) g.remove();
      });
    }
    reskin(host, self ? null : tab);
  }
  // 把 Settings.mount 生成的原生行换成游戏化控件（data-id 契约不变，值仍走 Settings.set）
  function reskin(host, onlyGroup) {
    host.querySelectorAll('.set-group').forEach(g => {
      const title = (g.querySelector('.set-group-title') || {}).textContent || '';
      if (onlyGroup && title !== onlyGroup) { g.style.display = 'none'; return; }
      g.style.display = '';
      const h2 = UIKit.h('div', 'set-group-title');
      h2.innerHTML = `<span style="letter-spacing:3px">${title}</span><s></s>`;
      g.replaceChild(h2, g.querySelector('.set-group-title'));
      g.querySelectorAll('.set-row').forEach(row => {
        const label = row.querySelector('.set-label');
        const range = row.querySelector('.set-range');
        const sel = row.querySelector('.set-select');
        const act = row.querySelector('.set-action');
        if (range) {
          const val = row.querySelector('.set-val');
          // 原生 range 必须留在链路上：Settings.mount 的监听器绑在它身上。
          // 做法是把它移进滑杆容器并设为透明覆盖层，外层只换视觉，值与持久化一字不改。
          const s = UIKit.h('div', 'g-slider');
          s.innerHTML = '<div class="g-slider-track"></div><div class="g-slider-fill"></div><div class="g-slider-ticks"></div><div class="g-slider-knob"></div>';
          range.classList.add('ui-native');
          range.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer;z-index:3;background:transparent';
          s.appendChild(range);
          const fill = s.querySelector('.g-slider-fill'), knob = s.querySelector('.g-slider-knob');
          const paint = () => {
            const mn = +range.min, mx = +range.max, r = mx === mn ? 0 : (range.value - mn) / (mx - mn);
            fill.style.width = (r * 100).toFixed(1) + '%';
            knob.style.left = (r * 100).toFixed(1) + '%';
          };
          range.addEventListener('input', paint);
          range.addEventListener('change', paint);
          row.insertBefore(s, val);
          paint();
        } else if (sel) {
          const opts = [...sel.options].map(o => ({ v: o.value, l: o.textContent.trim() }));
          const d = UIKit.dropdown({
            options: opts, value: sel.value,
            onChange: v => { sel.value = v; sel.dispatchEvent(new Event('change', { bubbles: true })); },
          });
          sel.remove();
          const box = UIKit.h('div', 'set-selects'); box.appendChild(d);
          row.insertBefore(box, row.querySelector('.set-val'));
        } else if (act) {
          const b = UIKit.btn({ label: act.textContent, kind: 'dark', size: 'sm', onClick: () => act.click() });
          act.remove(); row.appendChild(b);
        }
      });
    });
    const rf = host.querySelector('.set-foot');
    if (rf) {
      const old = rf.querySelector('#setResetBtn');
      if (old) { const b = UIKit.btn({ label: '恢复默认', kind: 'dark', size: 'sm', onClick: () => old.click() }); old.replaceWith(b); }
      rf.style.display = 'flex';
    }
  }
  function controls() {
    const box = UIKit.h('div', 'set-group');
    box.appendChild(UIKit.h('div', 'set-group-title', '<span style="letter-spacing:3px">操控</span><s></s>'));
    const sens = Crosshair.sensRow();
    box.appendChild(sens);
    box.appendChild(UIKit.h('div', 'g-hint', '瞄准灵敏度作用于<b>准星跟随增益</b>：1.00 时准星严格等于鼠标位置（当前默认手感）；调高后准星移动快于鼠标，适合低 DPI 或窄画幅。'));
    return box;
  }
  function aux() {
    const box = UIKit.h('div', 'set-group');
    box.appendChild(UIKit.h('div', 'set-group-title', '<span style="letter-spacing:3px">辅助</span><s></s>'));
    function sw(label, hint, get, set) {
      const r = UIKit.h('div', 'set-row');
      const t = UIKit.h('div', 'set-label'); t.innerHTML = `${label}<em>${hint}</em>`;
      r.append(t, UIKit.h('span', 'spacer'), UIKit.toggle({ on: get(), onChange: v => { set(v); Toast.ok(label + '：' + (v ? '开' : '关')); } }));
      return r;
    }
    box.appendChild(sw('新手引导', '重放 7 步大厅引导', () => !!localStorage.getItem('zombie_guide_done'),
      v => { if (!v) localStorage.removeItem('zombie_guide_done'); else localStorage.setItem('zombie_guide_done', '1'); Notify.refreshAll(); }));
    box.appendChild(sw('伤害数字', '命中时在画面飘出伤害值', () => CFG.UI_DMG_FLOAT !== false,
      v => { CFG.UI_DMG_FLOAT = v; }));
    box.appendChild(sw('击杀播报', '右上角实时击杀流', () => CFG.UI_KILLFEED !== false,
      v => { CFG.UI_KILLFEED = v; const e = document.getElementById('killfeed'); if (e) e.style.display = v ? '' : 'none'; }));
    box.appendChild(sw('小地图', '右上角战术地图', () => CFG.UI_MINIMAP !== false,
      v => { CFG.UI_MINIMAP = v; const e = document.getElementById('minimap'); if (e) e.style.display = v ? '' : 'none'; }));
    box.appendChild(sw('屏幕震动', '受击与爆炸时的镜头震动', () => (CFG.SHAKE_MUL || 0) > 0,
      v => { CFG.SHAKE_MUL = v ? 1 : 0; try { Settings.set('shakeMul', v ? 1 : 0); } catch (e) { } }));
    return box;
  }
  return { build, render, GROUPS };
})();

// ---------- 准星系统（2.7 准星设置 + 实时绘制） ----------
const Crosshair = (() => {
  const KEY = 'zombie_crosshair';
  const DEF = { shape: 'cross', color: '#35f0a0', size: 12, gap: 5, width: 2, dot: true, dynamic: true, hitmark: true, sens: 1 };
  let cfg = null, cv = null, ctx = null, hitT = 0;
  function load() {
    if (cfg) return cfg;
    cfg = Object.assign({}, DEF);
    try { Object.assign(cfg, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { }
    return cfg;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) { } }
  const SHAPES = [
    { v: 'cross', l: '十字' }, { v: 'dot', l: '圆点' }, { v: 't', l: 'T 型' },
    { v: 'circle', l: '圆环' }, { v: 'x', l: 'X 型' }, { v: 'off', l: '关闭' },
  ];
  function ensure() {
    const hud = document.getElementById('hud');
    if (!hud || cv) return;
    const box = UIKit.h('div', ''); box.id = 'crosshair';
    cv = document.createElement('canvas'); cv.width = 120; cv.height = 120;
    box.appendChild(cv); ctx = cv.getContext('2d');
    hud.appendChild(box);
    box._box = true;
  }
  // 唯一绘制实现：实机准星与设置页预览共用这一份，改形状不会出现两边不一致
  function drawOn(g2, W, H, spread, hit) {
    const c = W / 2, cy = H / 2;
    g2.clearRect(0, 0, W, H);
    if (cfg.shape === 'off') return;
    const gap = cfg.gap + (cfg.dynamic ? Math.max(0, Math.min(16, (spread || 0) * 300)) : 0);
    const L = cfg.size, wp = cfg.width;
    g2.save();
    g2.strokeStyle = cfg.color; g2.fillStyle = cfg.color; g2.lineWidth = wp;
    g2.shadowColor = cfg.color; g2.shadowBlur = 4;
    const arms = cfg.shape === 't' ? ['r', 'b', 'l'] : ['t', 'r', 'b', 'l'];
    // 四条臂的起点：正方向从 gap 起，负方向从 gap+臂长 起，这样四臂对称且不覆盖中心
    const arm = (d) => d > 0 ? gap : -(gap + L);
    if (cfg.shape === 'cross' || cfg.shape === 't' || cfg.shape === 'x') {
      if (cfg.shape === 'x') { g2.translate(c, cy); g2.rotate(Math.PI / 4); g2.translate(-c, -cy); }
      for (const a of arms) {
        const dx = a === 'l' ? -1 : a === 'r' ? 1 : 0, dy = a === 't' ? -1 : a === 'b' ? 1 : 0;
        if (dx) g2.fillRect(c + arm(dx), cy - wp / 2, L, wp);
        else g2.fillRect(c - wp / 2, cy + arm(dy), wp, L);
      }
    } else if (cfg.shape === 'circle') {
      g2.beginPath(); g2.arc(c, cy, gap + L * .6, 0, 7); g2.stroke();
    } else if (cfg.shape === 'dot') {
      g2.beginPath(); g2.arc(c, cy, Math.max(1.6, wp), 0, 7); g2.fill();
    }
    if (cfg.dot && cfg.shape !== 'dot') g2.fillRect(c - wp / 2, cy - wp / 2, wp, wp);
    if (hit > 0) {
      g2.shadowBlur = 8; g2.strokeStyle = '#ff3b3b'; g2.lineWidth = 2; g2.globalAlpha = Math.max(0, hit);
      const o = 7 + (1 - hit) * 11;
      g2.translate(c, cy); g2.rotate(Math.PI / 4);
      g2.beginPath();
      g2.moveTo(-o, 0); g2.lineTo(-o + 6, 0); g2.moveTo(o - 6, 0); g2.lineTo(o, 0);
      g2.moveTo(0, -o); g2.lineTo(0, -o + 6); g2.moveTo(0, o - 6); g2.lineTo(0, o);
      g2.stroke();
    }
    g2.restore();
  }
  function draw(spread) {
    ensure();
    if (!ctx) return;
    drawOn(ctx, cv.width, cv.height, spread, cfg.hitmark ? hitT : 0);
  }
  function markHit() { hitT = 1; }
  function tick(dt) { load(); if (hitT > 0) hitT = Math.max(0, hitT - dt * 3.4); }
  function panel() {
    load();
    const box = UIKit.h('div', 'set-group');
    box.appendChild(UIKit.h('div', 'set-group-title', '<span style="letter-spacing:3px">准星</span><s></s>'));
    const prev = UIKit.h('div', 'cross-prev');
    const pc = document.createElement('canvas');
    prev.append(pc, UIKit.h('div', 'cp-tag', 'LIVE PREVIEW · 与实际绘制同源'));
    box.appendChild(prev);
    const pctx = pc.getContext('2d');
    function paintPrev() {
      // 逻辑分辨率跟容器实际像素一致：否则 CSS 拉伸会把十字臂横向拉变形、标签挤出画布
      const W = prev.clientWidth || 600, H = prev.clientHeight || 132;
      if (pc.width !== W || pc.height !== H) { pc.width = W; pc.height = H; }
      pctx.save();
      pctx.clearRect(0, 0, W, H);
      pctx.fillStyle = '#061014'; pctx.fillRect(0, 0, W, H);
      pctx.fillStyle = 'rgba(53,240,160,.07)';
      for (let i = 0; i < W; i += 24) pctx.fillRect(i, 0, 1, H);
      for (let i = 0; i < H; i += 24) pctx.fillRect(0, i, W, 1);
      pctx.restore();
      const cols = 4, cw = W / cols;
      const spots = [0, .012, .03, .06];
      spots.forEach((sp, i) => {
        pctx.save(); pctx.translate(i * cw, 0);
        drawOn(pctx, cw, H, sp, 0);
        pctx.restore();
      });
      pctx.fillStyle = 'rgba(143,184,176,.8)'; pctx.font = '10px "Zpix Pixel", monospace';
      ['静态', '微扩散', '中扩散', '满扩散'].forEach((t, i) => pctx.fillText(t, i * cw + 10, H - 8));
    }
    function row(label, hint, node) {
      const r = UIKit.h('div', 'set-row');
      const t = UIKit.h('div', 'set-label'); t.innerHTML = `${label}<em>${hint}</em>`;
      r.append(t, node); box.appendChild(r); return r;
    }
    row('准星形状', '六种可选，含关闭', (() => {
      const s = UIKit.segs({ options: SHAPES, value: cfg.shape, onChange: v => { cfg.shape = v; save(); draw(0); paintPrev(); } });
      s.style.flex = '1'; return s;
    })());
    row('准星颜色', '高对比度优先', (() => {
      const w = UIKit.h('div', 'row wrap'); w.style.flex = '1';
      for (const c of [['#35f0a0', '荧光绿'], ['#b9ff45', '酸绿'], ['#ffb020', '琥珀'], ['#45d8ff', '冰蓝'], ['#ff3b3b', '危险红'], ['#ffffff', '纯白'], ['#a45cff', '幽紫']]) {
        const n = UIKit.h('div', 'g-seg' + (cfg.color === c[0] ? ' is-on' : ''));
        n.style.cssText = `width:30px;height:26px;display:grid;place-items:center;color:${c[0]}`;
        n.textContent = '●';
        n.title = c[1];
        n.addEventListener('click', () => {
          cfg.color = c[0]; save(); draw(0); paintPrev();
          [...w.children].forEach(x => x.classList.remove('is-on')); n.classList.add('is-on'); UIKit.sfx('select');
        });
        w.appendChild(n);
      }
      return w;
    })());
    row('准星长度', '单条臂长（像素）', (() => {
      const s = UIKit.slider({ min: 4, max: 26, step: 1, value: cfg.size, onChange: v => { cfg.size = v; save(); draw(0); paintPrev(); } });
      return s;
    })());
    row('中心留空', '准星与中心的间距', (() => {
      const s = UIKit.slider({ min: 0, max: 20, step: 1, value: cfg.gap, onChange: v => { cfg.gap = v; save(); draw(0); paintPrev(); } });
      return s;
    })());
    row('线条粗细', '', (() => {
      const s = UIKit.slider({ min: 1, max: 6, step: 1, value: cfg.width, onChange: v => { cfg.width = v; save(); draw(0); paintPrev(); } });
      return s;
    })());
    row('中心点', '在正中心补一个像素点', (() => {
      const t = UIKit.toggle({ on: cfg.dot, onChange: v => { cfg.dot = v; save(); draw(0); paintPrev(); } });
      const w = UIKit.h('div', 'row'); w.style.cssText = 'flex:1;justify-content:flex-end'; w.appendChild(t); return w;
    })());
    row('动态扩散', '准星随弹道扩散外扩，反映真实散布', (() => {
      const t = UIKit.toggle({ on: cfg.dynamic, onChange: v => { cfg.dynamic = v; save(); draw(0); paintPrev(); } });
      const w = UIKit.h('div', 'row'); w.style.cssText = 'flex:1;justify-content:flex-end'; w.appendChild(t); return w;
    })());
    row('命中标记', '命中目标时闪出红色 X', (() => {
      const t = UIKit.toggle({ on: cfg.hitmark, onChange: v => { cfg.hitmark = v; save(); } });
      const w = UIKit.h('div', 'row'); w.style.cssText = 'flex:1;justify-content:flex-end'; w.appendChild(t); return w;
    })());
    box.appendChild(sensRow());
    setTimeout(paintPrev, 0);
    return box;
  }
  function sensRow() {
    load();
    const r = UIKit.h('div', 'set-row');
    const t = UIKit.h('div', 'set-label'); t.innerHTML = '瞄准灵敏度<em>准星跟随鼠标的增益，1.00 为原始手感</em>';
    const val = UIKit.h('span', 'set-val', cfg.sens.toFixed(2) + 'x');
    const s = UIKit.slider({
      min: .5, max: 2.5, step: .05, value: cfg.sens,
      onChange: v => { cfg.sens = v; save(); val.textContent = v.toFixed(2) + 'x'; CFG.AIM_SENS = v; },
      onInput: v => { val.textContent = v.toFixed(2) + 'x'; },
    });
    r.append(t, s, val);
    return r;
  }
  function apply() {
    load();
    CFG.AIM_SENS = cfg.sens;
    ensure();
    draw(0);
  }
  return { load, save, draw, tick, markHit, panel, sensRow, apply, ensure, get cfg() { return load(); }, get canvas() { return cv; } };
})();

// ---------- 页面注册与启动 ----------
const Shell = (() => {
  function page(id, host, def) {
    let el = document.getElementById('page-' + id);
    if (!el && host) { el = UIKit.h('div', 'g-page'); el.id = 'page-' + id; host.appendChild(el); }
    return Router.register(id, Object.assign({ el }, def));
  }
  // game.js / net.js / 内联脚本赖以读写的控件清单：重建前全部摘出保住
  const RADIO_GROUPS = ['mode', 'room', 'training', 'trainingZtype', 'mpSize'];
  const KEEP_IDS = [
    'startBtn', 'trainingStartBtn', 'useCustomMap', 'backpackItem', 'operatorSkin', 'startBackpack',
    'siegeAtkRole', 'siegeDefRole', 'trainingWeaponCat', 'trainingWeapon',
    'mpServer', 'mpName', 'mpRoom', 'mpHostBtn', 'mpJoinBtn', 'mpStartBtn', 'mpLeaveBtn', 'mpStatus', 'mpPlayers',
    // 仓库渲染目标：由 Armory.host() 取回并插进新布局
    'whBackpackList', 'whSlots', 'whEditTitle', 'whStatus',
    'whPrevCanvas', 'whTrajCanvas', 'whPrevName', 'whPrevCat', 'whPrevStars', 'whPrevRole', 'whPrevFx', 'whPrevFlags',
  ];
  function harvest() {
    for (const g of RADIO_GROUPS) Contract.snapshotRadios(g);
    const radios = {};
    for (const g of RADIO_GROUPS) radios[g] = Contract.pickAll(`input[name="${g}"]`);
    for (const id of KEEP_IDS) Contract.pick(id);
    return radios;
  }
  function init() {
    const menu = document.getElementById('menu');
    if (!menu) { console.warn('[Shell] 缺少 #menu 宿主'); return; }
    menu.classList.remove('overlay');
    const radios = harvest();
    UIKit.clear(menu);
    const raw = UIKit.h('div', 'ui-raw'); raw.id = 'uiRaw';
    for (const g of RADIO_GROUPS) for (const n of radios[g]) raw.appendChild(n);
    for (const id of KEEP_IDS) { const n = Contract.get(id); if (n) raw.appendChild(n); }
    menu.appendChild(raw);
    Contract.restoreRadios();

    page('boot', menu, { title: '启动', onEnter: () => Boot.enter() });
    page('login', menu, { title: '登录', onEnter: () => Auth.enter() });
    page('lobby', menu, { title: '大厅', build: p => Lobby.build(p), onEnter: () => Lobby.enter(), onLeave: () => Lobby.leave() });
    page('warehouse', menu, { title: '仓库', build: p => Armory.build(p), onEnter: () => Armory.enter() });
    page('training', menu, { title: '训练营', build: p => TrainingUI.build(p) });
    page('online', menu, { title: '多人', build: p => OnlineUI.build(p) });
    page('settings', menu, { title: '设置', build: p => SettingsUI.build(p), onEnter: () => SettingsUI.render() });
    page('ddt', menu, { title: '弹弹堂', build: p => ddtPage(p) });
    const bootEl = document.getElementById('page-boot');
    if (bootEl) bootEl.classList.add('g-page--boot');
    const loadEl = document.getElementById('page-loading');
    if (loadEl) loadEl.classList.add('g-page');

    Auth.init(document.getElementById('page-login'));
    Loading.init(loadEl);
    Launcher.init();
    Crosshair.apply();
    wrapOverPanel();
    // 未保存更改标记（供路由拦截器读取）
    window.__uiDirtyFlag = () => { window.__ui_dirty = true; };
    window.__uiDirty = () => !!window.__ui_dirty;
    window.__uiDirtyClear = () => { window.__ui_dirty = false; };
    document.addEventListener('change', e => {
      if (e.target && e.target.closest && e.target.closest('#whSlots')) window.__uiDirtyFlag();
    }, true);

    Router.go('boot');
    hookFrame();
  }
  function ddtPage(p) {
    const root = p.el; root.innerHTML = '';
    const shell = UIKit.h('div', 'g-shell');
    const body = UIKit.h('div', 'g-body');
    const head = UIKit.h('div', 'g-phead', '<b>弹 弹 堂</b><s></s>');
    head.appendChild(UIKit.btn({ label: '返回大厅', kind: 'dark', icon: '‹', onClick: () => Router.go('lobby') }));
    body.appendChild(head);
    const c = UIKit.frame('', null); c.style.setProperty('--cut', '18px');
    c.body.innerHTML = `<div class="row" style="gap:18px;align-items:flex-start;padding:10px 4px">
      <div style="font-size:64px;color:#a45cff">◍</div>
      <div style="flex:1"><div class="lime" style="font-size:20px;font-weight:900;letter-spacing:4px">联动活动入口（未开放）</div>
      <div class="g-hint" style="margin-top:8px">脑图 2.2 要求「模式选择 Tab 新增弹弹堂入口」。<b>本仓库没有弹弹堂玩法代码</b>（无角度/力度抛物线对战、无道具系统），因此这里只做到：入口卡 + 拦截提示 + 道具预览清单（见仓库「弹药/道具」页签）。<div class="g-div"></div>已如实登记为<b>未实现</b>，不做假界面充数。</div></div></div>`;
    body.appendChild(c);
    shell.appendChild(body); root.appendChild(shell);
  }
  // 结算页 / 局内背包：套上斜切外壳，保留内部 id
  function wrapOverPanel() {
    for (const [pid, cls] of [['over', 'panel'], ['backpackUI', 'panel bp-panel']]) {
      const ov = document.getElementById(pid);
      if (!ov) continue;
      const old = ov.querySelector(':scope > .panel');
      if (!old || old.parentElement.dataset.wrapped) continue;
      const f = UIKit.frame(cls + ' gf-cnr', null);
      f.style.setProperty('--cut', '18px');
      f.body.append(...[...old.childNodes]);
      f.dataset.wrapped = '1';
      old.replaceWith(f);
    }
  }
  function hookFrame() {
    if (typeof frame !== 'function') { setTimeout(hookFrame, 200); return; }
    const raw = window.frame;
    let last = performance.now();
    window.frame = function (now) {
      const dt = Math.min(.05, (now - last) / 1000); last = now;
      Crosshair.tick(dt);
      try { updateCrosshair(); } catch (e) { }
      raw(now);
    };
  }
  function updateCrosshair() {
    const cv = Crosshair.canvas;
    if (!cv) return;
    const hud = document.getElementById('hud');
    const box = cv.parentElement;
    const on = hud && !hud.classList.contains('hidden') && game && game.player && !game.player.dead;
    box.style.display = on && Crosshair.cfg.shape !== 'off' ? '' : 'none';
    if (!on) return;
    let spread = 0;
    try {
      const p = game.player, w = p.weapons && p.weapons[p.slot];
      if (w && !w.melee) spread = (w.spread || .03) * (1 + (p.bloom || 0)) * (CFG.GLOBAL_SPREAD_MUL || 1);
    } catch (e) { }
    Crosshair.draw(spread);
  }
  return { init, page };
})();

// 结算页增强：把 game.js 写进 #overStats 的纯文本升级为数据格 + 奖励行 + 动作区
(function enhanceOver() {
  let rewarded = false;
  function apply() {
    const ov = document.getElementById('over');
    if (!ov) return;
    if (ov.classList.contains('hidden')) { rewarded = false; ov.dataset.enhanced = ''; return; }
    const host = ov.querySelector('.gf-in');
    const title = document.getElementById('overTitle');
    const stats = document.getElementById('overStats');
    const again = document.getElementById('againBtn');
    const replayRow = document.getElementById('replayRow');
    if (!host || !title) return;
    // 以「标题 + 战报文本」为签名：game.js 每次结算都会重写这两处，签名一变就拆掉旧的增强节点重建，
    // 免得上一局的胜负与数值残留到这一局的结算页上。
    const sig = (title.textContent || '') + '¶' + (stats ? stats.textContent : '');
    if (ov.dataset.enhanced === sig) return;
    ov.dataset.enhanced = sig;
    host.querySelectorAll('[data-rs]').forEach(n => n.remove());
    const mk = n => { n.dataset.rs = '1'; return n; };

    const win = /胜利|撤离成功|获胜|达成/.test(title.textContent || '');
    const hero = mk(UIKit.h('div', 'rs-hero ' + (win ? 'win' : 'lose')));
    hero.innerHTML = `<b>${win ? '任 务 达 成' : '防 线 崩 溃'}</b><em>${UIKit.esc(title.textContent || '')}</em>`;
    title.style.display = 'none';
    host.insertBefore(hero, host.firstChild);

    const lines = (stats && stats.textContent ? stats.textContent : '').split('\n').map(s => s.trim()).filter(Boolean);
    if (stats) {
      const g = mk(UIKit.h('div', 'rs-grid'));
      for (const ln of lines) {
        const m = ln.match(/^(.{1,10}?)\s*[：:]\s*(.+)$/);
        const cell = UIKit.h('div', 'rs-cell');
        cell.innerHTML = m ? `<s>${UIKit.esc(m[1])}</s><b>${UIKit.esc(m[2])}</b>` : `<s>战报</s><b>${UIKit.esc(ln)}</b>`;
        g.appendChild(cell);
      }
      host.insertBefore(g, stats);
      stats.style.display = 'none';
    }
    const exp = 120 + lines.length * 30, gold = 800 + lines.length * 160;
    const rw = mk(UIKit.h('div', 'rs-rewards'));
    rw.innerHTML = `<span class="rs-rw">◈ 金币 +${gold}</span><span class="rs-rw">✦ 经验 +${exp}</span><span class="rs-rw">⚡ 体力 -1</span>`;
    host.insertBefore(rw, (replayRow && !replayRow.classList.contains('hidden')) ? replayRow : (again || null));
    if (!rewarded) {
      rewarded = true;
      const p = Profile.data;
      p.gold += gold; p.stamina = Math.max(0, (p.stamina || 0)); Profile.addExp(exp); Profile.save();
    }
    const acts = mk(UIKit.h('div', 'rs-acts'));
    acts.appendChild(UIKit.btn({ label: '返 回 大 厅', kind: 'dark', icon: '⌂', onClick: () => { UI.hideOver(); UI.showMenu(); Router.go('lobby'); } }));
    if (again) {
      const b = UIKit.btn({ label: '再 来 一 局', icon: '▶', onClick: () => Launcher.again() });
      acts.appendChild(b);
      again.style.display = 'none';
    }
    host.appendChild(acts);
    setTimeout(() => UIKit.sfx(win ? 'confirm' : 'error'), 120);
  }
  const mo = new MutationObserver(apply);
  function watch() {
    const ov = document.getElementById('over');
    if (!ov) { setTimeout(watch, 300); return; }
    mo.observe(ov, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
    setInterval(apply, 350);
  }
  watch();
})();

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => Shell.init());
else Shell.init();
