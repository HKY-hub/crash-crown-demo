// Cosmetic human operator skins. Gameplay roles and collision stay on the entity.
const OperatorSkins = (() => {
  const ids = Object.freeze(['vanguard', 'bulwark', 'shade', 'medic', 'hazmat']);
  const info = Object.freeze({
    vanguard: Object.freeze({ name: '突击先锋' }),
    bulwark: Object.freeze({ name: '重甲卫士' }),
    shade: Object.freeze({ name: '暗影侦察' }),
    medic: Object.freeze({ name: '战地医疗' }),
    hazmat: Object.freeze({ name: '防化队员' }),
  });
  const art = Object.freeze({
    vanguard: typeof OperatorVanguard !== 'undefined' ? OperatorVanguard : null,
    bulwark: typeof OperatorBulwark !== 'undefined' ? OperatorBulwark : null,
    shade: typeof OperatorShade !== 'undefined' ? OperatorShade : null,
    medic: typeof OperatorMedic !== 'undefined' ? OperatorMedic : null,
    hazmat: typeof OperatorHazmat !== 'undefined' ? OperatorHazmat : null,
  });

  function normalize(id) { return ids.includes(id) ? id : 'vanguard'; }

  function get(id) {
    return art[normalize(id)] || art.vanguard;
  }

  function selected() {
    const select = typeof document !== 'undefined' ? document.getElementById('operatorSkin') : null;
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('zombie_operator_skin') : null;
    return normalize((select && select.value) || saved);
  }

  return Object.freeze({ ids, info, normalize, get, selected });
})();
