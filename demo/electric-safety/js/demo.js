/*
 * Portfolio demo layer for the electric safety frontend.
 * Patches /api requests with a localStorage-backed mock. No backend is used.
 */
(function () {
  'use strict';

  var DB_KEY = 'eledemo.db.v1';
  var TOKEN = 'demo-electric-token';
  var DEMO_BACK = '../../index.html#case-electric';

  if (!localStorage.getItem('token')) localStorage.setItem('token', TOKEN);
  if (!localStorage.getItem('username')) localStorage.setItem('username', '演示用户');
  if (!localStorage.getItem('role')) localStorage.setItem('role', 'admin');

  function now() {
    return new Date().toISOString().slice(0, 19).replace('T', ' ');
  }

  function makeSeed() {
    var tasks = [
      { id: 1, taskName: '10kV 城东线 1# 杆更换绝缘子', taskType: '检修作业', taskDesc: '带电区域邻近作业，需完成停电、验电、接地后更换绝缘子。', voltageLevel: '10kV', equipmentType: '配电线路', workType: '检修', status: 'processing', createTime: '2026-10-16 09:20:00' },
      { id: 2, taskName: '35kV 变电站主变例行试验', taskType: '试验作业', taskDesc: '主变预试、保护校验及二次回路检查。', voltageLevel: '35kV', equipmentType: '主变压器', workType: '试验', status: 'pending', createTime: '2026-10-15 15:40:00' },
      { id: 3, taskName: '110kV 电缆隧道巡检', taskType: '运维作业', taskDesc: '有限空间进入前气体检测与通风。', voltageLevel: '110kV', equipmentType: '电缆隧道', workType: '运维', status: 'completed', createTime: '2026-10-14 10:05:00' },
      { id: 4, taskName: '低压配电柜更换断路器', taskType: '检修作业', taskDesc: '低压柜停电更换断路器并复核回路。', voltageLevel: '低压', equipmentType: '低压配电柜', workType: '检修', status: 'pending', createTime: '2026-10-13 16:30:00' },
      { id: 5, taskName: '220kV 线路高空走线检查', taskType: '施工/检修', taskDesc: '高塔走线检查金具与导线磨损。', voltageLevel: '220kV', equipmentType: '架空线路', workType: '检修', status: 'processing', createTime: '2026-10-12 08:50:00' }
    ];
    var hazards = [
      { id: 1, taskId: 1, hazardName: '误登带电杆塔', category: '触电风险', hazardLevel: 'high', location: '1# 杆', description: '未核对线路名称与双重编号，可能误登邻近带电线路。' },
      { id: 2, taskId: 1, hazardName: '绝缘子吊装坠落', category: '高处坠落', hazardLevel: 'high', location: '1# 杆横担', description: '起吊过程中绝缘子或工具坠落，可能砸伤地面人员。' },
      { id: 3, taskId: 1, hazardName: '接地线装设顺序错误', category: '触电风险', hazardLevel: 'high', location: '1# 杆', description: '未按先接接地端、后接导体端的顺序装设接地线。' },
      { id: 4, taskId: 2, hazardName: '试验区域未隔离', category: '触电风险', hazardLevel: 'medium', location: '主变试验围栏', description: '试验区域未设置围栏和警示标识。' },
      { id: 5, taskId: 2, hazardName: '二次回路误碰', category: '设备损坏', hazardLevel: 'medium', location: '保护屏', description: '校验时误碰运行回路，可能造成保护误动。' },
      { id: 6, taskId: 3, hazardName: '隧道缺氧/有害气体', category: '有限空间', hazardLevel: 'high', location: '电缆隧道入口', description: '进入前未检测氧气与有害气体浓度。' },
      { id: 7, taskId: 4, hazardName: '低压柜残余电荷', category: '触电风险', hazardLevel: 'medium', location: '低压配电柜', description: '停电后未验电、放电，电容残余电荷可能伤人。' },
      { id: 8, taskId: 5, hazardName: '高处作业未系安全带', category: '高处坠落', hazardLevel: 'high', location: '220kV 铁塔', description: '移动过程中失去安全带保护。' }
    ];
    var measures = [
      { id: 1, taskId: 1, measureName: '核对线路双重编号', measureDesc: '工作负责人与登杆人员共同核对线路名称、杆号和色标，确认停电范围。', priority: 1 },
      { id: 2, taskId: 1, measureName: '验电与装设接地线', measureDesc: '先验电确认无电压，按先接地端、后导体端顺序装设接地线。', priority: 1 },
      { id: 3, taskId: 1, measureName: '设置高处作业监护', measureDesc: '杆下设置专职监护人，划定坠落半径并禁止无关人员进入。', priority: 2 },
      { id: 4, taskId: 1, measureName: '工具防坠绑扎', measureDesc: '所有工具、材料使用防坠绳绑扎，传递时使用工具袋。', priority: 2 },
      { id: 5, taskId: 2, measureName: '试验区域硬隔离', measureDesc: '试验区域设置围栏、警示灯和专人看守，确认人员撤离后加压。', priority: 1 },
      { id: 6, taskId: 2, measureName: '二次回路隔离', measureDesc: '对相关保护屏设置绝缘挡板，执行二次安全措施票。', priority: 2 },
      { id: 7, taskId: 3, measureName: '有限空间气体检测', measureDesc: '先通风、再检测、后作业；氧气与有害气体合格后方可进入。', priority: 1 },
      { id: 8, taskId: 4, measureName: '停电验电放电', measureDesc: '断开上级电源、验电并释放残余电荷，悬挂“禁止合闸”标示牌。', priority: 1 },
      { id: 9, taskId: 5, measureName: '双钩交替使用', measureDesc: '高处移动时始终保持至少一个安全钩挂在牢固构件上。', priority: 1 },
      { id: 10, taskId: 5, measureName: '风速监测', measureDesc: '作业前和作业中监测风速，超过规程限值立即停止高处作业。', priority: 2 }
    ];
    var disclosures = [
      { id: 1, taskId: 1, disclosureNo: 'JD-2026-1016-01', title: '10kV 城东线 1# 杆更换绝缘子安全交底', disclosureType: '检修作业', disclosureStatus: 'published', createTime: '2026-10-16 09:40:00', updateTime: '2026-10-16 10:05:00', content: '## 作业概况\n本次作业为 10kV 城东线 1# 杆更换绝缘子，采取停电作业方式。\n\n## 主要危险点\n- 误登带电杆塔导致触电\n- 绝缘子吊装过程中高处坠物\n- 接地线装设顺序错误\n\n## 安全控制措施\n- 核对线路双重编号并确认停电范围\n- 先验电，后按先接地端、后导体端顺序装设接地线\n- 杆下设置专职监护人，工具使用防坠绳\n\n## 应急处置\n发现人员触电立即切断电源，使用绝缘工具分离伤员并拨打 120。', emergencyContact: '王工 138****1200', emergencyRoute: '沿站内东侧通道撤离至集合点，联系电话 119/120' },
      { id: 2, taskId: 2, disclosureNo: 'JD-2026-1015-02', title: '35kV 主变例行试验安全交底', disclosureType: '试验作业', disclosureStatus: 'draft', createTime: '2026-10-15 16:10:00', updateTime: '2026-10-15 16:30:00', content: '## 作业概况\n主变预试、保护校验及二次回路检查。\n\n## 主要危险点\n- 试验区域未隔离\n- 二次回路误碰\n\n## 控制措施\n- 试验区域硬隔离并设专人看守\n- 执行二次安全措施票，设置绝缘挡板', emergencyContact: '李工 139****2200', emergencyRoute: '沿主控楼北门撤离至安全集合点' },
      { id: 3, taskId: 3, disclosureNo: 'JD-2026-1014-03', title: '110kV 电缆隧道巡检安全交底', disclosureType: '运维作业', disclosureStatus: 'published', createTime: '2026-10-14 10:30:00', updateTime: '2026-10-14 11:00:00', content: '## 作业概况\n110kV 电缆隧道例行巡检。\n\n## 主要危险点\n- 隧道缺氧或有害气体超标\n- 照明不足、地面湿滑\n\n## 控制措施\n- 先通风、再检测、后作业\n- 携带便携式气体检测仪和照明设备，保持通信畅通', emergencyContact: '周工 137****3300', emergencyRoute: '由隧道最近出口撤离至地面集合点' },
      { id: 4, taskId: 5, disclosureNo: 'JD-2026-1012-04', title: '220kV 线路高空走线检查安全交底', disclosureType: '检修作业', disclosureStatus: 'published', createTime: '2026-10-12 09:15:00', updateTime: '2026-10-12 09:45:00', content: '## 作业概况\n220kV 线路高空走线检查金具与导线磨损。\n\n## 主要危险点\n- 高处坠落\n- 工具材料坠落\n- 大风导致失衡\n\n## 控制措施\n- 双钩交替使用，移动时始终有一钩挂牢\n- 工具使用防坠绳，杆下设置警戒区\n- 作业前监测风速，超限立即停止', emergencyContact: '赵工 136****4400', emergencyRoute: '沿线路侧道路撤离至施工驻地' }
    ];
    var cases = [
      { id: 1, caseName: '误登带电线路触电事故', accidentType: '触电', severity: 'serious', occurTime: '2023-06-18', caseDesc: '作业人员未核对线路双重编号，误登邻近带电线路，造成触电灼伤。' },
      { id: 2, caseName: '绝缘子吊装高处坠物', accidentType: '物体打击', severity: 'general', occurTime: '2022-11-03', caseDesc: '起吊绝缘子时绑扎不牢，材料坠落造成地面人员受伤。' },
      { id: 3, caseName: '电缆隧道缺氧窒息', accidentType: '中毒窒息', severity: 'major', occurTime: '2024-03-12', caseDesc: '未进行气体检测直接进入隧道，作业人员缺氧昏迷。' },
      { id: 4, caseName: '试验区域误入触电', accidentType: '触电', severity: 'serious', occurTime: '2021-09-25', caseDesc: '试验围栏未封闭，无关人员误入加压区域。' },
      { id: 5, caseName: '安全带低挂高用坠落', accidentType: '高处坠落', severity: 'major', occurTime: '2023-08-07', caseDesc: '高处移动时安全带低挂高用，坠落冲击造成重伤。' },
      { id: 6, caseName: '低压柜残余电荷伤人', accidentType: '触电', severity: 'general', occurTime: '2022-05-19', caseDesc: '停电后未放电，电容残余电荷造成手部灼伤。' }
    ];
    var hazardDict = [
      ['HZ01', '触电风险', '误登带电设备、未验电或接地不良导致的触电风险'],
      ['HZ02', '高处坠落', '高处作业失去保护或脚手架、梯具失稳'],
      ['HZ03', '物体打击', '工具、材料、构件在吊装或传递中坠落'],
      ['HZ04', '机械伤害', '转动设备、起重机械或工器具造成伤害'],
      ['HZ05', '有限空间', '缺氧、有毒有害气体或通风不良'],
      ['HZ06', '火灾爆炸', '易燃物、动火作业或电气短路引发火灾'],
      ['HZ07', '设备损坏', '误碰运行设备或二次回路'],
      ['HZ08', '交通风险', '作业车辆、道路通行及现场运输风险']
    ].map(function (row, i) { return { id: i + 1, dictCode: row[0], dictName: row[1], dictDesc: row[2] }; });
    var measureDict = [
      ['CS01', '停电与验电', '断开电源、验电确认无电压并装设接地线'],
      ['CS02', '双重编号核对', '核对线路名称、杆号、色标与停电范围'],
      ['CS03', '高处作业防护', '安全带高挂低用，双钩交替，设置监护人'],
      ['CS04', '防坠物措施', '工具材料防坠绑扎，设置警戒区'],
      ['CS05', '有限空间检测', '先通风、再检测、后作业，配备气体检测仪'],
      ['CS06', '硬质围栏隔离', '试验、带电区域设置围栏与警示标识'],
      ['CS07', '二次安全措施票', '隔离相关回路，防止保护误动'],
      ['CS08', '风速与天气监测', '超限停止高处或吊装作业'],
      ['CS09', '个人防护用品', '安全帽、绝缘手套、绝缘靴、反光衣'],
      ['CS10', '应急联络与撤离', '明确应急联系人、撤离路线和集合点']
    ].map(function (row, i) { return { id: i + 1, dictCode: row[0], dictName: row[1], dictDesc: row[2] }; });
    return {
      tasks: tasks, hazards: hazards, measures: measures, disclosures: disclosures, cases: cases,
      hazardDict: hazardDict, measureDict: measureDict,
      user: { username: '演示用户', realName: '演示用户', role: 'admin', phone: '138****0000', email: 'demo@example.com', department: '安全监察部' },
      records: [
        { createTime: '2026-10-16 10:05:00', operationType: '生成交底', description: '生成 10kV 城东线 1# 杆更换绝缘子安全交底' },
        { createTime: '2026-10-15 16:30:00', operationType: '编辑任务', description: '更新 35kV 主变例行试验任务状态' },
        { createTime: '2026-10-14 11:00:00', operationType: '发布交底', description: '发布 110kV 电缆隧道巡检安全交底' }
      ]
    };
  }

  function loadDB() {
    try {
      var raw = localStorage.getItem(DB_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    var db = makeSeed();
    saveDB(db);
    return db;
  }

  function saveDB(db) {
    try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch (e) {}
  }

  function nextId(list) {
    return list.reduce(function (max, item) { return Math.max(max, Number(item.id) || 0); }, 0) + 1;
  }

  function json(data, status) {
    return new Response(JSON.stringify(data), {
      status: status || 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  function parseBody(body) {
    if (!body) return {};
    if (body instanceof FormData) {
      var obj = {};
      body.forEach(function (value, key) {
        if (key === 'file') obj.file = value;
        else obj[key] = value;
      });
      return obj;
    }
    if (typeof body === 'string') {
      try { return JSON.parse(body); } catch (e) { return Object.fromEntries(new URLSearchParams(body)); }
    }
    if (body instanceof URLSearchParams) return Object.fromEntries(body);
    return body;
  }

  function updateCollection(db, name, id, payload) {
    var list = db[name] || [];
    var item = list.find(function (x) { return Number(x.id) === Number(id); });
    if (!item) return null;
    Object.assign(item, payload, { id: Number(id) });
    saveDB(db);
    return item;
  }

  function removeFromCollection(db, name, id) {
    var list = db[name] || [];
    var next = list.filter(function (x) { return Number(x.id) !== Number(id); });
    db[name] = next;
    saveDB(db);
    return { success: true };
  }

  function createTaskAndFlow(db, body) {
    var id = nextId(db.tasks);
    var task = {
      id: id,
      taskName: body.taskName || '演示作业任务',
      taskType: body.workType || '检修作业',
      taskDesc: body.taskDesc || body.taskText || '',
      voltageLevel: body.voltageLevel || '10kV',
      equipmentType: '配电线路',
      workType: body.workType || '检修',
      status: 'processing',
      createTime: now()
    };
    db.tasks.unshift(task);
    var taskHazards = [
      { id: nextId(db.hazards), taskId: id, hazardName: '误入带电间隔', category: '触电风险', hazardLevel: 'high', location: '作业点', description: '未核对设备双重编号，可能误入带电间隔。' },
      { id: nextId(db.hazards) + 1, taskId: id, hazardName: '高处作业失去保护', category: '高处坠落', hazardLevel: 'high', location: '作业平台', description: '移动过程中未保持安全带可靠挂接。' },
      { id: nextId(db.hazards) + 2, taskId: id, hazardName: '工器具坠落', category: '物体打击', hazardLevel: 'medium', location: '作业点下方', description: '工具未绑扎，可能坠落伤及地面人员。' }
    ];
    taskHazards.forEach(function (h) { db.hazards.unshift(h); });
    var taskMeasures = [
      { id: nextId(db.measures), taskId: id, measureName: '核对设备双重编号', measureDesc: '工作负责人和作业人员共同核对设备名称、编号和停电范围。', priority: 1 },
      { id: nextId(db.measures) + 1, taskId: id, measureName: '验电与接地', measureDesc: '先验电确认无电压，再按顺序装设接地线。', priority: 1 },
      { id: nextId(db.measures) + 2, taskId: id, measureName: '高处作业监护', measureDesc: '设置专职监护人，安全带高挂低用，双钩交替。', priority: 2 },
      { id: nextId(db.measures) + 3, taskId: id, measureName: '工具防坠绑扎', measureDesc: '工具材料使用防坠绳，地面设置警戒区。', priority: 2 }
    ];
    taskMeasures.forEach(function (m) { db.measures.unshift(m); });
    var disclosure = {
      id: nextId(db.disclosures),
      taskId: id,
      disclosureNo: 'JD-DEMO-' + String(id).padStart(3, '0'),
      title: task.taskName + '安全交底',
      disclosureType: task.taskType,
      disclosureStatus: 'published',
      createTime: now(),
      updateTime: now(),
      content: '## 作业概况\n' + task.taskName + '\n\n## 主要危险点\n- 误入带电间隔\n- 高处坠落\n- 工具材料坠落\n\n## 安全控制措施\n- 核对设备双重编号，确认停电范围\n- 先验电、后接地，执行监护制度\n- 工具材料防坠绑扎，设置地面警戒\n\n> 本交底由演示模式生成，仅用于展示前端流程。',
      emergencyContact: '王工 138****1200',
      emergencyRoute: '沿作业点东侧通道撤离至集合点，紧急情况拨打 119/120'
    };
    db.disclosures.unshift(disclosure);
    saveDB(db);
    return { task: task, hazards: taskHazards, measures: taskMeasures, disclosure: disclosure };
  }

  function weatherPayload() {
    return {
      cityInfo: { cityCode: '101200901', cityName: '宜昌', province: '湖北' },
      current: {
        temp: '24', weatherText: '多云', shidu: '62%', windScale: '2', windDir: '东南风',
        quality: '优', sunrise: '06:32', sunset: '17:54', pm25: 28, pm10: 52,
        ganmao: '昼夜温差较大，注意增减衣物', aqi: 42, updateTime: '2026-10-18 10:00'
      },
      forecast: [
        { ymd: '2026-10-18', week: '周日', dayWeather: '多云', nightWeather: '晴', tempMax: '27', tempMin: '18', windDirDay: '东南风', windScaleDay: '2', aqi: 42, notice: '适宜户外作业' },
        { ymd: '2026-10-19', week: '周一', dayWeather: '晴', nightWeather: '晴', tempMax: '28', tempMin: '19', windDirDay: '东风', windScaleDay: '2', aqi: 38, notice: '注意补水' },
        { ymd: '2026-10-20', week: '周二', dayWeather: '小雨', nightWeather: '阴', tempMax: '23', tempMin: '16', windDirDay: '北风', windScaleDay: '3', aqi: 55, notice: '防滑防触电' },
        { ymd: '2026-10-21', week: '周三', dayWeather: '阴', nightWeather: '多云', tempMax: '22', tempMin: '15', windDirDay: '北风', windScaleDay: '3', aqi: 60, notice: '通风良好' },
        { ymd: '2026-10-22', week: '周四', dayWeather: '晴', nightWeather: '晴', tempMax: '25', tempMin: '17', windDirDay: '南风', windScaleDay: '2', aqi: 46, notice: '适宜检修' }
      ]
    };
  }

  function cities(keyword) {
    var all = [
      { cityCode: '101200901', cityName: '宜昌', province: '湖北' },
      { cityCode: '101200101', cityName: '武汉', province: '湖北' },
      { cityCode: '101200201', cityName: '襄阳', province: '湖北' },
      { cityCode: '101010100', cityName: '北京', province: '北京' },
      { cityCode: '101020100', cityName: '上海', province: '上海' },
      { cityCode: '101280101', cityName: '广州', province: '广东' },
      { cityCode: '101280601', cityName: '深圳', province: '广东' },
      { cityCode: '101210101', cityName: '杭州', province: '浙江' },
      { cityCode: '101190101', cityName: '南京', province: '江苏' }
    ];
    if (!keyword) return all;
    var q = String(keyword).toLowerCase();
    return all.filter(function (c) { return c.cityName.indexOf(keyword) >= 0 || c.cityCode.indexOf(q) >= 0 || c.province.indexOf(keyword) >= 0; });
  }

  function syntheticVision(width, height) {
    return {
      success: true,
      demo: true,
      width: width || 960,
      height: height || 540,
      persons: [
        { x: 0.18, y: 0.28, width: 0.16, height: 0.5, confidence: 0.94 },
        { x: 0.58, y: 0.34, width: 0.14, height: 0.44, confidence: 0.91 }
      ],
      workers: [
        { hasHelmet: false, hasSafetyBelt: true, hasReflectiveVest: true, usingPhone: false, smoking: false, hasViolation: true },
        { hasHelmet: true, hasSafetyBelt: false, hasReflectiveVest: true, usingPhone: true, smoking: false, hasViolation: true }
      ],
      fires: [{ x: 0.76, y: 0.2, width: 0.1, height: 0.16, confidence: 0.83 }],
      personCount: 2,
      violationCount: 2,
      totalTimeMs: 126,
      ppeSource: 'local',
      message: '演示模式：合成检测结果'
    };
  }

  async function route(method, pathname, body) {
    var db = loadDB();
    var url = new URL(pathname, location.href);
    var routePath = url.pathname.replace(/^\/api/, '').replace(/\/+$/, '');
    var parts = routePath.split('/').filter(Boolean);
    var payload = parseBody(body);

    if (method === 'OPTIONS') return json({ success: true, available: true, demo: true });

    if (parts[0] === 'auth') {
      if (parts[1] === 'login' || parts[1] === 'register') {
        return json({ success: true, token: TOKEN, access_token: TOKEN, user: db.user, message: '演示模式：已跳过真实认证' });
      }
      if (parts[1] === 'user-info') return json(db.user);
      if (parts[1] === 'operation-records') return json(db.records || []);
      if (parts[1] === 'update-profile') { Object.assign(db.user, payload); saveDB(db); return json({ success: true, user: db.user }); }
      if (parts[1] === 'change-password') return json({ success: true, message: '演示模式：密码未实际修改' });
      return json({ success: true });
    }

    if (parts[0] === 'agent') {
      if (parts[1] === 'cities' && parts[2] === 'search') return json(cities(url.searchParams.get('keyword') || ''));
      if (parts[1] === 'weather-check') {
        return json({
          weatherInfo: { type: '多云', low: '18', high: '27', windDir: '东南风', windScale: '2', aqi: 42 },
          highRisks: [], mediumRisks: [], lowRisks: [{ name: '昼夜温差', workRestriction: '注意增减衣物' }]
        });
      }
      if (parts[1] === 'chat') {
        return json({
          rejected: false,
          model: 'Demo Safety Agent',
          answer: '已根据当前任务识别出 3 个主要危险点：误入带电间隔、高处坠落和工具材料坠落。建议先核对设备双重编号、执行停电验电接地，再设置专职监护人。演示模式下的回答为预置内容，不连接真实模型。'
        });
      }
      if (parts[1] === 'complete-flow') return json(createTaskAndFlow(db, payload));
      if (parts[1] === 'parse') {
        return json({ task: { taskName: payload.taskText || payload.taskName || '演示作业任务', voltageLevel: payload.voltageLevel || '10kV', workType: payload.workType || '检修' } });
      }
      if (parts[1] === 'create-task') {
        var t = createTaskAndFlow(db, payload).task;
        return json(t);
      }
      return json({ success: true, demo: true });
    }

    if (parts[0] === 'weather') {
      if (parts[1] === 'search') return json(cities(url.searchParams.get('keyword') || ''));
      if (parts[1] === 'report') return json(weatherPayload());
      return json(weatherPayload());
    }

    if (parts[0] === 'vision' && parts[1] === 'detect') {
      var width = 960;
      var height = 540;
      if (payload.file && typeof createImageBitmap === 'function') {
        try {
          var bitmap = await createImageBitmap(payload.file);
          width = bitmap.width || width;
          height = bitmap.height || height;
          bitmap.close();
        } catch (e) {}
      }
      return json(syntheticVision(width, height));
    }

    if (parts[0] === 'tts') {
      // The detail page uses browser speech synthesis in the demo; this is a fallback.
      return json({ success: true, demo: true });
    }

    if (parts[0] === 'safety-measures') {
      var taskId = Number(parts[2]);
      return json((db.measures || []).filter(function (m) { return Number(m.taskId) === taskId; }));
    }

    if (parts[0] === 'dict') {
      var name = parts[1] === 'hazard' ? 'hazardDict' : 'measureDict';
      var list = db[name] || [];
      if (parts[2]) {
        var id = Number(parts[2]);
        if (method === 'GET') return json(list.find(function (x) { return Number(x.id) === id; }) || {});
        if (method === 'PUT') return json(updateCollection(db, name, id, payload) || { success: true });
        if (method === 'DELETE') return json(removeFromCollection(db, name, id));
      }
      if (method === 'POST') {
        var item = Object.assign({ id: nextId(list) }, payload);
        db[name].unshift(item); saveDB(db); return json(item);
      }
      return json(list);
    }

    var collectionMap = { tasks: 'tasks', hazards: 'hazards', disclosures: 'disclosures', 'accident-cases': 'cases' };
    if (collectionMap[parts[0]]) {
      var name2 = collectionMap[parts[0]];
      var collection = db[name2] || [];
      if (parts[0] === 'hazards' && parts[1] === 'task') {
        var tid = Number(parts[2]);
        return json(collection.filter(function (h) { return Number(h.taskId) === tid; }));
      }
      if (parts[1]) {
        var itemId = Number(parts[1]);
        var existing = collection.find(function (x) { return Number(x.id) === itemId; });
        if (method === 'GET') return existing ? json(existing) : json({ message: '演示数据不存在' }, 404);
        if (method === 'PUT') return existing ? json(updateCollection(db, name2, itemId, payload)) : json({ message: '演示数据不存在' }, 404);
        if (method === 'DELETE') return json(removeFromCollection(db, name2, itemId));
      }
      if (method === 'POST') {
        var made = Object.assign({ id: nextId(collection), createTime: now() }, payload);
        if (parts[0] === 'accident-cases' && !made.occurTime) made.occurTime = now().slice(0, 10);
        collection.unshift(made); saveDB(db); return json(made);
      }
      return json(collection);
    }

    return json({ success: true, demo: true, message: '演示模式：接口已模拟' });
  }

  var originalFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    init = init || {};
    var rawUrl = typeof input === 'string' ? input : input.url;
    var path = new URL(rawUrl, location.href).pathname;
    if (path.indexOf('/api/') !== 0) return originalFetch(input, init);
    var method = String(init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    var body = init.body;
    if (!body && input instanceof Request && method !== 'GET') {
      try { body = await input.clone().text(); } catch (e) {}
    }
    return route(method, path, body);
  };

  function banner() {
    if (document.querySelector('.demo-banner')) return;
    var el = document.createElement('div');
    el.className = 'demo-banner';
    el.setAttribute('role', 'status');
    el.innerHTML = '<div class="demo-banner-copy"><b>演示模式</b><span>本地模拟 API / AI / 检测 · 不连接后端</span></div>' +
      '<div class="demo-banner-actions"><button type="button" data-demo-reset>重置演示</button><a href="' + DEMO_BACK + '">返回作品集</a></div>';
    el.querySelector('[data-demo-reset]').addEventListener('click', function () {
      try {
        localStorage.removeItem(DB_KEY);
        Object.keys(localStorage).forEach(function (key) {
          if (key.indexOf('ele_chat') === 0 || key.indexOf('demo_') === 0) localStorage.removeItem(key);
        });
      } catch (e) {}
      location.reload();
    });
    document.body.appendChild(el);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', banner);
  else banner();

  window.__ELECTRIC_DEMO__ = {
    reset: function () {
      localStorage.removeItem(DB_KEY);
      location.reload();
    }
  };
})();
