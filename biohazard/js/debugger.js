// ============ 训练营数值调试器 ============
// 数据源：js/debugger-schema.js（由 tools/_audit_balance.js 从全仓库数值扫描生成，含生效时点与死键标记）。
// 只在训练营可用：F2 开关，或 HUD 的 🛠 按钮。面板不暂停游戏，改完立刻打下一枪看效果。
// 与设置面板的分工：Settings 是玩家向的少数几个总倍率；这里是逐字段直写数据表，给开发调平衡用。
const Debugger = (() => {
  const STORE_KEY = 'zombie_debugger';
  const PAGE = 200;          // 首屏最多建多少行（一行约 11 个节点）
  const SCHEMA = () => (typeof DEBUG_SCHEMA !== 'undefined' ? DEBUG_SCHEMA : null);

  // 顶层 const 的数据表不会挂到 window 上（浏览器里 window.WEAPONS 是 undefined），
  // 所以只能按名字直接引用这些全局绑定；新增根符号时在这里补一行。
  const ROOT_OBJECTS = {
    get CFG() { return typeof CFG !== 'undefined' ? CFG : null; },
    get WEAPONS() { return typeof WEAPONS !== 'undefined' ? WEAPONS : null; },
    get ZOMBIES() { return typeof ZOMBIES !== 'undefined' ? ZOMBIES : null; },
    get BUFF_TYPES() { return typeof BUFF_TYPES !== 'undefined' ? BUFF_TYPES : null; },
    get HERO_TYPES() { return typeof HERO_TYPES !== 'undefined' ? HERO_TYPES : null; },
    get FX_META() { return typeof FX_META !== 'undefined' ? FX_META : null; },
    get ATTACH_META() { return typeof ATTACH_META !== 'undefined' ? ATTACH_META : null; },
    get EQUIP_META() { return typeof EQUIP_META !== 'undefined' ? EQUIP_META : null; },
    get BLOOM_BY_GROUP() { return typeof BLOOM_BY_GROUP !== 'undefined' ? BLOOM_BY_GROUP : null; },
  };

  const state = { open: false, active: false, group: '', q: '', onlyChanged: false, diffs: {}, rows: {}, shown: PAGE, pause: false };
  let host = null;

  // ---------- 读写全局数据表 ----------
  function locate(path) {
    const segs = String(path).split('.');
    let o = ROOT_OBJECTS[segs[0]];
    if (o == null) return null;
    for (let i = 1; i < segs.length - 1; i++) {
      o = o[segs[i]];
      if (o == null) return null;
    }
    return { obj: o, key: segs[segs.length - 1] };
  }
  function readPath(path) { const l = locate(path); return l ? l.obj[l.key] : undefined; }
  function writePath(path, v) { const l = locate(path); if (!l) return false; l.obj[l.key] = v; return true; }

  // ---------- 生效时点：refresh 类要把新表值回填到已经在场的实体 ----------
  function refreshEntities(changedPath) {
    if (typeof game === 'undefined' || !game || !game.entities) return;
    const mul = { hp: CFG.ZOMBIE_HP_MUL || 1, speed: CFG.ZOMBIE_SPEED_MUL || 1, dmg: CFG.ZOMBIE_DMG_MUL || 1, cd: CFG.ZOMBIE_CD_MUL || 1 };
    const which = changedPath ? changedPath.split('.') : [];
    for (const e of game.entities) {
      if (!e || e.dead) continue;
      if (e.kind === 'zombie') {
        const z = ZOMBIES[e.ztype];
        if (!z) continue;
        if (!which[0] || which[0] === 'ZOMBIES' || which[0] === 'CFG') {
          const maxHp = Math.round(z.hp * mul.hp);
          const ratio = e.maxHp > 0 ? e.hp / e.maxHp : 1;
          e.maxHp = maxHp;
          if (!e.invuln && !e.isPlayer) e.hp = Math.max(1, Math.round(maxHp * ratio));
          e.speed = Math.round(z.speed * mul.speed);
          e.dmg = Math.round(z.dmg * mul.dmg);
          e.knock = z.knock;
          e.w = z.w; e.h = z.h;
        }
      } else if (e.kind === 'human') {
        if (!which[0] || which[0] === 'CFG' || which[0] === 'WEAPONS') {
          const maxHp = Math.round(CFG.HUMAN_HP);
          const ratio = e.maxHp > 0 ? e.hp / e.maxHp : 1;
          e.maxHp = maxHp;
          if (!e.sandbag && !e.invuln) e.hp = Math.max(1, Math.round(maxHp * ratio));
        }
        if (e.arsenal) {
          for (const k of Object.keys(e.arsenal)) {
            const w = WEAPONS[k]; const slot = e.arsenal[k];
            if (!w || !slot) continue;
            if (slot.mag !== Infinity) slot.mag = Math.min(slot.mag, w.mag);
            if (slot.count !== Infinity && w.count != null) slot.count = Math.min(slot.count, w.count);
          }
        }
      }
    }
  }

  // ---------- 改动持久化（刷新页面后仍然接着调） ----------
  function save() {
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(STORE_KEY, JSON.stringify(state.diffs)); } catch (e) { /* 存档不可用就只在本页生效 */ }
  }
  function load() {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORE_KEY) : null;
      if (!raw) return 0;
      const obj = JSON.parse(raw);
      let n = 0;
      // 走 apply 而不是直接 writePath：运行时项（音量/开镜方式/单枪散布）只有 apply 认识怎么落地
      for (const [p, v] of Object.entries(obj)) {
        if (apply(p, v, { silent: true })) n++;
      }
      if (n) refreshEntities(null);
      return n;
    } catch (e) { return 0; }
  }

  function apply(path, v, opt) {
    const rt = rtOf(path);
    if (rt) {
      if (rt.type === 'action') { rt.run(); return true; }
      rt.set(rt.type === 'bool' ? !!v : v);
      const cur = rt.get();
      if (String(cur) === String(rt.def)) delete state.diffs[path]; else state.diffs[path] = cur;
      save();
      if (!opt || !opt.silent) { syncRow(path); renderDiffBar(); }
      return true;
    }
    const prev = readPath(path);
    if (typeof prev !== 'number' || !isFinite(v)) return false;
    if (!writePath(path, v)) return false;
    const item = schemaItemOf(path);
    if (item && (item.scope === 'refresh' || item.scope === 'immediate' && /^CFG\.(HUMAN_HP|ZOMBIE_)/.test(path))) refreshEntities(path);
    if (Math.abs(v - (item ? item.def : v)) < 1e-9) delete state.diffs[path]; else state.diffs[path] = v;
    save();
    if (!opt || !opt.silent) { syncRow(path); renderDiffBar(); }
    return true;
  }
  function revert(path) {
    const it = itemOf(path);
    if (!it || it.def == null) return;
    apply(path, it.def);
  }
  function revertAll() {
    for (const p of Object.keys(state.diffs)) revert(p);
    state.diffs = {}; save(); render();
  }

  // ---------- 运行时项（不是数据表里的数字，扫描器扫不出来，手写在这里）----------
  // 这些是原设置面板里「CFG 数字之外」的能力，缺一个就不能删那个面板，所以逐条搬过来。
  function runtimeItems() {
    const list = [];
    if (typeof AudioFX !== 'undefined') list.push({
      rt: true, path: 'AudioFX.masterVol', label: '主音量（AudioFX 总增益）', unit: '0~1',
      group: '运行时', name: '运行时', min: 0, max: 1, step: 0.05,
      get: () => AudioFX.getMasterVol ? AudioFX.getMasterVol() : 0.5, set: v => AudioFX.setMasterVol(v), def: 0.5,
    });
    if (typeof CFG !== 'undefined') list.push({
      rt: true, path: 'CFG.ADS_MODE', label: '开镜方式（字符串项）', unit: '', group: '运行时', name: '运行时',
      type: 'select', opts: [['hold', '长按开镜'], ['toggle', '点击开镜']],
      get: () => CFG.ADS_MODE, set: v => { CFG.ADS_MODE = v; }, def: 'hold',
    });
    list.push({
      rt: true, path: 'Debugger.pause', label: '开着面板时暂停游戏', unit: '', group: '运行时', name: '运行时',
      type: 'bool', get: () => state.pause, set: v => { state.pause = !!v; }, def: false,
    });
    if (typeof Training !== 'undefined') {
      const act = (path, label, fn) => list.push({ rt: true, path, label, unit: '', group: '运行时', name: '运行时', type: 'action', run: fn });
      act('Training.switchCamp', '切换阵营（人类 ⇄ 僵尸）', () => {
        const k = game && game.player ? game.player.kind : 'human';
        Training.switchCamp(k === 'human' ? 'zombie' : 'human');
      });
      act('Training.spawnDummy.human', '生成人类沙包', () => Training.spawnDummy('human'));
      act('Training.spawnDummy.zombie', '生成僵尸木桩', () => Training.spawnDummy('zombie'));
      act('Training.clearDummies', '清空木桩', () => Training.clearDummies());
    }
    // 单枪散布覆盖：entities.js:171 读 CFG.GUN_SPREAD_OVERRIDE[weaponKey]，1.0 时删键保持表干净
    if (typeof CFG !== 'undefined' && typeof WEAPONS !== 'undefined') {
      for (const k of Object.keys(WEAPONS)) {
        const w = WEAPONS[k];
        if (!w || w.melee || w.grenade || w.hero) continue;
        list.push({
          rt: true, path: 'CFG.GUN_SPREAD_OVERRIDE.' + k, label: (w.name || k) + ' 散布倍率', unit: 'multiplier',
          group: '单枪散布覆盖', name: '单枪散布覆盖', min: 0, max: 3, step: 0.05,
          get: () => (CFG.GUN_SPREAD_OVERRIDE[k] == null ? 1 : CFG.GUN_SPREAD_OVERRIDE[k]),
          set: v => { if (Math.abs(v - 1) < 1e-9) delete CFG.GUN_SPREAD_OVERRIDE[k]; else CFG.GUN_SPREAD_OVERRIDE[k] = v; },
          def: 1,
        });
      }
    }
    return list;
  }
  function rtOf(path) { return runtimeItems().find(i => i.path === path) || null; }

  // ---------- 清单 ----------
  function schemaItemOf(path) {
    const s = SCHEMA(); if (!s) return null;
    for (const g of s.分组) for (const i of g.items) if (i.path === path) return i;
    return null;
  }
  function itemOf(path) { return rtOf(path) || schemaItemOf(path); }
  function groups() {
    const base = SCHEMA() ? SCHEMA().分组 : [];
    const byGroup = {};
    for (const i of runtimeItems()) (byGroup[i.group] = byGroup[i.group] || []).push(i);
    const rt = Object.keys(byGroup).map(id => ({ id, 名称: id, 条数: byGroup[id].length, items: byGroup[id] }));
    return rt.concat(base);          // 运行时项排最前
  }
  function visibleItems() {
    const q = state.q.toLowerCase();
    const out = [];
    for (const g of groups()) {
      if (state.group && g.id !== state.group) continue;
      for (const it of g.items) {
        const changed = state.diffs[it.path] != null;
        if (state.onlyChanged && !changed) continue;
        if (q && !((it.path + ' ' + it.label + ' ' + g.名称).toLowerCase().includes(q))) continue;
        out.push({ g, it, changed });
      }
    }
    return out;
  }

  const SCOPE_BADGE = {
    immediate: ['⚡即时', '生效时点：写入即生效，下一发/下一帧就读到新值'],
    refresh: ['↻回填实体', '生效时点：表里改完还要写进已经在场的实体（调试器已自动做）'],
    restart: ['⏩需重开', '生效时点：只在开局/setupRoom 读一次，改完要重开训练营才看得到'],
    dead: ['☠无读取点', '源码里没有任何地方读这个键，改它不会有任何效果（例如 CFG.COYOTE / CFG.BUFFER / dashSpeed）'],
  };

  function fmt(v) {
    if (typeof v !== 'number') return String(v);          // 运行时项里有字符串值（开镜方式）
    return Math.abs(v) >= 1000 ? String(Math.round(v)) : String(+v.toFixed(4));
  }

  // ---------- DOM ----------
  function ensureHost() {
    if (host || typeof document === 'undefined') return host;
    host = document.createElement('div');
    host.id = 'dbgUI';
    host.className = 'dbg-root hidden';
    host.innerHTML = `
      <div class="dbg-head">
        <span class="dbg-title">数值调试器</span>
        <span class="dbg-sub">F2 开关 · 不暂停游戏</span>
        <span class="dbg-actions"><button class="dbg-btn" data-act="copy">复制改动</button>
        <button class="dbg-btn" data-act="clear">全部还原</button>
        <button class="dbg-btn" data-act="close">✕</button></span>
      </div>
      <div class="dbg-tools">
        <input class="dbg-q" type="text" placeholder="搜路径 / 含义 / 枪名">
        <select class="dbg-group"></select>
        <label class="dbg-only"><input type="checkbox" class="dbg-only-cb">只看改动</label>
      </div>
      <div class="dbg-banner hidden"></div>
      <div class="dbg-body"></div>
      <div class="dbg-foot"></div>`;
    document.body.appendChild(host);
    // 面板内的按键/滚轮/按下不注入游戏；但 keyup 必须放行，
    // 否则「按住 D 移动 → 点进搜索框 → 松开 D」会让游戏永远以为 D 还按着。
    host.addEventListener('mousedown', e => e.stopPropagation());
    host.addEventListener('wheel', e => e.stopPropagation(), { passive: true });
    host.addEventListener('keydown', e => e.stopPropagation());
    host.querySelector('.dbg-q').addEventListener('input', e => { state.q = e.target.value.trim(); state.shown = PAGE; render(); });
    host.querySelector('.dbg-group').addEventListener('change', e => { state.group = e.target.value; state.shown = PAGE; render(); });
    host.querySelector('.dbg-only-cb').addEventListener('change', e => { state.onlyChanged = e.target.checked; state.shown = PAGE; render(); });
    host.querySelector('.dbg-actions').addEventListener('click', e => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      if (b.dataset.act === 'close') close();
      else if (b.dataset.act === 'clear') revertAll();
      else if (b.dataset.act === 'copy') copyDiff();
    });
    const onEdit = e => {
      const inp = e.target.closest('[data-path]'); if (!inp) return;
      const v = inp.type === 'checkbox' ? inp.checked : (inp.classList.contains('dbg-sel') ? inp.value : Number(inp.value));
      if (inp.type === 'checkbox' || inp.classList.contains('dbg-sel') || isFinite(v)) apply(inp.dataset.path, v, { silent: true });
      syncRow(inp.dataset.path); renderDiffBar();
    };
    host.querySelector('.dbg-body').addEventListener('input', onEdit);
    host.querySelector('.dbg-body').addEventListener('change', onEdit);
    host.querySelector('.dbg-body').addEventListener('click', e => {
      const act = e.target.closest('[data-act-path]');
      if (act) { apply(act.dataset.actPath, true); render(); return; }
      const b = e.target.closest('[data-revert]'); if (!b) return;
      revert(b.dataset.revert);
    });
    return host;
  }

  function render() {
    if (!host) return;
    const sel = host.querySelector('.dbg-group');
    const cur = state.group;
    sel.innerHTML = '<option value="">（全部 ' + groups().length + ' 组）</option>'
      + groups().map(g => `<option value="${g.id}" ${g.id === cur ? 'selected' : ''}>${g.名称} · ${g.条数}</option>`).join('');
    const items = visibleItems();
    // 一次建 875 行 = 约 9,700 个 DOM 节点，实测开面板要 110~170ms（弱机上更久）。
    // 首屏只建 PAGE 行，剩下的走「显示更多」，把一次性开销摊掉。
    const page = items.slice(0, state.shown);
    const body = host.querySelector('.dbg-body');
    body.innerHTML = page.length ? page.map(({ g, it, changed }) => {
      const badge = SCOPE_BADGE[it.scope] || (it.rt ? ['⚙运行时', '生效时点：运行时直接调接口，立即生效'] : SCOPE_BADGE.immediate);
      const live = it.rt ? (it.get ? it.get() : null) : readPath(it.path);   // action 项没有取值端
      const name = it.path.split('.').slice(1).join('.') || it.path;
      let ctl;
      if (it.type === 'action') {
        ctl = `<div class="dbg-line2"><button class="dbg-btn dbg-act" data-act-path="${it.path}">执行</button></div>`;
      } else if (it.type === 'bool') {
        ctl = `<div class="dbg-line2"><input type="checkbox" class="dbg-chk" data-path="${it.path}" ${live ? 'checked' : ''}></div>`;
      } else if (it.type === 'select') {
        ctl = `<div class="dbg-line2"><select class="dbg-sel" data-path="${it.path}">`
          + it.opts.map(o => `<option value="${o[0]}" ${String(live) === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')
          + `</select></div>`;
      } else {
        // 量程要罩住当前实际值（可能是上次会话恢复进来的大数），否则 range 会把它夹回上限
        const lo = Math.min(it.min, isFinite(live) ? live : it.min);
        const hi = Math.max(it.max, isFinite(live) ? live : it.max);
        ctl = `<div class="dbg-line2">
          <input type="range" class="dbg-range" data-path="${it.path}" min="${lo}" max="${hi}" step="${it.step}" value="${live}">
          <input type="number" class="dbg-num" data-path="${it.path}" step="${it.step}" value="${live}">
          ${it.def == null ? '' : `<button class="dbg-revert" data-revert="${it.path}" title="还原为默认 ${it.def}">↺</button>`}
        </div>`;
      }
      return `<div class="dbg-row${changed ? ' chg' : ''}${it.scope === 'dead' ? ' dead' : ''}" data-row="${it.path}">
        <div class="dbg-line1"><span class="dbg-path">${name}</span>
          <span class="dbg-badge b-${it.rt ? 'set' : it.scope}" title="${badge[1]}">${badge[0]}</span>
          ${it.setting ? '<span class="dbg-badge b-set" title="设置面板也有这一项，存档值会覆盖源码">★设置项</span>' : ''}</div>
        ${ctl}
        <div class="dbg-meta"><span>${it.label}${it.unit ? ' · ' + it.unit : ''}</span>
          ${it.def == null ? '' : `<span class="dbg-def">默认 ${typeof it.def === 'number' ? fmt(it.def) : it.def}</span>`}
          ${changed ? `<span class="dbg-now">现 ${typeof live === 'number' ? fmt(live) : live}</span>` : ''}</div>
      </div>`;
    }).join('') : '<div class="dbg-empty">没有匹配项</div>';
    if (items.length > page.length) {
      const more = document.createElement('div');
      more.className = 'dbg-more';
      more.textContent = `显示更多（还有 ${items.length - page.length} 条）`;
      more.onclick = () => { state.shown += PAGE; render(); };
      body.appendChild(more);
    }
    state.rows = {};
    renderDiffBar();
  }

  function syncRow(path) {
    const row = host && host.querySelector(`[data-row="${path}"]`);
    if (!row) return;
    const it0 = itemOf(path);
    const v = it0 && it0.rt ? (it0.get ? it0.get() : null) : readPath(path);
    // 手输可以超出滑块量程（比如把伤害从 24 直接敲成 999）；这时要把滑块量程撑开，
    // 否则 range 会把它夹回上限，下次拖一下就把刚输的值冲掉了。
    const rng = row.querySelector('.dbg-range');
    if (rng && isFinite(v)) {
      if (v > Number(rng.max)) rng.max = Math.ceil(v * 1.2);
      if (v < Number(rng.min)) rng.min = Math.floor(v * 1.2);
    }
    row.querySelectorAll('input').forEach(i => {
      if (document.activeElement === i) return;
      if (i.type === 'checkbox') i.checked = !!v; else i.value = v;
    });
    const selEl = row.querySelector('.dbg-sel');
    if (selEl && document.activeElement !== selEl) selEl.value = v;
    const it = itemOf(path);
    const changed = it && Math.abs(v - it.def) > 1e-9;
    row.classList.toggle('chg', !!changed);
    const now = row.querySelector('.dbg-now');
    if (changed && !now) { const m = row.querySelector('.dbg-meta'); if (m) { const s = document.createElement('span'); s.className = 'dbg-now'; s.textContent = '现 ' + fmt(v); m.appendChild(s); } }
    else if (!changed && now) now.remove();
    else if (now) now.textContent = '现 ' + fmt(v);
  }

  function renderDiffBar() {
    if (!host) return;
    const keys = Object.keys(state.diffs);
    const foot = host.querySelector('.dbg-foot');
    foot.innerHTML = keys.length
      ? `已改 <b>${keys.length}</b> 项：` + keys.slice(0, 8).map(k => `${k}→${fmt(state.diffs[k])}`).join(' · ') + (keys.length > 8 ? ' …' : '')
      : '未改动（改动会自动存到 localStorage，刷新页面后继续生效）';
  }

  function copyDiff() {
    const txt = JSON.stringify(state.diffs, null, 1);
    try { navigator.clipboard && navigator.clipboard.writeText(txt); } catch (e) { /* 剪贴板不可用时忽略 */ }
    const f = host.querySelector('.dbg-foot');
    f.textContent = '改动 JSON 已复制（' + Object.keys(state.diffs).length + ' 项）：' + txt.slice(0, 120);
  }

  // ---------- 开关 ----------
  function open() {
    if (!state.active) return;
    ensureHost();
    // 默认只看当前手持武器那一组：一上来渲 875 行会明显顿一下
    if (!state.group && typeof game !== 'undefined' && game && game.player && game.player.weapon) {
      const g = groups().find(x => x.id === '武器/' + game.player.weapon);
      if (g) state.group = g.id;
    }
    state.open = true;
    host.classList.remove('hidden');
    render();
  }
  function close() { state.open = false; if (host) host.classList.add('hidden'); }
  function toggle() { state.open ? close() : open(); }

  function setMode(training) {
    state.active = !!training;
    if (!state.active) close();
    if (typeof document === 'undefined') return;
    const btn = document.getElementById('dbgGear');
    if (btn) btn.classList.toggle('hidden', !state.active);
    if (state.active) {
      const n = Object.keys(state.diffs).length;
      ensureHost();
      const b = host.querySelector('.dbg-banner');
      if (n) { b.classList.remove('hidden'); b.textContent = `已恢复上次调试：${n} 项改动仍在生效`; }
      else b.classList.add('hidden');
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', e => {
      if (e.key === 'F2') { e.preventDefault(); toggle(); }
    });
    window.addEventListener('DOMContentLoaded', () => {
      const n = load();
      if (n && typeof console !== 'undefined') console.log('[Debugger] 已重放 ' + n + ' 项调试改动');
      const btn = document.getElementById('dbgGear');
      if (btn) btn.addEventListener('click', toggle);
    });
  }

  return {
    // 注意不要再加一个叫 open 的 getter：下面的 open() 方法会把它覆盖掉（对象字面量后写胜出）。
    get isOpen() { return state.open; },
    get diffs() { return state.diffs; },
    get active() { return state.active; },
    // 只有「勾了暂停」且「面板开着」才冻结主循环 —— 默认不暂停，边打边调才是这个面板的意义
    get pauseGame() { return state.pause && state.open; },
    open, close, toggle, setMode, apply, readPath, writePath, refreshEntities, itemOf,
    groupIds: () => groups().map(g => ({ id: g.id, 条数: g.items.length })),
    runtimePaths: () => runtimeItems().map(i => i.path),
    get count() { return groups().reduce((a, g) => a + g.items.length, 0); },
  };
})();
