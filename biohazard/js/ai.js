// ============ AI：人类队友 + 僵尸追击/技能 ============
function _dist(e1, e2) {
  const ax = e1.x + e1.w / 2, ay = e1.y + e1.h / 2;
  const bx = e2.x + e2.w / 2, by = e2.y + e2.h / 2;
  return Math.hypot(bx - ax, by - ay);
}

// 前方是否有实体障碍（墙或台阶）
function blockedAhead(e, dir, dist, maxH) {
  const front = dir > 0 ? e.x + e.w : e.x;
  const a = Math.min(front, front + dir * dist);
  const b = Math.max(front, front + dir * dist);
  const feet = e.y + e.h;
  for (const s of level.solids) {
    if (s.oneway) continue;
    if (s.x < b && s.x + s.w > a && s.y < feet && feet - s.y < maxH) return true;
  }
  return false;
}

// 前方是否无地面（坑）
function noGroundAhead(e, dir, dist) {
  const x = (dir > 0 ? e.x + e.w : e.x) + dir * dist;
  return Level.groundBelow(x, e.y + e.h, e.w) < 0;
}

// ---------- 人类队友 ----------
function aiHumanUpdate(e, dt, game) {
  const vs = game && game.vs;
  if (vs && vs.mode === 'siege' && vs.phase === 'fight' && vs.obj && vs.obj.kind === 'bomb') {
    const working = vs._plant && vs._plant.ent === e;
    const canPlant = !vs.defuser && e.team === 'ATK' && inSiegeObj(e, vs.obj);
    const canDefuse = vs.defuser && e.team === 'DEF' && nearDefuser(e, vs.defuser);
    if (working || (!vs._plant && (canPlant || canDefuse))) {
      e.ai.move = 0; e.ai.fire = false; e.wantJump = false; e.vx = 0;
      if (!working) e._wantE = true;
      return;
    }
  }
  let target = null, best = Infinity;
  // VS 模式：AI 人类索敌目标是对立队伍的人类（竞技/攻防共用 hostile 判定）
  const isVS = game && game.vs;
  for (const z of game.entities) {
    if (z.dead || z === e || z.invisT > 0) continue;
    if (isVS) {
      if (z.kind !== 'human' || z.faction === 'zombie') continue;   // VS 双方皆人类，斗枪
      if (z.team != null && e.team != null && z.team === e.team) continue;   // 己方跳过
    } else {
      if (z.kind !== 'zombie' || z.faction === 'human') continue;   // 原逃亡模式：只打僵尸
    }
    const d = _dist(e, z);
    if (d < best) { best = d; target = z; }
  }
  e.ai.move = 0; e.wantJump = false;
  let engaging = false;

  if (target && best < CFG.AGGRO_RANGE) {
    engaging = true;
    const cx = e.x + e.w / 2, cy = entityFireY(e);
    // 瞄准必须写顶层 e.aim（tryFire 读 e.aim 计算弹道角）；e.ai.aim 无消费点，写它=打空气
    const hit = entityHurtBox(target);
    e.aim = Math.atan2(hit.y + hit.h / 2 - cy, hit.x + hit.w / 2 - cx)
          + (Math.random() - 0.5) * 0.09;
    e.facing = (e.aim >= -Math.PI / 2 && e.aim < Math.PI / 2) ? 1 : -1;   // 面向目标，配合子弹方向
    e.ai.fire = true;
    if (best < 75) e.ai.move = -1;                    // 近战威胁后退
    else if (best > 330) e.ai.move = target.x + target.w / 2 > cx ? 1 : -1;   // 太远前压
    if (e.onGround && best < 130 && Math.random() < dt * 0.8) e.wantJump = true;
  } else {
    e.ai.fire = false;
    if (isVS) {
      // VS 模式：无交战目标时向敌方半场推进，保持战线（不再贴玩家）
      let pushX = null;
      for (const q of game.entities) {
        if (q.dead || q.faction === 'zombie' || q.team == null || q.team === e.team) continue;   // 找最近敌方人类
        if (pushX == null || Math.abs((q.x + q.w / 2) - (e.x + e.w / 2)) < Math.abs(pushX - (e.x + e.w / 2))) pushX = q.x + q.w / 2;
      }
      if (pushX == null) pushX = e.x < level.worldW / 2 ? level.worldW - 80 : 80;   // 无敌人时压向对方半场
      const gp = Math.abs((e.x + e.w / 2) - pushX);
      if (gp > 300) e.ai.move = pushX > e.x + e.w / 2 ? 1 : -1;   // 远则压进
      else if (gp < 220) e.ai.move = pushX > e.x + e.w / 2 ? -1 : 1;   // 近则维持射距
    } else {
      // 跟随玩家保持队形：按 AI 序号错开间距（76/106/136px 三级梯队），避免狗皮膏药式贴脸
      const leader = game.player && game.player.kind === 'human' && !game.player.dead ? game.player : null;
      const Lx = leader ? (leader.x + leader.w / 2)
                        : (level.escapeZone ? level.escapeZone.x + 60 : e.x + e.w / 2);
      const desired = 76 + (e.id % 3) * 30;
      const gap = Lx - (e.x + e.w / 2);
      if (leader) {
        if (Math.abs(gap) > desired) e.ai.move = gap > 0 ? 1 : -1;
        else if (Math.abs(gap) < 24) e.ai.move = gap < 0 ? 1 : -1;   // 贴得太近稍后退让位
      } else {
        if (e.x < Lx - 30) e.ai.move = 1;
      }
    }
  }
  if (engaging) e.ai.backT = 0;                        // 战斗中不做反向绕行

  // 脱困反向绕行：卡在地形/人堆中临时反向小段距离，绕过障碍后恢复
  if (e.ai.backT > 0) {
    e.ai.backT -= dt;
    e.ai.move = -e.ai.lastMove;
  } else if (e.ai.move !== 0) {
    e.ai.lastMove = e.ai.move;
  }
  const dir = e.ai.move || e.facing;

  // 前方人类队友（含玩家）全身体宽避让：不硬穿人，停步等待（战斗中可穿过，靠分离兜底防叠）
  // 仅当队友位于行进方向前方且未重叠时停步；若已重叠则放行，让队形逻辑按间距分离（避免人堆卡死）
  if (e.ai.move !== 0 && !engaging) {
    const front = e.ai.move > 0 ? e.x + e.w : e.x;
    const probe = front + e.ai.move * 30;
    for (const h of game.entities) {
      if (h === e || h.kind !== 'human' || h.dead) continue;
      if (e.y + e.h - 4 > h.y && e.y + 4 < h.y + h.h) {
        if (e.ai.move > 0 && h.x >= front - 2 && h.x < probe) { e.ai.move = 0; break; }
        if (e.ai.move < 0 && h.x + h.w <= front + 2 && h.x + h.w > probe) { e.ai.move = 0; break; }
      }
    }
  }

  // 地形障碍：前方墙/台阶（可跳高度内）/坑 → 起跳
  const geoBlocked = e.onGround && (blockedAhead(e, dir, e.w + 10, 132) || noGroundAhead(e, dir, e.w + 20));
  if (geoBlocked) e.wantJump = true;

  // 卡住检测：意图移动但实际位移微小（被墙/台阶/人堆挡住），先起跳再反向绕行
  if (e.ai.prevX == null) e.ai.prevX = e.x;
  const moved = e.x - e.ai.prevX;
  e.ai.prevX = e.x;
  if (e.ai.move !== 0 && Math.abs(moved) < 3) {
    e.ai.stuckT = (e.ai.stuckT || 0) + dt;
    if (e.ai.stuckT > 0.12) e.wantJump = true;        // 卡住约 0.12s 即起跳脱困
    if (e.ai.stuckT > 0.5) {                          // 起跳仍过不去 → 反向绕行约 0.34s
      e.ai.backT = 0.34;
      e.ai.stuckT = 0;
    }
  } else e.ai.stuckT = 0;
}

