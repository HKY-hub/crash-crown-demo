// ============ 设置页：可调数值定义 + 本地持久化 + 即时应用 ============
// 新增设置项：往 SETTING_DEFS 里加一条即可。
// type 支持：range（滑块）/ select（下拉，options=[{v,l}]）/ action（按钮，action()）。
// when：动态显隐（如训练营分组仅训练中显示）；persist:false：不持久化（如阵营下拉，get() 读实时状态）。
// bind：range 可绑定到某 select（如「该枪散布倍率」绑定「选择武器」，切换武器回填对应值）。
// fmt 决定右侧数值显示；apply 在变更时立即生效并自动保存到 localStorage。
const Settings = (() => {
  const KEY = 'zombie_settings';
  const STORAGE_OK = (() => { try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); return true; } catch (e) { return false; } })();

  // 安全读取当前玩家：settings.js 初始化早于 game.js 的 `let game`，此时 typeof game 会因 TDZ 抛错，故用 try 兜底
  function livePlayer() {
    try { return (typeof game !== 'undefined' && game && game.player) ? game.player : null; }
    catch (e) { return null; }
  }

  const _gunOpts = (typeof GUN_KEYS !== 'undefined' ? GUN_KEYS : []).map(k => ({ v: k, l: WEAPONS[k] ? WEAPONS[k].name : k }));

  const SETTING_DEFS = [
    {
      id: 'masterVol', label: '主音量', group: '音频',
      type: 'range', min: 0, max: 1, step: 0.05, def: 0.5,
      fmt: v => Math.round(v * 100) + '%',
      apply: v => { AudioFX.setMasterVol(v); },
    },
    {
      id: 'shakeMul', label: '震屏强度', group: '画面',
      type: 'range', min: 0, max: 2, step: 0.05, def: 1,
      fmt: v => v <= 0 ? '关闭' : Math.round(v * 100) + '%',
      apply: v => { CFG.SHAKE_MUL = v; },
    },
    {
      id: 'adsIronZoom', label: '机瞄倍率（无瞄具开镜）', group: '画面',
      type: 'range', min: 1, max: 2, step: 0.05, def: 1.25,
      fmt: v => v.toFixed(2) + 'x',
      apply: v => { CFG.ADS_IRON_ZOOM = v; },
    },
    {
      id: 'teamFadeRange', label: '队友虚化距离', group: '画面',
      type: 'range', min: 0, max: 300, step: 10, def: 100,
      fmt: v => v <= 0 ? '关闭' : Math.round(v) + 'px',
      apply: v => { CFG.TEAM_FADE_RANGE = v; },
    },
    {
      id: 'teamFadeMin', label: '队友贴脸透明度', group: '画面',
      type: 'range', min: 0, max: 1, step: 0.05, def: 0.35,
      fmt: v => v >= 1 ? '不虚化' : Math.round(v * 100) + '%',
      apply: v => { CFG.TEAM_FADE_MIN = v; },
    },
    // ---------- 开镜 ----------
    {
      id: 'adsMode', label: '开镜方式', group: '开镜', type: 'select', def: 'hold',
      options: [{ v: 'hold', l: '长按开镜' }, { v: 'toggle', l: '点击开镜（再点关闭）' }],
      apply: v => { CFG.ADS_MODE = v; },
    },
    {
      id: 'adsSpeedMul', label: '开镜速度', group: '开镜',
      type: 'range', min: 0.4, max: 3, step: 0.1, def: 1,
      fmt: v => v.toFixed(1) + 'x',
      apply: v => { CFG.ADS_SPEED_MUL = v; },
    },
    // ---------- 武器·弹道 ----------
    {
      id: 'spreadMul', label: '全局散布倍率', group: '武器·弹道',
      type: 'range', min: 0.5, max: 3, step: 0.05, def: 1,
      fmt: v => v.toFixed(2) + 'x',
      apply: v => { CFG.GLOBAL_SPREAD_MUL = v; },
    },
    {
      id: 'bloomMul', label: '弹道扩散增长', group: '武器·弹道',
      type: 'range', min: 0, max: 3, step: 0.05, def: 1,
      fmt: v => v <= 0 ? '关闭' : v.toFixed(2) + 'x',
      apply: v => { CFG.GLOBAL_BLOOM_MUL = v; },
    },
    {
      id: 'recoilMul', label: '后坐力倍率', group: '武器·弹道',
      type: 'range', min: 0, max: 3, step: 0.05, def: 1,
      fmt: v => v <= 0 ? '关闭' : v.toFixed(2) + 'x',
      apply: v => { CFG.GLOBAL_RECOIL_MUL = v; },
    },
    {
      id: 'rpmMul', label: '射速倍率', group: '武器·弹道',
      type: 'range', min: 0.5, max: 3, step: 0.05, def: 1,
      fmt: v => v.toFixed(2) + 'x',
      apply: v => { CFG.GLOBAL_RPM_MUL = v; },
    },
    {
      id: 'reloadMul', label: '换弹速度倍率', group: '武器·弹道',
      type: 'range', min: 0.5, max: 3, step: 0.05, def: 1,
      fmt: v => v.toFixed(2) + 'x',
      apply: v => { CFG.GLOBAL_RELOAD_MUL = v; },
    },
    // ---------- 武器·单枪散布（选择武器 + 该枪散布倍率联动） ----------
    {
      id: 'spreadWeapon', label: '选择武器', group: '武器·单枪散布',
      type: 'select', def: 'm4a1', options: _gunOpts, bind: 'spreadWeaponMul',
      apply: v => { /* 值由联动滑块写入 override；此处仅记录选择 */ },
    },
    {
      id: 'spreadWeaponMul', label: '该枪散布倍率', group: '武器·单枪散布',
      type: 'range', min: 0.1, max: 3, step: 0.05, def: 1, bind: 'spreadWeapon', bindSrc: 'GUN_SPREAD_OVERRIDE',
      fmt: v => v.toFixed(2) + 'x',
      apply: v => { CFG.GUN_SPREAD_OVERRIDE[values.spreadWeapon || 'm4a1'] = v; },
    },
    // ---------- 数值·人类 ----------
    {
      id: 'humanHp', label: '人类血量', group: '数值·人类',
      type: 'range', min: 50, max: 1000, step: 10, def: 100,
      fmt: v => Math.round(v),
      apply: v => {
        CFG.HUMAN_HP = v;
        const p = livePlayer();
        if (p && p.kind === 'human') { p.maxHp = v; p.hp = v; }
      },
    },
    {
      id: 'humanSpeedMul', label: '人类移速', group: '数值·人类',
      type: 'range', min: 0.5, max: 2, step: 0.05, def: 1,
      fmt: v => v.toFixed(2) + 'x',
      apply: v => { CFG.HUMAN_SPEED = Math.round(275 * v); },
    },
    {
      id: 'jumpMul', label: '跳跃力度', group: '数值·人类',
      type: 'range', min: 0.5, max: 1.5, step: 0.05, def: 1,
      fmt: v => v.toFixed(2) + 'x',
      apply: v => { CFG.JUMP_V = Math.round(-745 * v); },
    },
    {
      id: 'gravity', label: '重力', group: '数值·人类',
      type: 'range', min: 500, max: 4000, step: 50, def: 2100,
      fmt: v => Math.round(v),
      apply: v => { CFG.G = v; },
    },
    {
      id: 'backpackCd', label: '背包切换CD(秒)', group: '数值·人类',
      type: 'range', min: 0, max: 10, step: 0.5, def: 3,
      fmt: v => v.toFixed(1) + 's',
      apply: v => { CFG.BACKPACK_CD = v; },
    },
    {
      id: 'attribCd', label: '属性切换CD(秒)', group: '数值·人类',
      type: 'range', min: 0, max: 60, step: 1, def: 30,
      fmt: v => Math.round(v) + 's',
      apply: v => { CFG.ATTRIB_CD = v; },
    },
    // ---------- 数值·僵尸 ----------
    {
      id: 'zombieHpMul', label: '僵尸血量倍率', group: '数值·僵尸',
      type: 'range', min: 0.1, max: 5, step: 0.05, def: 1,
      fmt: v => v.toFixed(2) + 'x',
      apply: v => {
        CFG.ZOMBIE_HP_MUL = v;
        const p = livePlayer();
        if (p && p.kind === 'zombie') { p.maxHp = p.hp = Math.round(ZOMBIES[p.ztype].hp * v); }
      },
    },
    {
      id: 'zombieSpeedMul', label: '僵尸移速倍率', group: '数值·僵尸',
      type: 'range', min: 0.5, max: 3, step: 0.05, def: 1,
      fmt: v => v.toFixed(2) + 'x',
      apply: v => {
        CFG.ZOMBIE_SPEED_MUL = v;
        const p = livePlayer();
        if (p && p.kind === 'zombie') { p.speed = Math.round(ZOMBIES[p.ztype].speed * v); }
      },
    },
    {
      id: 'zombieCdMul', label: '僵尸攻击CD倍率', group: '数值·僵尸',
      type: 'range', min: 0.2, max: 3, step: 0.05, def: 1,
      fmt: v => v.toFixed(2) + 'x',
      apply: v => { CFG.ZOMBIE_CD_MUL = v; },
    },
    {
      id: 'zombieDmgMul', label: '僵尸攻击力倍率', group: '数值·僵尸',
      type: 'range', min: 0.1, max: 3, step: 0.05, def: 1,
      fmt: v => v.toFixed(2) + 'x',
      apply: v => { CFG.ZOMBIE_DMG_MUL = v; },
    },
    // ---------- 投掷 ----------
    {
      id: 'throwCharge', label: '投掷蓄力时间(秒)', group: '投掷',
      type: 'range', min: 0.2, max: 3, step: 0.05, def: 1.2,
      fmt: v => v.toFixed(2) + 's',
      apply: v => { CFG.THROW_CHARGE = v; },
    },
    {
      id: 'throwPowerMax', label: '投掷抛物线力度', group: '投掷',
      type: 'range', min: 1, max: 2.5, step: 0.05, def: 1.65,
      fmt: v => v.toFixed(2) + 'x',
      apply: v => { CFG.THROW_POWER_MAX = v; },
    },
    // ---------- 游戏 ----------
    {
      id: 'roundTime', label: '单局时长(秒)', group: '游戏',
      type: 'range', min: 60, max: 1200, step: 10, def: 480,
      fmt: v => Math.round(v) + 's',
      apply: v => { CFG.ROUND_TIME = v; },
    },
    {
      id: 'escapeTime', label: '撤离所需秒数', group: '游戏',
      type: 'range', min: 1, max: 10, step: 0.5, def: 3,
      fmt: v => v.toFixed(1) + 's',
      apply: v => { CFG.ESCAPE_TIME = v; },
    },
    {
      id: 'aggroRange', label: '索敌范围', group: '游戏',
      type: 'range', min: 100, max: 900, step: 10, def: 470,
      fmt: v => Math.round(v) + 'px',
      apply: v => { CFG.AGGRO_RANGE = v; },
    },
    // ---------- 训练营（仅训练中显示） ----------
    {
      id: 'camp', label: '阵营', group: '训练营', type: 'select',
      def: 'human', persist: false,
      when: () => typeof Training !== 'undefined' && Training.mode,
      options: [{ v: 'human', l: '人类' }, { v: 'zombie', l: '僵尸' }],
      get: () => (typeof game !== 'undefined' && game && game.player) ? game.player.faction : 'human',
      apply: v => {
        try { if (typeof Training !== 'undefined' && Training.mode && Training.switchCamp) Training.switchCamp(v); }
        catch (e) { /* settings 初始化早于 game.js，TDZ 阶段跳过 */ }
      },
    },
    {
      id: 'spawnHumanDummy', label: '生成人类木桩', group: '训练营', type: 'action',
      when: () => typeof Training !== 'undefined' && Training.mode,
      action: () => { if (typeof Training !== 'undefined' && Training.spawnDummy) Training.spawnDummy('human'); },
    },
    {
      id: 'spawnZombieDummy', label: '生成僵尸木桩', group: '训练营', type: 'action',
      when: () => typeof Training !== 'undefined' && Training.mode,
      action: () => { if (typeof Training !== 'undefined' && Training.spawnDummy) Training.spawnDummy('zombie'); },
    },
    {
      id: 'clearDummies', label: '清空木桩', group: '训练营', type: 'action',
      when: () => typeof Training !== 'undefined' && Training.mode,
      action: () => { if (typeof Training !== 'undefined' && Training.clearDummies) Training.clearDummies(); },
    },
  ];

  let values = null;
  let paused = false;

  function load() {
    if (values) return;
    values = {};
    for (const s of SETTING_DEFS) if (s.type !== 'action') values[s.id] = s.def;
    if (STORAGE_OK) {
      try {
        const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
        for (const s of SETTING_DEFS) {
          if (s.type === 'action' || s.persist === false) continue;
          if (s.type === 'select') {
            if (raw[s.id] != null && s.options.some(o => String(o.v) === String(raw[s.id]))) values[s.id] = String(raw[s.id]);
          } else {
            const v = Number(raw[s.id]);
            if (isFinite(v)) values[s.id] = Math.max(s.min, Math.min(s.max, v));
          }
        }
      } catch (e) { /* 解析失败用默认值 */ }
    }
  }

  function save() {
    if (!STORAGE_OK) return;
    try {
      const out = {};
      for (const s of SETTING_DEFS) if (s.type !== 'action' && s.persist !== false) out[s.id] = values[s.id];
      localStorage.setItem(KEY, JSON.stringify(out));
    } catch (e) { /* 忽略 */ }
  }

  // 应用某设置项：写入值 + 调用 apply（无 apply 的纯展示项仅存储）
  function set(id, v) {
    const s = SETTING_DEFS.find(x => x.id === id);
    if (!s || s.type === 'action') return;
    let n;
    if (s.type === 'select') n = String(v);
    else n = Math.max(s.min, Math.min(s.max, Number(v)));
    values[id] = n;
    if (s.apply) s.apply(n);
    save();
  }

  // 恢复全部默认并应用到游戏
  function reset() {
    for (const s of SETTING_DEFS) if (s.type !== 'action') values[s.id] = s.def;
    CFG.GUN_SPREAD_OVERRIDE = {};
    applyAll();
    save();
  }

  // 把所有已保存值应用到游戏（页面加载/恢复默认后调用）
  function applyAll() {
    for (const s of SETTING_DEFS) if (s.apply) s.apply(values[s.id]);
  }

  // 把设置表单渲染进指定容器（菜单页 / 局内悬浮层共用，打开时重建以显示最新值）
  function mount(container) {
    load();
    if (!container) return;
    const defs = SETTING_DEFS.filter(s => !s.when || s.when());
    const groups = [];
    for (const s of defs) {
      let g = groups.find(x => x.name === s.group);
      if (!g) { g = { name: s.group, items: [] }; groups.push(g); }
      g.items.push(s);
    }
    const rowHTML = s => {
      if (s.type === 'action') {
        return `<div class="set-row set-row-action" data-id="${s.id}">
          <button type="button" class="set-action">${s.label}</button>
        </div>`;
      }
      if (s.type === 'select') {
        const cur = s.get ? s.get() : (values[s.id] != null ? values[s.id] : s.def);
        const opts = s.options.map(o => `<option value="${o.v}" ${String(o.v) === String(cur) ? 'selected' : ''}>${o.l}</option>`).join('');
        return `<div class="set-row" data-id="${s.id}">
          <span class="set-label">${s.label}</span>
          <select class="set-select">${opts}</select>
        </div>`;
      }
      let v = values[s.id];
      if (s.bind && CFG[s.bindSrc || 'GUN_SPREAD_OVERRIDE']) {
        const ov = CFG[s.bindSrc || 'GUN_SPREAD_OVERRIDE'];
        const selK = values[s.bind] != null ? values[s.bind] : ((SETTING_DEFS.find(x => x.id === s.bind) || {}).def);
        if (selK != null && ov[selK] != null) v = ov[selK];
      }
      return `<div class="set-row" data-id="${s.id}">
        <span class="set-label">${s.label}</span>
        <input type="range" class="set-range" min="${s.min}" max="${s.max}" step="${s.step}" value="${v}">
        <span class="set-val">${s.fmt(v)}</span>
      </div>`;
    };
    container.innerHTML =
      `<div class="set-groups">${groups.map(g => `
        <div class="set-group">
          <div class="set-group-title">${g.name}</div>
          ${g.items.map(rowHTML).join('')}
        </div>`).join('')}
      </div>
      <div class="set-foot">
        <button id="setResetBtn" class="start-btn ghost">恢 复 默 认</button>
        <span class="set-saved">调整即生效 · 自动保存</span>
      </div>`;
    for (const s of defs) {
      if (s.type === 'action') {
        const btn = container.querySelector(`.set-row[data-id="${s.id}"] .set-action`);
        if (btn) btn.addEventListener('click', () => { s.action(); });
        continue;
      }
      if (s.type === 'select') {
        const sel = container.querySelector(`.set-row[data-id="${s.id}"] .set-select`);
        if (!sel) continue;
        sel.addEventListener('change', () => {
          const v = sel.value;
          if (s.persist !== false) set(s.id, v);
          else if (s.apply) s.apply(v);
          // 单枪散布联动：切换武器后回填该枪倍率
          if (s.bind) {
            const rangeRow = container.querySelector(`.set-row[data-id="${s.bind}"]`);
            const ov = CFG[s.bindSrc || 'GUN_SPREAD_OVERRIDE'] || {};
            const mul = ov[v] != null ? ov[v] : 1;
            if (rangeRow) {
              const inp = rangeRow.querySelector('.set-range');
              const valEl = rangeRow.querySelector('.set-val');
              const def = SETTING_DEFS.find(x => x.id === s.bind);
              inp.value = mul;
              if (def) valEl.textContent = def.fmt(mul);
            }
          }
        });
        continue;
      }
      const row = container.querySelector(`.set-row[data-id="${s.id}"]`);
      const inp = row.querySelector('.set-range');
      inp.addEventListener('input', () => {
        row.querySelector('.set-val').textContent = s.fmt(Number(inp.value));
      });
      inp.addEventListener('change', () => {
        set(s.id, Number(inp.value));
        row.querySelector('.set-val').textContent = s.fmt(values[s.id]);
      });
    }
    const resetBtn = container.querySelector('#setResetBtn');
    if (resetBtn) resetBtn.addEventListener('click', () => {
      // 走子系统 2.3 的弹窗管理器，不再用原生 confirm（会冻结渲染循环）
      if (typeof Overlay === 'undefined') { reset(); mount(container); return; }
      Overlay.confirm({
        title: '恢复默认设置', alert: true, okText: '全部恢复默认', cancelText: '取消',
        text: '将把画质、音频、开镜、弹道等全部设置项恢复为默认值。',
        onOk: () => { reset(); mount(container); Toast.ok('设置已恢复默认'); },
      });
    });
  }

  // 重建当前可见的设置表单（局内悬浮层或主菜单设置 tab）
  function refresh() {
    const ov = document.getElementById('settingsUI');
    if (ov && !ov.classList.contains('hidden')) {
      const host = ov.querySelector('.set-host');
      if (host) mount(host);
      return;
    }
    const sp = document.getElementById('settingsPanel');
    if (sp && !sp.classList.contains('hidden')) {
      const host = sp.querySelector('.set-host');
      if (host) mount(host);
    }
  }

  // ---------- 局内悬浮设置（暂停游戏） ----------
  function open() {
    paused = true;
    const ov = document.getElementById('settingsUI');
    if (!ov) return;
    ov.classList.remove('hidden');
    refresh();
  }

  function close() {
    paused = false;
    const ov = document.getElementById('settingsUI');
    if (ov) {
      ov.classList.add('hidden');
      const host = ov.querySelector('.set-host');
      if (host) host.innerHTML = '';
    }
  }

  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && paused) close();
    });
  }

  load();
  applyAll();

  return {
    get paused() { return paused; },
    set paused(v) { paused = !!v; },
    open, close, refresh, mount, applyAll, set, reset,
    get values() { return values; },
  };
})();
