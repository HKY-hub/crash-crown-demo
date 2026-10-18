// ============ 仓库：生化背包配置持久化（类似 CF 仓库 / 背包系统） ============
// 在内存 BACKPACKS 上合并 localStorage 保存的 8 个背包配置，游戏内 E/B 切换、出生装备均读取 BACKPACKS，因此仓库修改即刻全局生效。
const WH_KEY = 'zombie_warehouse_v1';
const WH_START_KEY = 'zombie_start_backpack';
const DEFAULT_BACKPACKS = JSON.parse(JSON.stringify(BACKPACKS));

function _whStoreOK() {
  try { return typeof localStorage !== 'undefined' && !!localStorage.getItem; } catch (e) { return false; }
}

// 把本地保存的仓库配置合并进 BACKPACKS（逐槽校验武器归属，非法槽位回退默认）
function applyWarehouseConfig() {
  if (!_whStoreOK()) return false;
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(WH_KEY) || 'null'); } catch (e) { saved = null; }
  if (!saved || !Array.isArray(saved)) return false;
  for (let i = 0; i < BACKPACKS.length; i++) {
    const s = saved[i];
    if (!s || typeof s !== 'object') continue;
    if (typeof s.name === 'string' && s.name.trim()) BACKPACKS[i].name = s.name.trim().slice(0, 12);
    if (s.loadout && typeof s.loadout === 'object') {
      const merged = {};
      for (const gid of WEAPON_GROUP_ORDER) {
        const k = s.loadout[gid];
        merged[gid] = (slotOfWeapon(k) === gid) ? k : DEFAULT_BACKPACKS[i].loadout[gid];
      }
      BACKPACKS[i].loadout = merged;
    }
    // 配件：逐槽校验适配武器，非法配件剔除；旧存档缺字段回退默认
    if (s.attachments && typeof s.attachments === 'object') {
      const mergedAtt = {};
      for (const gid of WEAPON_GROUP_ORDER) {
        const saved = Array.isArray(s.attachments[gid]) ? s.attachments[gid] : null;
        mergedAtt[gid] = effectiveAttachments(BACKPACKS[i].loadout[gid],
          saved != null ? saved : DEFAULT_BACKPACKS[i].attachments[gid]);
      }
      BACKPACKS[i].attachments = mergedAtt;
    }
    // 人物装备：逐槽校验归属，非法/旧存档回退默认
    if (s.equip && typeof s.equip === 'object') {
      const mergedEquip = {};
      for (const slot of Object.keys(EQUIP_SLOTS)) {
        const id = s.equip[slot];
        const def = DEFAULT_BACKPACKS[i].equip ? DEFAULT_BACKPACKS[i].equip[slot] : null;
        mergedEquip[slot] = (id && EQUIP_META[id] && EQUIP_META[id].slot === slot) ? id : def;
      }
      BACKPACKS[i].equip = mergedEquip;
    }
  }
  return true;
}

function getBackpacks() { return BACKPACKS; }

function saveWarehouseConfig(configs) {
  if (!_whStoreOK()) return false;
  try { localStorage.setItem(WH_KEY, JSON.stringify(configs)); return true; } catch (e) { return false; }
}

function resetWarehouseConfig() {
  for (let i = 0; i < BACKPACKS.length; i++) {
    BACKPACKS[i].name = DEFAULT_BACKPACKS[i].name;
    BACKPACKS[i].loadout = JSON.parse(JSON.stringify(DEFAULT_BACKPACKS[i].loadout));
    BACKPACKS[i].attachments = JSON.parse(JSON.stringify(DEFAULT_BACKPACKS[i].attachments));
    BACKPACKS[i].equip = JSON.parse(JSON.stringify(DEFAULT_BACKPACKS[i].equip));
  }
  if (_whStoreOK()) { try { localStorage.removeItem(WH_KEY); } catch (e) {} }
  return true;
}

function getStartBackpackIdx() {
  if (!_whStoreOK()) return 0;
  try {
    const v = parseInt(localStorage.getItem(WH_START_KEY), 10);
    return (v >= 0 && v < BACKPACKS.length) ? v : 0;
  } catch (e) { return 0; }
}
function saveStartBackpackIdx(idx) {
  if (!_whStoreOK()) return;
  try { localStorage.setItem(WH_START_KEY, String(idx)); } catch (e) {}
}

applyWarehouseConfig();