// ---------- 僵尸 ----------
function aiZombieUpdate(e, dt, game) {
  let target = null, best = Infinity;
  for (const h of game.entities) {
    if (h.kind !== 'human' || h.dead) continue;
    const d = _dist(e, h);
    if (d < best) { best = d; target = h; }
  }
  if (!target) { e.aiMove = 0; return; }
  if (e.stunT > 0) { e.aiMove = 0; return; }   // 震荡眩晕：停止移动与技能
  e.target = target;
  const dx = target.x + target.w / 2 - (e.x + e.w / 2);
  const dir = dx > 0 ? 1 : -1;
  e.facing = dir;
  e.wantJump = false;

  // ---- 技能 ----
  const z = ZOMBIES[e.ztype];
  e.attackCd = Math.max(0, e.attackCd - dt);
  e.skillCd = Math.max(0, e.skillCd - dt);
  e.slamPrep = Math.max(0, e.slamPrep - dt);

  if (e.ztype === 'sprinter' && !e.dashing) {
    if (best > 90 && best < 520 && e.skillCd <= 0 && e.onGround) {
      e.dashing = true; e.dashT = z.dashDur; e.skillCd = z.dashCd; e.facing = dir;
    }
  }
  if (e.ztype === 'boomer' && best < z.boomRadius) {
    e.boomNow = true;
  }
  // 大母体：跳跃猛击（slamRadius）+ 召唤小僵尸（summonCd）+ 猩红母皇光环（auraRadius）
  if (isMotherType(e.ztype) && e.ztype !== 'mother_mini') {
    if (z.slamRadius && best < 260 && e.skillCd <= 0 && e.onGround) { e.slamPrep = 0.55; e.skillCd = z.slamCd; }
    if (z.summonCd) {
      e.spawnT = Math.max(0, (e.spawnT || 0) - dt);
      if (e.spawnT <= 0 && e.onGround) { doSummon(e); e.spawnT = z.summonCd; }
    }
    if (z.auraRadius) applyMotherAura(e, dt);
  }

  // ---- 移动 ----
  if (e.dashing) {
    e.dashT -= dt;
    if (e.dashT <= 0) e.dashing = false;
    e.aiMove = e.facing * 1.4;
    if (Math.random() < dt * 8) e.wantJump = true;
  } else if (e.slamPrep > 0) {
    e.aiMove = 0;                                  // 起跳蓄力
  } else if (e.zBackT > 0) {
    // 反向绕行脱困（避开高墙卡位）：退路是坑沿时必须收住，否则幽灵一路退进虚空摔死，
    // 门前尤其明显 —— 它贴着门被打断后退 70px 掉坑，门因此要磨很久才碎。
    if (e.onGround && noGroundAhead(e, -dir, e.w + 10)) {
      e.zBackT = 0; e.aiMove = 0;
    } else {
      e.zBackT -= dt;
      e.aiMove = -dir;
    }
  } else {
    e.aiMove = dir;
    if (e.onGround) {
      if (blockedAhead(e, dir, e.w + 8, 130)) {
        e.wantJump = true;
      } else if (noGroundAhead(e, dir, e.w + 18)) {
        // 坑边：目标已在坑对面才起跳，追着身边的敌人不跳坑（避免跳坑摔死）
        if (dir > 0 ? target.x + target.w > e.x + e.w + 40 : target.x < e.x - 40) e.wantJump = true;
      }
    }
  }

  // 卡住脱困：意图移动但位移远小于期望（被高墙/坑边/阵线挡住）→ 反向绕行一段再尝试
  // 阈值用「正常帧位移的一半」判定：normal/boomer/mother 帧位移仅 1.6~2.2px，固定 3px 阈值会把正常行走
  // 误判为卡住，导致僵尸群反复「走一段→反向退一段」在阵线前震荡聚集（用户反馈「使劲往左边走，卡在那里」）
  // 被人类阵线钳制属期望拦截（僵尸应顶在阵线前被挡住），反向绕行期间也不重复触发，避免死循环
  if (e.zPrevX == null) e.zPrevX = e.x;
  const zmoved = e.x - e.zPrevX;
  e.zPrevX = e.x;
  const _frontX = typeof humanFrontX === 'function' ? humanFrontX() : null;
  const _clamped = _frontX != null && e.x + e.w >= _frontX - 4;
  const _expect = ((ZOMBIES[e.ztype] && ZOMBIES[e.ztype].speed) || 140) * dt;
  if (e.aiMove !== 0 && Math.abs(zmoved) < _expect * 0.5 && !e.dashing && e.slamPrep <= 0 && e.zBackT <= 0) {
    if (!_clamped) {
      e.zStuckT += dt;
      if (e.zStuckT > 0.7) { e.zBackT = 0.5; e.zStuckT = 0; }
    } else e.zStuckT = 0;
  } else {
    e.zStuckT = 0;
  }
}
