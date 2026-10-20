(function () {
  'use strict';

  var C = window.GAME_CLIENT;
  if (!C) return;

  var root = document.getElementById('gc-root');
  var KEY = 'hky-game-client:' + C.key + ':v1';
  var statLabels = C.key === 'wave'
    ? ['极速', '加速', '操控', '抗浪']
    : ['极速', '耐久', '操控', '技能'];
  var totalItems = C.key === 'strike' ? 56 : 6;
  var ICONS = {
    home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9.5 20v-5.5h5V20"/>',
    garage: '<path d="M3 20V9.5L12 4l9 5.5V20"/><path d="M6.5 20v-6.5h11V20"/><path d="M6.5 13.5h11"/>',
    career: '<path d="M8 4h8v4a4 4 0 0 1-8 0V4Z"/><path d="M8 5H4v2a4 4 0 0 0 4 4"/><path d="M16 5h4v2a4 4 0 0 1-4 4"/><path d="M12 12v5"/><path d="M8 21h8"/><path d="M9 18h6"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-1.9 1.9-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V20h-2.7v-.09A1.7 1.7 0 0 0 11.2 18.3a1.7 1.7 0 0 0-1.88.34l-.06.06-1.9-1.9.06-.06A1.7 1.7 0 0 0 7.76 15a1.7 1.7 0 0 0-1.56-1.03H6.1v-2.7h.1A1.7 1.7 0 0 0 7.76 10.2a1.7 1.7 0 0 0-.34-1.88l-.06-.06 1.9-1.9.06.06a1.7 1.7 0 0 0 1.88.34 1.7 1.7 0 0 0 1.03-1.56V5.1h2.7v.1a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06 1.9 1.9-.06.06a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.56 1.03h.1v2.7h-.1A1.7 1.7 0 0 0 19.4 15Z"/>',
    bolt: '<path d="m13 2-9 12h7l-1 8 9-12h-7l1-8Z"/>',
    trophy: '<path d="M8 4h8v4a4 4 0 0 1-8 0V4Z"/><path d="M8 5H4v2a4 4 0 0 0 4 4"/><path d="M16 5h4v2a4 4 0 0 1-4 4"/><path d="M12 12v5"/><path d="M8 21h8"/><path d="M9 18h6"/>',
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>',
    play: '<path d="m9 6 9 6-9 6V6Z"/>',
    exit: '<path d="M9 5H5v14h4"/><path d="M13 8l4 4-4 4"/><path d="M17 12H9"/>',
    coin: '<circle cx="12" cy="12" r="8"/><path d="M12 7v10M9.5 9.2c.8-.9 5-1.1 5 1.2 0 2.4-5 1.2-5 3.4 0 2.2 4.2 2 5 1.1"/>',
    gem: '<path d="m12 3 8 6-8 12L4 9l8-6Z"/><path d="m4 9 4.2 2.2L12 21l3.8-9.8L20 9"/>',
    pass: '<rect x="4" y="6" width="16" height="12" rx="1.5"/><path d="M8 10h8M8 14h5"/>',
    lock: '<rect x="5" y="10" width="14" height="10" rx="1.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    arrow: '<path d="M5 12h14M14 6l6 6-6 6"/>',
    wave: '<path d="M3 15c3-4 5-4 8 0s5 4 8 0"/><path d="M3 9c3-4 5-4 8 0s5 4 8 0"/>',
    reset: '<path d="M4 11a8 8 0 1 1 2.3 6.7"/><path d="M4 5v6h6"/>',
    external: '<path d="M14 5h5v5"/><path d="M19 5 10 14"/><path d="M19 14v5H5V5h5"/>'
  };

  function icon(name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
  }

  var defaults = {
    name: '',
    selected: (C.items[1] || C.items[0]).id,
    equipped: C.items[0].id,
    matches: 0,
    equips: 0,
    coins: 0,
    tutorialDone: false,
    mode: C.modes[0].id,
    music: 40,
    sfx: 60,
    quality: 'high'
  };

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      var stored = raw ? JSON.parse(raw) : {};
      return Object.assign({}, defaults, stored);
    } catch (e) {
      return Object.assign({}, defaults);
    }
  }

  var state = load();
  if (!C.items.some(function (x) { return x.id === state.selected; })) state.selected = C.items[0].id;
  if (!C.items.some(function (x) { return x.id === state.equipped; })) state.equipped = state.selected;

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function selectedItem() {
    return C.items.find(function (x) { return x.id === state.selected; }) || C.items[0];
  }

  function equippedItem() {
    return C.items.find(function (x) { return x.id === state.equipped; }) || C.items[0];
  }

  function fmt(n) {
    return Number(n || 0).toLocaleString('en-US');
  }

  function coinsValue() {
    var base = parseInt(String(C.currencies[0].value).replace(/[^\d]/g, ''), 10) || 0;
    return fmt(base + state.coins);
  }

  var currentView = 'lobby';
  var currentScreen = 'boot';
  var filter = 'all';
  var tutIndex = 0;
  var bootTimer = null;
  var matchTimer = null;
  var launchSeq = 0;
  var audioCtx = null;

  function tone(freq, duration) {
    if (Number(state.sfx) <= 0) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq || 520;
      gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.035 * (Number(state.sfx) / 100), audioCtx.currentTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + (duration || 0.07));
      osc.connect(gain).connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + (duration || 0.08));
    } catch (e) {}
  }

  document.body.classList.add('theme-' + C.theme);
  document.body.style.setProperty('--bg-image', 'url("' + C.background + '")');
  document.body.style.setProperty('--login-image', 'url("' + C.loginBackground + '")');
  document.body.style.setProperty('--hero-image', 'url("' + C.heroImage + '")');

  var moneyHtml = C.currencies.map(function (money) {
    return '<div class="gc-money" title="' + esc(money.label) + '">' +
      icon(money.icon) +
      '<div><span>' + esc(money.label) + '</span><b data-money="' + esc(money.key) + '">' + esc(money.value) + '</b></div></div>';
  }).join('');

  root.innerHTML =
    '<div class="gc-app">' +
      '<div class="gc-bg" aria-hidden="true"></div>' +
      '<div class="gc-particles" id="gc-particles" aria-hidden="true"></div>' +

      '<section class="gc-screen gc-boot is-active" data-screen="boot">' +
        '<div class="gc-boot-inner">' +
          '<div class="gc-logo"><span class="gc-logo-mark">HKY</span><span>HKY GAME CLIENT / ' + esc(C.season) + '</span></div>' +
          '<p class="gc-kicker">' + esc(C.version) + '</p>' +
          '<h1 class="gc-display">' + esc(C.title) + '<em>' + esc(C.titleEn) + '</em></h1>' +
          '<p class="gc-boot-sub">' + esc(C.subtitle) + ' · ' + esc(C.server) + '<br>正在建立本地游戏档案，请稍候。</p>' +
          '<div class="gc-boot-bar"><i></i></div>' +
          '<button type="button" class="gc-boot-enter" id="gc-boot-enter">点击进入 / ENTER</button>' +
        '</div>' +
      '</section>' +

      '<section class="gc-screen gc-login" data-screen="login">' +
        '<div class="gc-login-inner">' +
          '<div class="gc-login-left">' +
            '<div class="gc-logo"><span class="gc-logo-mark">HKY</span><span>' + esc(C.loginKicker) + '</span></div>' +
            '<h1 class="gc-display">' + C.loginTitle + '</h1>' +
            '<p class="gc-login-lede">' + esc(C.loginLede) + '</p>' +
            '<ul class="gc-login-bullets">' + C.loginBullets.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' +
            '<div class="gc-login-season"><span>' + esc(C.season) + '</span><b>LOCAL SAVE / NO ACCOUNT</b></div>' +
          '</div>' +
          '<form class="gc-login-card" id="gc-login-form">' +
            '<div class="gc-card-head"><span>账号接入 / ACCESS</span><b>LOCAL</b></div>' +
            '<div class="gc-field"><label for="gc-name">呼号 / 昵称</label><input class="gc-input" id="gc-name" maxlength="12" autocomplete="nickname" placeholder="输入你的游戏呼号"></div>' +
            '<div class="gc-server"><i></i><div><b>' + esc(C.server) + '</b><span>' + esc(C.serverMeta) + '</span></div></div>' +
            '<button class="gc-login-btn" type="submit" id="gc-login-btn">' + esc(C.guestLabel) + ' / 进入大厅</button>' +
            '<p class="gc-login-note">本地档案自动保存在当前浏览器；无需密码。<br><a href="' + esc(C.exitUrl) + '">返回作品集</a></p>' +
          '</form>' +
        '</div>' +
      '</section>' +

      '<section class="gc-screen gc-hub" data-screen="hub">' +
        '<header class="gc-topbar">' +
          '<button class="gc-brand" type="button" data-nav="lobby" aria-label="返回大厅"><span class="gc-logo-mark">HKY</span><span><b>' + esc(C.title) + '</b><small>' + esc(C.titleEn) + ' / ' + esc(C.version) + '</small></span></button>' +
          '<div class="gc-top-meta"><span class="gc-chip"><i></i>' + esc(C.server) + '</span><span class="gc-chip accent">' + esc(C.season) + '</span></div>' +
          '<span class="gc-spacer"></span>' +
          '<div class="gc-currencies">' + moneyHtml + '</div>' +
          '<button class="gc-player" type="button" data-nav="career" aria-label="打开生涯">' +
            '<span class="gc-avatar" data-avatar>H</span>' +
            '<span><b data-player-name>玩家</b><span data-player-meta>LV.1 · 新晋车手</span><span class="gc-xp"><i data-xp></i></span></span>' +
          '</button>' +
          '<button class="gc-icon-btn" type="button" data-nav="settings" aria-label="设置">' + icon('settings') + '</button>' +
          '<a class="gc-icon-btn" href="' + esc(C.exitUrl) + '" aria-label="返回作品集">' + icon('exit') + '</a>' +
        '</header>' +
        '<div class="gc-hub-body">' +
          '<nav class="gc-nav" aria-label="客户端导航">' +
            '<button type="button" data-nav="lobby" class="active">' + icon('home') + '<span>大厅</span></button>' +
            '<button type="button" data-nav="garage">' + icon('garage') + '<span>仓库</span></button>' +
            '<button type="button" data-nav="career">' + icon('career') + '<span>生涯</span></button>' +
            '<button type="button" data-nav="settings">' + icon('settings') + '<span>设置</span></button>' +
            '<span class="gc-nav-foot"><a href="' + esc(C.exitUrl) + '">退出客户端</a></span>' +
          '</nav>' +
          '<main class="gc-main">' +
            '<section class="gc-view active" data-view="lobby">' +
              '<div class="gc-lobby-grid">' +
                '<div>' +
                  '<div class="gc-hero">' +
                    '<div class="gc-hero-top"><p class="gc-eyebrow">PILOT LOUNGE / 当前大厅</p><span class="gc-hero-season">' + esc(C.season) + '<br>' + esc(C.version) + '</span><div class="gc-hero-level"><b>LV.<span data-level>12</span></b><span data-player-title>霓虹新秀</span></div></div>' +
                    '<div class="gc-hero-content">' +
                      '<p class="gc-kicker">CURRENT MACHINE / 当前座驾</p>' +
                      '<h2 class="gc-display" data-hero-name>—</h2>' +
                      '<p class="gc-hero-tag" data-hero-tag>—</p>' +
                      '<div class="gc-hero-stats" data-hero-stats></div>' +
                      '<button type="button" class="gc-hero-link" data-nav="garage">更换座驾 / 打开仓库 →</button>' +
                    '</div>' +
                  '</div>' +
                  '<div class="gc-modes" data-modes></div>' +
                  '<div class="gc-play-row">' +
                    '<div class="gc-play-note"><b data-mode-label>' + esc(C.modes[0].name) + '</b><span data-mode-desc>' + esc(C.modes[0].desc) + '</span></div>' +
                    '<button type="button" class="gc-play" id="gc-play"><span class="gc-play-copy"><b>开始对局</b><small>REAL GAME / CLIENT LAUNCH</small></span><span class="gc-play-arrow">' + icon('play') + '</span></button>' +
                  '</div>' +
                '</div>' +
                '<aside class="gc-side-panel">' +
                  '<div class="gc-panel"><div class="gc-panel-head"><b>今日任务</b><span data-mission-count>0 / 3</span></div><div class="gc-missions" data-missions></div></div>' +
                  '<div class="gc-panel gc-announce"><p class="gc-kicker">BULLETIN / 公告</p><p><b>' + esc(C.season) + '</b> 已开放。<br>' + esc(C.gameNote) + '</p></div>' +
                  '<div class="gc-client-note">' + esc(C.collectionNote) + '</div>' +
                '</aside>' +
                '<div class="gc-season-strip" data-season-strip></div>' +
              '</div>' +
            '</section>' +

            '<section class="gc-view" data-view="garage">' +
              '<div class="gc-view-head"><div><p class="gc-eyebrow">WAREHOUSE / 资产仓库</p><h2 class="gc-display">' + (C.key === 'wave' ? '艇库与收藏' : '车库与藏品') + '</h2></div><div class="gc-view-meta"><span>' + esc(C.allCount) + '</span><span>·</span><span data-owned-count>0 / 0 已拥有</span></div></div>' +
              '<div class="gc-garage-grid">' +
                '<div><div class="gc-filters" data-filters></div><div class="gc-item-grid" data-items></div></div>' +
                '<aside class="gc-detail">' +
                  '<div class="gc-detail-art" data-detail-art></div>' +
                  '<span class="gc-rarity" data-detail-rarity>—</span>' +
                  '<h3 class="gc-display" data-detail-name>—</h3>' +
                  '<p class="gc-detail-tag" data-detail-tag>—</p>' +
                  '<p class="gc-detail-desc" data-detail-desc>—</p>' +
                  '<div class="gc-stat-list" data-detail-stats></div>' +
                  '<button type="button" class="gc-equip" id="gc-equip">装备</button>' +
                  '<p class="gc-detail-note">' + esc(C.collectionNote) + '</p>' +
                '</aside>' +
              '</div>' +
              '<div class="gc-view-banner"><div><span>COLLECTION / 当前收藏</span><b>' + (C.key === 'wave' ? '六艘艇，六种读浪的方式。' : '每一辆车，都有自己的撞击角度。') + '</b></div><a href="#" data-nav="lobby">返回大厅 →</a></div>' +
            '</section>' +

            '<section class="gc-view" data-view="career">' +
              '<div class="gc-view-head"><div><p class="gc-eyebrow">CAREER / 游戏生涯</p><h2 class="gc-display">车手档案</h2></div><div class="gc-view-meta"><span>' + esc(C.season) + '</span></div></div>' +
              '<div class="gc-career-grid">' +
                '<div class="gc-profile-card"><div class="gc-profile-top"><span class="gc-avatar" data-avatar>H</span><div><h3 class="gc-display" data-career-name>—</h3><p data-career-meta>—</p></div></div><div class="gc-profile-xp"><div class="gc-stat"><span>LV.<span data-level>12</span></span><i><em data-xp></em></i><b data-xp-label>—</b></div></div><div class="gc-career-stats"><div class="gc-career-stat"><b data-stat-matches>0</b><span>累计对局</span></div><div class="gc-career-stat"><b data-stat-items>0</b><span>' + (C.key === 'wave' ? '已收集艇型' : '已收集座驾') + '</span></div><div class="gc-career-stat"><b data-stat-coins>0</b><span>任务金币</span></div></div></div>' +
                '<div class="gc-panel"><div class="gc-panel-head"><b>成就 / 里程碑</b><span data-achievement-count>0 / 4</span></div><div style="padding: 4px 14px 10px" data-achievements></div></div>' +
                '<div class="gc-tutorial-card"><div><h3>新手引导</h3><p>第一次进入客户端时，我们会带你走一遍大厅、仓库和任务。随时可以重播。</p></div><button type="button" class="gc-small-btn" id="gc-replay-tutorial">重播新手引导</button></div>' +
              '</div>' +
              '<div class="gc-view-banner"><div><span>CAREER / 下一站</span><b>成绩会被记录，下一场才是重点。</b></div><a href="#" data-nav="lobby">回到大厅 →</a></div>' +
            '</section>' +

            '<section class="gc-view" data-view="settings">' +
              '<div class="gc-view-head"><div><p class="gc-eyebrow">SYSTEM / 设置</p><h2 class="gc-display">客户端设置</h2></div><div class="gc-view-meta"><span>' + esc(C.version) + '</span></div></div>' +
              '<div class="gc-settings-grid">' +
                '<div class="gc-settings-card"><h3>声音与表现</h3>' +
                  '<div class="gc-setting"><label for="gc-music">背景音乐 <b data-music-label>40%</b></label><input id="gc-music" type="range" min="0" max="100" value="40"></div>' +
                  '<div class="gc-setting"><label for="gc-sfx">界面音效 <b data-sfx-label>60%</b></label><input id="gc-sfx" type="range" min="0" max="100" value="60"></div>' +
                  '<div class="gc-setting"><label>客户端画质</label><div class="gc-seg" data-quality><button type="button" data-q="low">流畅</button><button type="button" data-q="high" class="active">高清</button><button type="button" data-q="ultra">极致</button></div></div>' +
                  '<p class="gc-settings-note">客户端设置只作用于展示层；真实对局画质以游戏内设置为准。</p>' +
                '</div>' +
                '<div class="gc-settings-card"><h3>客户端与版本</h3>' +
                  '<div class="gc-link-row"><span>当前版本</span><b style="color:var(--muted);font:8px/1 var(--mono)">' + esc(C.version) + '</b></div>' +
                  '<div class="gc-link-row"><span>游戏本体</span><a href="' + esc(C.gameUrl) + '" target="_blank" rel="noopener">单独打开 ↗</a></div>' +
                  (C.alternateUrl ? '<div class="gc-link-row"><span>版本切换</span><a href="' + esc(C.alternateUrl) + '" target="_blank" rel="noopener">' + esc(C.alternateLabel || '在线版') + ' ↗</a></div>' : '') +
                  (C.versionsUrl ? '<div class="gc-link-row"><span>版本选择页</span><a href="' + esc(C.versionsUrl) + '" target="_blank" rel="noopener">打开 ↗</a></div>' : '') +
                  '<div class="gc-link-row"><span>返回作品集</span><a href="' + esc(C.exitUrl) + '">离开客户端 ↗</a></div>' +
                  '<div class="gc-link-row"><span>本地档案</span><button type="button" class="gc-danger" id="gc-reset">重置本地档案</button></div>' +
                  '<p class="gc-settings-note">' + esc(C.gameNote) + '</p>' +
                '</div>' +
                '<div class="gc-settings-card gc-controls-card"><h3>操作 / CONTROLS</h3><div class="gc-key-grid">' +
                  (C.key === 'wave'
                    ? '<div class="gc-key"><kbd>W / S</kbd>加速 / 刹车</div><div class="gc-key"><kbd>A / D</kbd>左右转向</div><div class="gc-key"><kbd>Shift</kbd>涡轮增压</div><div class="gc-key"><kbd>Esc</kbd>暂停 / 设置</div>'
                    : '<div class="gc-key"><kbd>WASD</kbd>移动 / 转向</div><div class="gc-key"><kbd>Shift</kbd>冲势 / 涡轮</div><div class="gc-key"><kbd>F / E</kbd>技能 / 道具</div><div class="gc-key"><kbd>Q / Esc</kbd>视角 / 暂停</div>') +
                '</div></div>' +
              '</div>' +
              '<div class="gc-view-banner"><div><span>CLIENT / 本地客户端</span><b>调好手感，再上场。</b></div><a href="' + esc(C.exitUrl) + '">返回作品集 ↗</a></div>' +
            '</section>' +
          '</main>' +
        '</div>' +
      '</section>' +

      '<section class="gc-screen gc-match" data-screen="match">' +
        '<div class="gc-match-bar"><button type="button" id="gc-back">← 返回大厅</button><span>LIVE MATCH / ' + esc(C.titleEn) + '</span><span class="gc-live">REAL GAME · LOCAL CLIENT</span></div>' +
        '<div class="gc-match-stage"><iframe id="gc-game" title="' + esc(C.title) + ' 对局" allow="autoplay; fullscreen; gamepad"></iframe><div class="gc-loader" id="gc-loader"><div class="gc-loader-inner"><div class="gc-loader-ring"></div><b>正在载入真实对局</b><span>连接本地游戏引擎 · ' + esc(C.gameUrl) + '</span></div></div></div>' +
      '</section>' +

      '<div class="gc-tut" id="gc-tut" role="dialog" aria-modal="true" aria-label="新手引导"><div class="gc-tut-spot" id="gc-tut-spot"></div><div class="gc-tut-card"><p class="gc-tut-count" id="gc-tut-count">GUIDE / 01</p><h3 id="gc-tut-title">—</h3><p id="gc-tut-text">—</p><div class="gc-tut-actions"><button type="button" id="gc-tut-skip">跳过</button><button type="button" id="gc-tut-next">下一步 →</button></div></div></div>' +
      '<div class="gc-confirm" id="gc-confirm" role="dialog" aria-modal="true" aria-label="返回大厅"><div class="gc-confirm-card"><b id="gc-confirm-title">返回大厅？</b><p id="gc-confirm-text">当前对局会中断。</p><div class="gc-confirm-actions"><button type="button" id="gc-confirm-cancel">继续对局</button><button type="button" id="gc-confirm-ok">返回大厅</button></div></div></div>' +
      '<div class="gc-toast" id="gc-toast" role="status" aria-live="polite"></div>' +
    '</div>';

  var $ = function (selector, context) { return (context || document).querySelector(selector); };
  var $$ = function (selector, context) { return Array.prototype.slice.call((context || document).querySelectorAll(selector)); };
  var screens = $$('.gc-screen');
  var views = $$('.gc-view');
  var navButtons = $$('.gc-nav [data-nav]');
  var tutEl = $('#gc-tut');
  var tutSpot = $('#gc-tut-spot');
  var toastEl = $('#gc-toast');
  var toastTimer = null;
  var confirmAction = null;

  function toast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2200);
  }

  function spawnParticles() {
    var wrap = $('#gc-particles');
    for (var i = 0; i < 18; i++) {
      var p = document.createElement('i');
      p.className = 'gc-particle';
      p.style.setProperty('--x', (Math.random() * 100).toFixed(2) + '%');
      p.style.setProperty('--y', (35 + Math.random() * 65).toFixed(2) + '%');
      p.style.setProperty('--s', (1 + Math.random() * 2.2).toFixed(1) + 'px');
      p.style.setProperty('--d', (9 + Math.random() * 13).toFixed(1) + 's');
      p.style.setProperty('--delay', (-Math.random() * 20).toFixed(1) + 's');
      p.style.setProperty('--dx', ((Math.random() * 80) - 40).toFixed(0) + 'px');
      wrap.appendChild(p);
    }
  }

  function showScreen(name) {
    currentScreen = name;
    screens.forEach(function (screen) {
      screen.classList.toggle('is-active', screen.getAttribute('data-screen') === name);
    });
    if (name === 'hub') renderAll();
  }

  function setView(name) {
    currentView = name;
    views.forEach(function (view) {
      view.classList.toggle('active', view.getAttribute('data-view') === name);
    });
    navButtons.forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-nav') === name);
    });
    if (name === 'garage') renderGarage();
    if (name === 'career') renderCareer();
    if (name === 'settings') renderSettings();
    if (name === 'lobby') renderLobby();
    var main = $('.gc-main');
    if (main) main.scrollTop = 0;
  }

  function rarityColor(rarity) {
    return rarity === 'titan' ? '#ffb545' : rarity === 'rare' ? '#6fb8ff' : '#9ba9bd';
  }

  function rarityLabel(rarity) {
    return rarity === 'titan' ? '泰坦' : rarity === 'rare' ? '稀有' : '标准';
  }

  function art(kind, color) {
    if (kind === 'boat') {
      return '<svg viewBox="0 0 240 110" aria-hidden="true">' +
        '<path d="M24 73h192l-18 18H48L24 73Z" fill="' + color + '" opacity=".85"/>' +
        '<path d="M63 73 92 42h58l30 31H63Z" fill="' + color + '" opacity=".55"/>' +
        '<path d="M98 47h24l-5 20H84l14-20Z" fill="#06151b" opacity=".8"/>' +
        '<path d="M40 91h160" stroke="#f6f2e6" stroke-opacity=".25"/>' +
        '<path d="M116 42v-13l32 13" fill="none" stroke="#f6f2e6" stroke-opacity=".5" stroke-width="3"/>' +
      '</svg>';
    }
    return '<svg viewBox="0 0 240 110" aria-hidden="true">' +
      '<path d="M30 66h180l18 13-16 12H30L12 78l18-12Z" fill="' + color + '" opacity=".9"/>' +
      '<path d="M74 66 96 38h53l30 28H74Z" fill="' + color + '" opacity=".6"/>' +
      '<path d="M102 44h38l17 20h-64l9-20Z" fill="#07101c" opacity=".82"/>' +
      '<circle cx="66" cy="91" r="11" fill="#07101c" stroke="#f6f2e6" stroke-opacity=".5" stroke-width="3"/>' +
      '<circle cx="185" cy="91" r="11" fill="#07101c" stroke="#f6f2e6" stroke-opacity=".5" stroke-width="3"/>' +
      '<path d="M40 78h150" stroke="#f6f2e6" stroke-opacity=".2"/>' +
    '</svg>';
  }

  function renderAll() {
    renderHUD();
    renderLobby();
    renderGarage();
    renderCareer();
    renderSettings();
  }

  function renderHUD() {
    var name = state.name || C.defaultName;
    var avatar = name.charAt(0).toUpperCase();
    $$('[data-avatar]').forEach(function (el) { el.textContent = avatar; });
    $$('[data-player-name]').forEach(function (el) { el.textContent = name; });
    $$('[data-career-name]').forEach(function (el) { el.textContent = name; });
    $$('[data-player-meta]').forEach(function (el) { el.textContent = 'LV.' + C.player.level + ' · ' + C.player.title; });
    $$('[data-level]').forEach(function (el) { el.textContent = String(C.player.level); });
    $$('[data-player-title]').forEach(function (el) { el.textContent = C.player.title; });
    $$('[data-xp]').forEach(function (el) { el.style.width = Math.round((C.player.exp / C.player.expMax) * 100) + '%'; });
    $$('[data-xp-label]').forEach(function (el) { el.textContent = C.player.exp + ' / ' + C.player.expMax; });
    var coin = $('[data-money="' + C.currencies[0].key + '"]');
    if (coin) coin.textContent = coinsValue();
  }

  function renderLobby() {
    var selected = equippedItem();
    var heroName = $('[data-hero-name]');
    if (!heroName) return;
    heroName.textContent = selected.name;
    $('[data-hero-tag]').textContent = selected.tag + ' · ' + rarityLabel(selected.rarity);
    $('[data-hero-stats]').innerHTML = selected.stats.map(function (value, i) {
      return '<div class="gc-hero-stat"><span>' + statLabels[i] + '</span><b>' + value + '</b><i><em style="width:' + value + '%"></em></i></div>';
    }).join('');

    var modes = $('[data-modes]');
    modes.innerHTML = C.modes.map(function (mode) {
      return '<button type="button" class="gc-mode' + (mode.id === state.mode ? ' active' : '') + '" data-mode="' + esc(mode.id) + '">' +
        '<span class="gc-mode-icon">' + icon(mode.icon) + '<span>' + esc(mode.meta) + '</span></span>' +
        '<b>' + esc(mode.name) + (mode.hot ? ' <small class="gc-hot">HOT</small>' : '') + '</b>' +
        '<p>' + esc(mode.desc) + '</p></button>';
    }).join('');
    var mode = C.modes.find(function (x) { return x.id === state.mode; }) || C.modes[0];
    $('[data-mode-label]').textContent = mode.name;
    $('[data-mode-desc]').textContent = mode.desc;
    renderMissions();
    renderSeasonStrip();
  }

  function renderSeasonStrip() {
    var wrap = $('[data-season-strip]');
    if (!wrap) return;
    var done = C.missions.filter(function (m) { return missionValue(m) >= m.target; }).length;
    var pct = Math.round((done / C.missions.length) * 100);
    wrap.innerHTML =
      '<div class="gc-season-card"><span class="gc-season-kicker">SEASON PASS / 赛季通行证</span><b>' + esc(C.season) + '</b><div class="gc-season-bar"><i style="width:' + pct + '%"></i></div><p>LV.' + C.player.level + ' · ' + done + ' / ' + C.missions.length + ' 任务达成</p></div>' +
      '<div class="gc-season-card"><span class="gc-season-kicker">COLLECTION / 收藏进度</span><b>' + C.items.length + ' / ' + totalItems + '</b><p>' + esc(C.allCount) + ' · ' + (C.key === 'wave' ? '艇库展示' : '车库样张') + '</p></div>' +
      '<div class="gc-season-card"><span class="gc-season-kicker">MATCH LOG / 最近对局</span><b>' + (state.matches ? '已完成 ' + state.matches + ' 场' : '新档案 · 等待首场') + '</b><p>' + (C.key === 'wave' ? '3 圈 · 4 艇 · 离线赛道' : '8 人 · 3 分钟 · 车辆淘汰') + '</p></div>';
  }

  function missionValue(mission) {
    if (mission.metric === 'tutorialDone') return state.tutorialDone ? 1 : 0;
    return Number(state[mission.metric] || 0);
  }

  function renderMissions() {
    var wrap = $('[data-missions]');
    if (!wrap) return;
    var doneCount = 0;
    wrap.innerHTML = C.missions.map(function (mission) {
      var value = Math.min(mission.target, missionValue(mission));
      var done = value >= mission.target;
      if (done) doneCount++;
      return '<div class="gc-mission' + (done ? ' done' : '') + '"><div class="gc-mission-top"><span>' + esc(mission.label) + '</span><em>' + (done ? '已达成 · ' + esc(mission.reward) : value + ' / ' + mission.target) + '</em></div><div class="gc-mission-bar"><i style="width:' + Math.round((value / mission.target) * 100) + '%"></i></div></div>';
    }).join('');
    var count = $('[data-mission-count]');
    if (count) count.textContent = doneCount + ' / ' + C.missions.length;
  }

  function renderGarage() {
    var filterWrap = $('[data-filters]');
    var itemsWrap = $('[data-items]');
    if (!filterWrap || !itemsWrap) return;
    var filters = [['all', '全部'], ['common', '标准'], ['rare', '稀有'], ['titan', '泰坦']];
    filterWrap.innerHTML = filters.map(function (x) {
      return '<button type="button" class="gc-filter' + (filter === x[0] ? ' active' : '') + '" data-filter="' + x[0] + '">' + x[1] + '</button>';
    }).join('');
    var list = C.items.filter(function (x) { return filter === 'all' || x.rarity === filter; });
    itemsWrap.innerHTML = list.map(function (x) {
      var color = rarityColor(x.rarity);
      return '<button type="button" class="gc-item-card' + (x.id === state.selected ? ' selected' : '') + '" data-item="' + esc(x.id) + '">' +
        (x.id === state.equipped ? '<span class="gc-selected-mark">当前装备</span>' : '') +
        '<div class="gc-item-art">' + art(C.key === 'wave' ? 'boat' : 'car', color) + '</div>' +
        '<span class="gc-rarity ' + esc(x.rarity) + '">' + rarityLabel(x.rarity) + '</span>' +
        '<h3>' + esc(x.name) + '</h3><p>' + esc(x.tag) + ' · LV.' + x.level + '</p></button>';
    }).join('');
    var owned = $('[data-owned-count]');
    if (owned) owned.textContent = C.items.length + ' / ' + totalItems + ' 已拥有';
    renderDetail();
  }

  function renderDetail() {
    var selected = selectedItem();
    var color = rarityColor(selected.rarity);
    var artBox = $('[data-detail-art]');
    if (!artBox) return;
    artBox.innerHTML = art(C.key === 'wave' ? 'boat' : 'car', color);
    var rarity = $('[data-detail-rarity]');
    rarity.className = 'gc-rarity ' + selected.rarity;
    rarity.textContent = rarityLabel(selected.rarity) + ' / ' + selected.tag;
    $('[data-detail-name]').textContent = selected.name;
    $('[data-detail-tag]').textContent = selected.tag + ' · LV.' + selected.level;
    $('[data-detail-desc]').textContent = selected.desc;
    $('[data-detail-stats]').innerHTML = selected.stats.map(function (value, i) {
      return '<div class="gc-stat"><span>' + statLabels[i] + '</span><i><em style="width:' + value + '%"></em></i><b>' + value + '</b></div>';
    }).join('');
    var equip = $('#gc-equip');
    var isEquipped = selected.id === state.equipped;
    equip.textContent = isEquipped ? '当前已装备' : '装备' + (C.key === 'wave' ? '艇型' : '座驾');
    equip.disabled = isEquipped;
  }

  function renderCareer() {
    var selected = equippedItem();
    var achievements = [
      { name: '初次接入', desc: '完成客户端登录，建立本地档案。', done: true, reward: '已解锁' },
      { name: C.key === 'wave' ? '第一道浪' : '第一次下场', desc: C.key === 'wave' ? '完成第一场竞速。' : '完成第一场对局。', done: state.matches > 0, reward: state.matches > 0 ? '已解锁' : '完成 1 场' },
      { name: C.key === 'wave' ? '艇库探索' : '车库整备', desc: '在仓库装备一次座驾。', done: state.equips > 0, reward: state.equips > 0 ? '已解锁' : '装备 1 次' },
      { name: '新手毕业', desc: '完整走完客户端新手引导。', done: state.tutorialDone, reward: state.tutorialDone ? '已解锁' : '完成引导' }
    ];
    var ach = $('[data-achievements]');
    if (ach) {
      ach.innerHTML = achievements.map(function (a) {
        return '<div class="gc-achievement"><div><b>' + esc(a.name) + '</b><p>' + esc(a.desc) + '</p></div><span>' + esc(a.reward) + '</span></div>';
      }).join('');
    }
    var count = $('[data-achievement-count]');
    if (count) count.textContent = achievements.filter(function (a) { return a.done; }).length + ' / ' + achievements.length;
    var statMatches = $('[data-stat-matches]');
    if (statMatches) statMatches.textContent = String(state.matches);
    var statItems = $('[data-stat-items]');
    if (statItems) statItems.textContent = C.items.length + ' / ' + totalItems;
    var statCoins = $('[data-stat-coins]');
    if (statCoins) statCoins.textContent = fmt(state.coins);
    var meta = $('[data-career-meta]');
    if (meta) meta.textContent = 'LV.' + C.player.level + ' · ' + C.player.title + ' · ' + selected.name;
  }

  function renderSettings() {
    var music = $('#gc-music');
    var sfx = $('#gc-sfx');
    if (!music || !sfx) return;
    music.value = state.music;
    sfx.value = state.sfx;
    $('[data-music-label]').textContent = state.music + '%';
    $('[data-sfx-label]').textContent = state.sfx + '%';
    $$('[data-quality] button').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-q') === state.quality);
    });
  }

  function selectItem(id) {
    state.selected = id;
    save();
    renderGarage();
    tone(620, .06);
  }

  function markMatchStarted() {
    state.matches += 1;
    state.coins += 120;
    save();
    renderHUD();
    renderMissions();
    renderSeasonStrip();
    renderCareer();
  }

  function equipItem() {
    state.equipped = state.selected;
    state.equips += 1;
    state.coins += 80;
    save();
    renderHUD();
    renderLobby();
    renderGarage();
    renderCareer();
    tone(760, .09);
    toast('已装备 ' + equippedItem().name + ' · 任务奖励 +80');
  }

  function markTutorialDone() {
    state.tutorialDone = true;
    state.coins += 200;
    save();
    renderHUD();
    renderMissions();
    renderSeasonStrip();
    renderCareer();
  }

  function finishTutorial(skipped) {
    markTutorialDone();
    closeTutorial();
    toast(skipped ? '已跳过新手引导 · 可随时在生涯中重播' : '新手引导完成 · 奖励 +200');
  }

  function closeTutorial() {
    tutEl.classList.remove('open');
    tutSpot.style.display = 'none';
  }

  function positionTutorialSpot() {
    if (!tutEl.classList.contains('open')) return;
    var step = C.tutorial[tutIndex];
    if (!step) return;
    var target = document.querySelector(step.target);
    if (!target) {
      tutSpot.style.display = 'none';
      return;
    }
    var rect = target.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) {
      tutSpot.style.display = 'none';
      return;
    }
    tutSpot.style.display = 'block';
    tutSpot.style.left = (rect.left - 6) + 'px';
    tutSpot.style.top = (rect.top - 6) + 'px';
    tutSpot.style.width = (rect.width + 12) + 'px';
    tutSpot.style.height = (rect.height + 12) + 'px';
    var card = $('.gc-tut-card');
    if (card) {
      card.style.top = '';
      card.style.bottom = '';
      var cr = card.getBoundingClientRect();
      var overlaps = rect.left < cr.right && rect.right > cr.left && rect.top < cr.bottom && rect.bottom > cr.top;
      if (overlaps) {
        if (rect.top > cr.height + 90) {
          card.style.top = Math.max(70, rect.top - cr.height - 16) + 'px';
          card.style.bottom = 'auto';
        } else {
          card.style.top = 'auto';
          card.style.bottom = Math.max(16, innerHeight - rect.bottom + 16) + 'px';
        }
      }
    }
  }

  function renderTutorialStep() {
    var step = C.tutorial[tutIndex];
    if (!step) {
      finishTutorial(false);
      return;
    }
    if (step.screen !== currentView) setView(step.screen);
    $('#gc-tut-count').textContent = 'GUIDE / ' + String(tutIndex + 1).padStart(2, '0') + ' / ' + String(C.tutorial.length).padStart(2, '0');
    $('#gc-tut-title').textContent = step.title;
    $('#gc-tut-text').textContent = step.text;
    $('#gc-tut-next').textContent = tutIndex === C.tutorial.length - 1 ? '完成引导 →' : '下一步 →';
    var target = document.querySelector(step.target);
    if (target) {
      try { target.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {}
    }
    setTimeout(positionTutorialSpot, 280);
  }

  function advanceTutorial() {
    tutIndex += 1;
    if (tutIndex >= C.tutorial.length) finishTutorial(false);
    else renderTutorialStep();
  }

  function startTutorial(force) {
    if (!force && state.tutorialDone) return;
    if (!state.name) state.name = C.defaultName;
    tutIndex = 0;
    tutEl.classList.add('open');
    setView('lobby');
    renderTutorialStep();
    tone(560, .06);
  }

  function requestLandscape() {
    if (!C.mobileLandscape) return;
    try {
      if (!matchMedia('(pointer: coarse)').matches || innerHeight <= innerWidth) return;
      var root = document.documentElement;
      var req = root.requestFullscreen ? root.requestFullscreen({ navigationUI: 'hide' }) : null;
      Promise.resolve(req).then(function () {
        if (screen.orientation && screen.orientation.lock) return screen.orientation.lock('landscape');
      }).catch(function () {});
    } catch (e) {}
  }

  function launchMatch() {
    if (!state.name) {
      toast('请先接入本地档案');
      showScreen('login');
      return;
    }
    requestLandscape();
    var token = ++launchSeq;
    markMatchStarted();
    showScreen('match');
    var loader = $('#gc-loader');
    var iframe = $('#gc-game');
    loader.classList.remove('hidden');
    iframe.src = C.gameUrl;
    var started = false, nudged = false, dialogConfirmed = false, hintDismissed = false, lastClickAt = 0;
    var begin = Date.now();
    clearInterval(matchTimer);
    function focusGame() {
      try {
        iframe.focus({ preventScroll: true });
        if (iframe.contentWindow) iframe.contentWindow.focus();
      } catch (e) {}
    }
    function markStarted() {
      if (started || token !== launchSeq) return;
      started = true;
      clearInterval(matchTimer);
      focusGame();
      setTimeout(focusGame, 420);
      setTimeout(function () { loader.classList.add('hidden'); }, 1200);
    }
    function clickStart() {
      if (token !== launchSeq) return false;
      try {
        var doc = iframe.contentDocument;
        if (!doc) return false;
        if (!doc.getElementById('gc-hide-original-return')) {
          var style = doc.createElement('style');
          style.id = 'gc-hide-original-return';
          style.textContent = '#public-demo-return{display:none!important}body{padding-bottom:0!important}';
          (doc.head || doc.documentElement).appendChild(style);
        }
        var win = iframe.contentWindow;
        if (C.key === 'wave' && !hintDismissed) {
          var rotate = doc.querySelector('#rotate-hint');
          var dismiss = doc.querySelector('#rotate-dismiss');
          if (rotate && dismiss) {
            var rr = rotate.getBoundingClientRect();
            var rs = win.getComputedStyle(rotate);
            if (rr.width > 0 && rr.height > 0 && rs.display !== 'none' && rs.visibility !== 'hidden') {
              hintDismissed = true;
              dismiss.click();
              toast('已按竖屏启动；横屏可旋转设备获得更宽视野');
            }
          }
        }
        if (C.confirmInputPrompt && win.InputDeviceRuntime && !win.InputDeviceRuntime.snapshot().confirmed) {
          win.InputDeviceRuntime.setPreference('auto');
        }
        var dialog = doc.querySelector('dialog[open]');
        if (dialog) {
          var apply = dialog.querySelector('[data-device-apply]');
          var cancel = dialog.querySelector('[data-device-cancel]');
          if (apply && cancel && cancel.hidden && !dialogConfirmed) {
            dialogConfirmed = true;
            apply.click();
            return false;
          }
          if (!nudged) {
            nudged = true;
            loader.classList.add('hidden');
            toast('请先完成游戏内设置，随后会自动开局');
          }
          return false;
        }
        var ready = !C.waitForReady || win[C.waitForReady] === true;
        if (C.requireWR) ready = ready && !!win.__WR;
        if (C.flow === 'strike') {
          var flow = win.UI56ModeFlow;
          if (ready && flow && flow.installed && Date.now() - lastClickAt > 700) {
            var target = null;
            if (!flow.active) target = doc.querySelector('#ui56-play');
            else if (flow.stage === 'browse') target = doc.querySelector(flow.family ? '[data-mf-mode]' : '[data-mf-family="classic"]');
            else if (flow.stage === 'prepare') target = doc.querySelector('[data-mf-next]');
            else if (flow.stage === 'vehicle') target = doc.querySelector('[data-mf-car-confirm]');
            else if (flow.stage === 'confirm') target = doc.querySelector('[data-mf-launch]');
            if (target && target.offsetParent !== null) {
              lastClickAt = Date.now();
              target.click();
            }
          }
        } else {
          var btn = doc.querySelector(C.startSelector);
          if (C.requireWR) {
            var phase = null;
            try { phase = win.__WR.session() && win.__WR.session().phase; } catch (e) {}
            if (phase === 'countdown' || phase === 'racing') {
              markStarted();
              return true;
            }
          }
          if (btn && btn.offsetParent !== null && ready && Date.now() - lastClickAt > 1600) {
            lastClickAt = Date.now();
            btn.click();
            if (!C.verifyLaunch && !C.requireWR) { markStarted(); return true; }
          }
          if (C.requireWR) return false;
        }
        if (C.verifyLaunch || C.flow) {
          var gameState = null;
          try { gameState = win.GameDebug && win.GameDebug.state ? win.GameDebug.state() : null; } catch (e) {}
          if (gameState && gameState !== 'menu' && gameState !== 'mapselect') {
            markStarted();
            return true;
          }
          return false;
        }
      } catch (e) {}
      return false;
    }
    iframe.addEventListener('load', function () { setTimeout(clickStart, 800); });
    matchTimer = setInterval(function () {
      if (started) return;
      clickStart();
      if (!started && !nudged && Date.now() - begin > (C.startTimeout || 14000)) {
        clearInterval(matchTimer);
        loader.classList.add('hidden');
        toast('已进入游戏界面；若未自动开局，请点击游戏内的开始按钮');
      }
    }, 600);
    setTimeout(function () {
      if (!started && !loader.classList.contains('hidden')) {
        loader.classList.add('hidden');
      }
    }, (C.startTimeout || 14000) + 2000);
  }

  function doBackToLobby() {
    launchSeq += 1;
    try {
      if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
      if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
    } catch (e) {}
    clearInterval(matchTimer);
    var iframe = $('#gc-game');
    if (iframe) iframe.src = 'about:blank';
    var loader = $('#gc-loader');
    if (loader) loader.classList.add('hidden');
    showScreen('hub');
    setView('lobby');
  }

  function openConfirm(title, text, okLabel, action, cancelLabel) {
    var dialog = $('#gc-confirm');
    if (!dialog) return action && action();
    dialog.setAttribute('aria-label', title);
    $('#gc-confirm-title').textContent = title;
    $('#gc-confirm-text').textContent = text;
    $('#gc-confirm-ok').textContent = okLabel || '确认';
    $('#gc-confirm-cancel').textContent = cancelLabel || '取消';
    confirmAction = action || null;
    dialog.classList.add('open');
    var cancel = $('#gc-confirm-cancel');
    if (cancel) cancel.focus();
  }

  function askBack() {
    openConfirm('返回大厅？', '当前对局会中断。', '返回大厅', doBackToLobby, '继续对局');
  }

  function closeConfirm() {
    var dialog = $('#gc-confirm');
    if (dialog) dialog.classList.remove('open');
    if (currentScreen === 'match') {
      var frame = $('#gc-game');
      if (frame) {
        try {
          frame.focus({ preventScroll: true });
          if (frame.contentWindow) frame.contentWindow.focus();
        } catch (e) {}
      }
    }
  }

  function bind() {
    $('#gc-boot-enter').addEventListener('click', function () {
      clearTimeout(bootTimer);
      showScreen('login');
    });
    $('#gc-login-form').addEventListener('submit', function (event) {
      event.preventDefault();
      var input = $('#gc-name');
      var name = (input.value || C.defaultName).trim().slice(0, 12) || C.defaultName;
      state.name = name;
      save();
      showScreen('hub');
      setView('lobby');
      tone(680, .08);
      if (!state.tutorialDone) setTimeout(function () { startTutorial(false); }, 700);
    });
    $('#gc-name').addEventListener('input', function () {
      var button = $('#gc-login-btn');
      var name = this.value.trim() || C.defaultName;
      button.textContent = C.guestLabel + ' / 以 ' + name + ' 进入';
    });
    $$('[data-nav]').forEach(function (btn) {
      btn.addEventListener('click', function (event) {
        var target = btn.getAttribute('data-nav');
        if (target === 'settings' || target === 'garage' || target === 'career' || target === 'lobby') {
          event.preventDefault();
          setView(target);
          tone(500, .05);
        }
      });
    });
    $('[data-modes]').addEventListener('click', function (event) {
      var modeBtn = event.target.closest('[data-mode]');
      if (!modeBtn) return;
      state.mode = modeBtn.getAttribute('data-mode');
      save();
      renderLobby();
      tone(560, .05);
    });
    $('[data-filters]').addEventListener('click', function (event) {
      var filterBtn = event.target.closest('[data-filter]');
      if (!filterBtn) return;
      filter = filterBtn.getAttribute('data-filter');
      renderGarage();
    });
    $('[data-items]').addEventListener('click', function (event) {
      var card = event.target.closest('[data-item]');
      if (!card) return;
      selectItem(card.getAttribute('data-item'));
    });
    $('#gc-equip').addEventListener('click', equipItem);
    $('#gc-play').addEventListener('click', launchMatch);
    $('#gc-replay-tutorial').addEventListener('click', function () { startTutorial(true); });
    $('#gc-tut-next').addEventListener('click', advanceTutorial);
    $('#gc-tut-skip').addEventListener('click', function () { finishTutorial(true); });
    document.addEventListener('click', function (event) {
      if (!tutEl.classList.contains('open')) return;
      if (event.target.closest && event.target.closest('.gc-tut-card')) return;
      var step = C.tutorial[tutIndex];
      if (!step) return;
      var target = document.querySelector(step.target);
      if (!target) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      var hit = event.target === target || target.contains(event.target);
      if (!hit) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (target.id === 'gc-play') {
        markTutorialDone();
        closeTutorial();
        return;
      }
      setTimeout(advanceTutorial, 0);
    }, true);
    $('#gc-back').addEventListener('click', askBack);
    $('#gc-confirm-cancel').addEventListener('click', closeConfirm);
    $('#gc-confirm-ok').addEventListener('click', function () {
      var action = confirmAction;
      confirmAction = null;
      closeConfirm();
      if (action) action();
    });
    $('#gc-music').addEventListener('input', function () {
      state.music = Number(this.value);
      $('[data-music-label]').textContent = this.value + '%';
      save();
    });
    $('#gc-sfx').addEventListener('input', function () {
      state.sfx = Number(this.value);
      $('[data-sfx-label]').textContent = this.value + '%';
      save();
    });
    $('[data-quality]').addEventListener('click', function (event) {
      var q = event.target.closest('[data-q]');
      if (!q) return;
      state.quality = q.getAttribute('data-q');
      save();
      renderSettings();
    });
    $('#gc-reset').addEventListener('click', function () {
      openConfirm('重置本地档案？', '呼号、装备和任务进度都会清空，且无法恢复。', '确认重置', function () {
        try { localStorage.removeItem(KEY); } catch (e) {}
        location.reload();
      }, '取消');
    });
    window.addEventListener('resize', positionTutorialSpot);
    document.addEventListener('scroll', positionTutorialSpot, true);
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && $('#gc-confirm').classList.contains('open')) {
        event.preventDefault();
        closeConfirm();
      }
    });
  }

  spawnParticles();
  bind();
  renderHUD();
  renderAll();
  $('#gc-name').value = state.name || C.defaultName;
  $('#gc-login-btn').textContent = C.guestLabel + ' / 以 ' + ($('#gc-name').value) + ' 进入';
  bootTimer = setTimeout(function () {
    if (currentScreen === 'boot') showScreen('login');
  }, 1800);
})();
