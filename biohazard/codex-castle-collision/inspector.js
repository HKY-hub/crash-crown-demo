/* Read-only runtime collision inspector. Resets are explicit user actions delegated
 * to the real entity factory bridge; no movement or collision rules live here. */
(function (global) {
  'use strict';
  const enabled = new URLSearchParams(global.location.search).get('castleCollision') === '1';
  const scriptURL = document.currentScript && document.currentScript.src || new URL('codex-castle-collision/inspector.js', global.location.href).href;
  const COLORS = { wall: '#ff79cd', floor: '#56dcff', oneway: '#6fffac', stair: '#ffc567', death: '#ff5252' };
  let bridge = null, panel = null, status = null, checkpoint = null, bodySelect = null;
  let overlay = true, labels = true, lastRefresh = 0, lastModel = null, lastBody = null;
  let lastPointKey = '', resetPending = false, notice = '';
  let report = null, reportSelect = null, reportTitle = null, reportInfo = null, selectedResult = null, reportLoading = false;

  function state() { return bridge && typeof bridge.getState === 'function' ? bridge.getState() || {} : {}; }
  function source(level) { return level && level.castle && (level.castle.source || level.castle) || {}; }
  function solids(level) { return level && Array.isArray(level.solids) ? level.solids : []; }
  function id(s) { return String(s.id || s.sourceSurfaceId || s.sourceRampId || s.sourceId || s.sid || '无源ID'); }
  function kind(s) {
    const t = String(s.collisionKind || s.kind || s.sourceKind || '').toLowerCase();
    if (s.stair || s.ramp || s.sourceRampId || /tread|stair|ramp/.test(t)) return 'stair';
    if (s.wall || /wall/.test(t)) return 'wall';
    if (s.oneway) return 'oneway';
    return 'floor';
  }
  function overlap(a, b) { return a.x < b.x + b.w - .01 && a.x + a.w > b.x + .01 && a.y < b.y + b.h - .01 && a.y + a.h > b.y + .01; }
  function boxOf(e) { return { x: e.x, y: e.y, w: e.w, h: e.h }; }
  function analyze(e, level) {
    if (!e) return null;
    const all = solids(level), feet = e.y + e.h, box = boxOf(e), data = source(level);
    const supports = all.filter(s => e.x < s.x + s.w - .01 && e.x + e.w > s.x + .01 && Math.abs(feet - s.y) <= 2);
    const embedded = all.filter(s => !s.oneway && overlap(box, s));
    const roofs = all.filter(s => !s.oneway && e.x < s.x + s.w && e.x + e.w > s.x && s.y + s.h <= e.y + .01)
      .sort((a, b) => b.y + b.h - a.y - a.h);
    const rooms = (data.rooms || []).filter(r => e.x + e.w / 2 >= r.x0 && e.x + e.w / 2 <= r.x1 && feet > r.top && feet <= r.floor + 2);
    const region = (data.regions || []).find(r => e.x + e.w / 2 >= r.x0 && e.x + e.w / 2 < r.x1);
    const levelEntries = Object.entries(data.levels || level && level.castle && level.castle.levels || {});
    levelEntries.sort((a, b) => Math.abs(a[1] - feet) - Math.abs(b[1] - feet));
    return { box, feet, supports, embedded, roof: roofs[0] || null, rooms, region,
      layer: levelEntries.length ? levelEntries[0][0] + (Math.abs(levelEntries[0][1] - feet) > 3 ? '附近' : '') : '—' };
  }
  function bodySize(body) {
    const s = state();
    const declared = bridge && bridge.bodySpecs && bridge.bodySpecs[body];
    if (declared) return { w: declared.w, h: declared.h };
    const data = source(s.level);
    const raw = data.world && data.world[body === 'human' ? 'humanBody' : 'motherTitanBody'];
    return raw ? { w: raw[0], h: raw[1] } : (body === 'human' ? { w: 22, h: 36 } : { w: 62, h: 86 });
  }
  function checkpointsFor(body, level) {
    if (bridge && typeof bridge.getCheckpoints === 'function') return bridge.getCheckpoints({ body }) || [];
    const size = bodySize(body), all = solids(level);
    // Point x is the entity's left edge; y is its foot anchor, as in game.js.
    return (source(level).points || []).filter(p => {
      const box = { x: p.x, y: p.y - size.h, w: size.w, h: size.h };
      return !all.some(s => !s.oneway && overlap(box, s)) && all.some(s => box.x < s.x + s.w && box.x + box.w > s.x && Math.abs(p.y - s.y) <= 2);
    });
  }
  function refreshPoints(level, force) {
    if (!checkpoint) return;
    const body = bodySelect.value, choices = checkpointsFor(body, level);
    const key = body + ':' + choices.map(p => p.id).join('|');
    if (!force && key === lastPointKey && level === lastModel) return;
    const wanted = checkpoint.value;
    checkpoint.replaceChildren();
    for (const p of choices) {
      const option = document.createElement('option');
      option.value = p.id;
      option.textContent = p.id + ' · ' + (p.region || '') + ' ' + (p.lv || '') + ' (' + p.x + ',' + p.y + ')';
      checkpoint.appendChild(option);
    }
    if (choices.some(p => p.id === wanted)) checkpoint.value = wanted;
    lastPointKey = key; lastModel = level; lastBody = body;
    if (!choices.length) notice = '该体型暂无合法检查点；保留原始点位并等待修复。';
    else if (notice === '该体型暂无合法检查点；保留原始点位并等待修复。') notice = '';
    if (selectedResult) showReportResult();
  }
  function resultPosition(result) {
    const at = result.final || result.failurePosition || result.position || result.start || {};
    return { x: Number(at.x), feet: Number(at.feet == null ? at.y : at.feet) };
  }
  function showReportResult() {
    if (!reportInfo || !selectedResult) return;
    const r = selectedResult, at = resultPosition(r), data = source(state().level);
    const region = (data.regions || []).find(v => at.x >= v.x0 && at.x < v.x1);
    const candidates = checkpointsFor(r.body, state().level).filter(p => region && (p.region === region.id || (!p.region && p.x >= region.x0 && p.x < region.x1)));
    candidates.sort((a,b) => Math.hypot(a.x-at.x,a.y-at.feet)-Math.hypot(b.x-at.x,b.y-at.feet));
    const suggested = candidates[0];
    const blockers = [...new Set([...(r.blocking || []), ...(r.blockers || [])])];
    reportInfo.textContent = [
      '合同 ' + r.id,
      '体型 ' + r.body + ' / 方向 ' + r.direction + ' / ' + r.status,
      '终止坐标 x=' + (Number.isFinite(at.x) ? at.x : '未记录') + ' 脚y=' + (Number.isFinite(at.feet) ? at.feet : '未记录'),
      '目标源 ' + (r.sourceId || r.edgeId || '未记录'),
      '阻挡源ID ' + (blockers.join(', ') || '未捕获，需结合该合同轨迹定位'),
      '所在区域 ' + (region ? region.id + ' ' + region.name : '未定位'),
      suggested ? '建议检查点 ' + suggested.id + ' (' + suggested.x + ',' + suggested.y + ')：请手动选择相应体型和该点，再按重置。'
        : '该区域暂无同体型合法检查点；不会自动移动玩家。'
    ].join('\n');
  }
  function renderReport() {
    const rows = report.results;
    const unverified = rows.filter(r => r.required !== false && /^(UNVERIFIED|NOT_RUN|PENDING|SKIPPED)$/.test(r.status || ''));
    const failed = rows.filter(r => r.required !== false && r.pass !== true && r.status !== 'PASS' && !unverified.includes(r));
    const missing = Math.max(0, Number(report.coverage && report.coverage.contracts || rows.length) - rows.length);
    reportTitle.textContent = '必需失败 ' + failed.length + ' · 未验证 ' + (unverified.length + missing);
    const wanted = reportSelect.value;
    reportSelect.replaceChildren();
    const empty = element('option', '选择失败或未验证合同（不会移动玩家）', reportSelect); empty.value = '';
    for (const r of failed.concat(unverified)) {
      const option = element('option', (unverified.includes(r) ? '[未验证] ' : '[失败] ') + r.id + ' · ' + r.body + ' · ' + r.direction, reportSelect);
      option.value = r.id;
    }
    reportSelect.value = failed.concat(unverified).some(r => r.id === wanted) ? wanted : '';
    selectedResult = rows.find(r => r.id === reportSelect.value) || null;
    if (selectedResult) showReportResult();
    else reportInfo.textContent = failed.length || unverified.length ? '只读报告；选择合同查看位置及同区域检查点建议。'
      : '本报告必需失败为0。正式生化追逃与用户人工跑图仍待验。';
  }
  async function loadReport() {
    if (reportLoading || !reportTitle) return;
    reportLoading = true;
    reportTitle.textContent = '通行报告读取中…';
    try {
      const url = bridge.reportUrl || new URL('reports/final-summary.json', scriptURL).href;
      const response = await global.fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const parsed = await response.json();
      if (!Array.isArray(parsed.results)) throw new Error('报告缺少 results');
      // Older bounded reports stored point-to-route outcomes beside results.
      // Include all of them, including branches without a nested result.
      // Current reports may already include these IDs; never double-count.
      const rows = new Map(parsed.results.map(r=>[r.id,r]));
      for(const link of parsed.pointMainRouteLinks||[]) {
        const point=(source(state().level).points||[]).find(p=>p.id===link.pointId);
        const r=link.result||{id:'point-main:'+link.pointId+':'+link.body,kind:'pointMainRoute',
          sourceId:link.pointId,body:link.body,direction:link.port?.part||'route',required:true,
          pass:link.pass,status:link.status,support:link.support||[],
          start:point?{x:point.x,feet:point.y}:undefined,port:link.port};
        if(!rows.has(r.id))rows.set(r.id,r);
      }
      report = {...parsed,results:[...rows.values()]};
      renderReport();
    } catch (error) {
      reportTitle.textContent = '最终通行报告未就绪';
      reportInfo.textContent = '报告尚未生成或无法读取；通行结果暂未验证。手动跑图与碰撞叠层仍可使用。';
      reportSelect.replaceChildren();
      const option = element('option', '无可读取的最终报告', reportSelect); option.value = '';
      selectedResult = null;
    } finally { reportLoading = false; }
  }
  async function resetExplicit() {
    if (!bridge || typeof bridge.reset !== 'function' || resetPending || !checkpoint.value) return;
    resetPending = true;
    notice = '正在从检查点初始化真实实体…';
    try {
      const s = state();
      if (s.Input && s.Input.keys) Object.keys(s.Input.keys).forEach(k => { s.Input.keys[k] = false; });
      if (s.Input && s.Input.mouse) { s.Input.mouse.down = false; s.Input.mouse.rDown = false; }
      await bridge.reset({ pointId: checkpoint.value, body: bodySelect.value });
      notice = '已明确重置至 ' + checkpoint.value + '；后续由正常输入与物理驱动。';
    } catch (error) {
      notice = '重置失败：' + (error && error.message || String(error));
    } finally { resetPending = false; lastRefresh = 0; }
  }
  function element(tag, text, parent) {
    const el = document.createElement(tag);
    if (text) el.textContent = text;
    if (parent) parent.appendChild(el);
    return el;
  }
  function attach(nextBridge) {
    if (!enabled) return false;
    if (!nextBridge || typeof nextBridge.getState !== 'function' || typeof nextBridge.reset !== 'function') throw new TypeError('Inspector requires getState() and reset({pointId,body})');
    bridge = nextBridge;
    if (panel) return true;
    const css = document.createElement('style');
    css.textContent = '#castle-collision-inspector{position:fixed;right:12px;bottom:12px;z-index:10020;width:298px;max-width:calc(100vw - 24px);color:#eff6ff;background:rgba(8,14,23,.94);border:1px solid #50718e;border-radius:7px;padding:9px;font:12px/1.5 sans-serif;box-shadow:0 2px 14px #0008;box-sizing:border-box}#castle-collision-inspector button,#castle-collision-inspector select{font:inherit;color:#edf5ff;background:#1c2c40;border:1px solid #58708b;border-radius:4px;padding:4px 6px}#castle-collision-inspector select{width:100%;margin:3px 0 6px}#castle-collision-inspector .cci-title{display:flex;justify-content:space-between;align-items:center;gap:8px}#castle-collision-inspector .cci-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:5px}#castle-collision-inspector .cci-status{white-space:pre-wrap;overflow-wrap:anywhere;max-height:166px;overflow:auto;font:11px/1.4 monospace;margin:7px 0 0}#castle-collision-inspector .cci-note{color:#9fb1c8;font-size:10px}#castle-collision-inspector.cci-compact .cci-body{display:none}';
    document.head.appendChild(css);
    panel = element('section', '', document.body); panel.id = 'castle-collision-inspector'; panel.setAttribute('aria-label', '古堡碰撞调试');
    const title = element('div', '', panel); title.className = 'cci-title';
    element('strong', '真实碰撞 · 手动跑图', title);
    const compact = element('button', '收起', title); compact.type = 'button';
    compact.addEventListener('click', () => { panel.classList.toggle('cci-compact'); compact.textContent = panel.classList.contains('cci-compact') ? '展开' : '收起'; });
    const content = element('div', '', panel); content.className = 'cci-body';
    element('label', '实际实体规格（选择后需点击重置）', content);
    bodySelect = element('select', '', content); bodySelect.setAttribute('aria-label', '测试体型');
    for (const item of [['human', '人类 · 真实工厂'], ['motherTitan', '泰坦母体 · mother_titan']]) {
      const option = element('option', item[1], bodySelect); option.value = item[0];
    }
    bodySelect.addEventListener('change', () => { refreshPoints(state().level, true); lastRefresh = 0; });
    element('label', '合法检查点（最终固定坐标）', content);
    checkpoint = element('select', '', content); checkpoint.setAttribute('aria-label', '检查点');
    const reset = element('button', '从该点重新开始', content); reset.type = 'button'; reset.addEventListener('click', resetExplicit);
    const controls = element('div', '', content); controls.className = 'cci-row';
    const overLabel = element('label', '', controls), overCheck = element('input', '', overLabel); overCheck.type = 'checkbox'; overCheck.checked = true;
    overLabel.appendChild(document.createTextNode('碰撞叠层 F8')); overCheck.addEventListener('change', () => { overlay = overCheck.checked; });
    const idLabel = element('label', '', controls), idCheck = element('input', '', idLabel); idCheck.type = 'checkbox'; idCheck.checked = true;
    idLabel.appendChild(document.createTextNode('附近源ID')); idCheck.addEventListener('change', () => { labels = idCheck.checked; });
    const legend = element('div', '', content); legend.className = 'cci-row';
    for (const [k, label] of [['wall', '墙'], ['floor', '实体楼板'], ['oneway', '单向'], ['stair', '踏面'], ['death', '死亡线']]) { const span = element('span', label, legend); span.style.color = COLORS[k]; }
    const reportBox = element('details', '', content);
    reportTitle = element('summary', '最终通行报告未就绪', reportBox);
    reportSelect = element('select', '', reportBox); reportSelect.setAttribute('aria-label', '失败连接');
    reportSelect.addEventListener('change', () => {
      selectedResult = report && report.results.find(r => r.id === reportSelect.value) || null;
      if (selectedResult) showReportResult();
      else reportInfo.textContent = '选择合同查看位置；不会自动移动玩家。';
    });
    reportInfo = element('pre', '', reportBox); reportInfo.className = 'cci-status'; reportInfo.style.maxHeight = '132px';
    const reloadReport = element('button', '刷新报告', reportBox); reloadReport.type = 'button'; reloadReport.addEventListener('click', loadReport);
    status = element('pre', '等待实际游戏加载…', content); status.className = 'cci-status';
    const note = element('div', 'F9 收起面板 · 无自动纠位 · 本入口不开放生化回合', content); note.className = 'cci-note';
    // UI clicks and key presses must not shoot or move the game character.
    panel.addEventListener('pointerdown', () => {
      const s = state();
      if (s.Input && s.Input.keys) Object.keys(s.Input.keys).forEach(k => { s.Input.keys[k] = false; });
      if (s.Input && s.Input.mouse) { s.Input.mouse.down = false; s.Input.mouse.rDown = false; }
    });
    ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'wheel', 'keydown', 'keyup'].forEach(type => panel.addEventListener(type, event => { event.stopPropagation(); }));
    global.addEventListener('keydown', event => {
      if (event.key === 'F8') { event.preventDefault(); overlay = !overlay; overCheck.checked = overlay; }
      if (event.key === 'F9') { event.preventDefault(); compact.click(); }
    });
    refreshPoints(state().level, true);
    loadReport();
    return true;
  }
  function updateStatus(game, level, now) {
    if (!panel || now - lastRefresh < 180) return;
    lastRefresh = now;
    refreshPoints(level, false);
    const e = game && game.player, d = analyze(e, level), s = state();
    if (!d) { status.textContent = '等待真实玩家实体…'; return; }
    const visual = e.kind === 'human' ? (s.CFG && s.CFG.HUMAN_VISUAL_H || 62) : null;
    const gap = d.roof ? Math.max(0, e.y - d.roof.y - d.roof.h).toFixed(1) : '无顶板';
    status.textContent = [
      '实体 ' + (e.kind === 'human' ? 'human' : e.ztype) + '  碰撞 ' + e.w + '×' + e.h + (visual ? '  美术基准 ' + visual + 'px' : ''),
      '左上 (' + e.x.toFixed(1) + ',' + e.y.toFixed(1) + ')  脚 y=' + d.feet.toFixed(1),
      '速度 (' + Number(e.vx || 0).toFixed(1) + ',' + Number(e.vy || 0).toFixed(1) + ')  ' + (e.onGround ? '着地' : '腾空') + (e.dead ? ' / 已死亡' : ''),
      '区域 ' + (d.region ? d.region.id + ' ' + d.region.name : '区域外') + '  层 ' + d.layer,
      '房间 ' + (d.rooms.map(r => r.id).join(', ') || '室外/换层'),
      '脚支撑 ' + (d.supports.map(id).join(', ') || '无'),
      '头部净空 ' + gap,
      '实体嵌入 ' + (d.embedded.map(id).join(', ') || '无'),
      notice
    ].filter(Boolean).join('\n');
  }
  function draw(ctx, game, level, projection) {
    if (!enabled || !bridge || !game || !level || !level.castle) return;
    const now = global.performance.now(); updateStatus(game, level, now);
    if (!overlay) return;
    const p = projection || {}, cam = p.cam || game.camera || { x: 0, y: 0 }, e = game.player;
    const s = state(), cfg = s.CFG || { CW: 960, CH: 540 }, input = s.Input;
    ctx.save();
    if (!p.worldTransform) {
      const sx = Number(p.shakeX || 0), sy = Number(p.shakeY || 0);
      ctx.translate(-Math.round(sx), -Math.round(sy));
      if (e && e.kind === 'human' && !e.dead && e.adsT > .01 && input && input.mouse) {
        const t = e.adsT, base = e.attFx && e.attFx.zoom > 1 ? e.attFx.zoom : cfg.ADS_IRON_ZOOM;
        const z = 1 + ((base || 1) - 1) * (1 - (1 - t) * (1 - t));
        const cx = input.mouse.x + sx, cy = input.mouse.y + sy;
        ctx.translate(cx, cy); ctx.scale(z, z); ctx.translate(-cx, -cy);
      }
    }
    ctx.lineWidth = 1; ctx.font = '9px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    let labelCount = 0;
    for (const rect of solids(level)) {
      if (rect.x + rect.w < cam.x - 60 || rect.x > cam.x + cfg.CW + 60 || rect.y + rect.h < cam.y - 60 || rect.y > cam.y + cfg.CH + 60) continue;
      const color = COLORS[kind(rect)], x = rect.x - cam.x, y = rect.y - cam.y;
      ctx.fillStyle = color + '18'; ctx.strokeStyle = color;
      ctx.setLineDash(rect.oneway ? [5, 3] : []);
      ctx.fillRect(x, y, rect.w, rect.h); ctx.strokeRect(x + .5, y + .5, rect.w, rect.h);
      if (labels && e && labelCount < 16 && Math.abs(rect.x + rect.w / 2 - e.x - e.w / 2) < 330 && Math.abs(rect.y - e.y - e.h) < 200) {
        const text = id(rect), tx = Math.max(3, x + 2), ty = y - 2;
        ctx.setLineDash([]); ctx.fillStyle = '#041018dd'; ctx.fillRect(tx - 1, ty - 10, ctx.measureText(text).width + 3, 11);
        ctx.fillStyle = color; ctx.fillText(text, tx, ty); labelCount++;
      }
    }
    ctx.setLineDash([]);
    const kill = level.killY == null ? level.castle.world && level.castle.world.killY : level.killY;
    if (Number.isFinite(kill)) {
      ctx.strokeStyle = COLORS.death; ctx.setLineDash([10, 5]); ctx.beginPath(); ctx.moveTo(0, kill - cam.y); ctx.lineTo(cfg.CW, kill - cam.y); ctx.stroke();
      if (kill >= cam.y && kill <= cam.y + cfg.CH) { ctx.fillStyle = COLORS.death; ctx.fillText('死亡边界 y=' + kill, 12, kill - cam.y - 3); }
    }
    if (e) {
      const d = analyze(e, level), x = e.x - cam.x, y = e.y - cam.y;
      ctx.setLineDash([]); ctx.lineWidth = 2; ctx.strokeStyle = d.embedded.length ? '#ff3f62' : '#ffef68'; ctx.strokeRect(x, y, e.w, e.h);
      ctx.strokeStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(x, y + e.h); ctx.lineTo(x + e.w, y + e.h); ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 2, y + e.h - 2, 4, 4); ctx.fillRect(x + e.w - 2, y + e.h - 2, 4, 4);
      if (e.kind === 'human') {
        const artH = cfg.HUMAN_VISUAL_H || 62;
        ctx.setLineDash([2, 3]); ctx.lineWidth = 1; ctx.strokeStyle = '#ffffff80'; ctx.strokeRect(x, y + e.h - artH, e.w, artH);
      }
      if (d.roof) {
        const cx = x + e.w / 2;
        ctx.setLineDash([3, 3]); ctx.strokeStyle = '#ffe3b3'; ctx.beginPath(); ctx.moveTo(cx, y); ctx.lineTo(cx, d.roof.y + d.roof.h - cam.y); ctx.stroke();
      }
      ctx.setLineDash([]); ctx.lineWidth = 2; ctx.strokeStyle = '#ffffff';
      for (const support of d.supports) { ctx.beginPath(); ctx.moveTo(Math.max(e.x, support.x) - cam.x, support.y - cam.y); ctx.lineTo(Math.min(e.x + e.w, support.x + support.w) - cam.x, support.y - cam.y); ctx.stroke(); }
    }
    ctx.restore();
  }
  global.CastleCollisionInspector = { enabled, attach, draw, analyze, checkpointsFor, colors: COLORS,
    setOverlay(value) { overlay = !!value; },
    setNotice(value) { notice = String(value || ''); lastRefresh = 0; },
    reloadReport: loadReport };
})(window);
