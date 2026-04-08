// AI 行为引擎
// Phase 4: LLM 驱动决策 + 规则引擎回退

import { RESOURCE_TYPES } from '../data/recipes.js';
import { logger } from '../systems/Logger.js';

const ACTION = {
  IDLE: 'idle',
  WANDER: 'wander',
  GOTO: 'goto',
  COLLECT: 'collect',
  EAT: 'eat',
  FLEE: 'flee',
  RETURN_HOME: 'return_home',
  CRAFT: 'craft',
  FIGHT: 'fight',
  HUNT: 'hunt',
};

export class AIBehavior {
  constructor(gameState, worldObjects, craftingSystem, combatSystem, mapMemory, localLLM) {
    this.gs = gameState;
    this.world = worldObjects;
    this.crafting = craftingSystem;
    this.combat = combatSystem;
    this.memory = mapMemory;
    this.llm = localLLM;

    this.viewRange = 300;

    this.action = ACTION.IDLE;
    this.targetX = 0;
    this.targetY = 0;
    this.collectTarget = null;
    this.collectProgress = 0;
    this.huntTarget = null;
    this.craftTarget = null;
    this.craftProgress = 0;
    this.eatProgress = 0;

    this.lastThought = '';
    this.thoughtTimer = 0;

    // LLM 决策状态
    this.pendingDecision = false;
    this.periodicTimer = 0;
    this.lastTrigger = '';
    this.lastHp = gameState.ai.hp;

    // 资源刷新队列（游戏时间驱动）：[{ resource, remaining }]
    this.respawnQueue = [];

    // 暴露给 GameState（用于 LLM prompt 中查可合成配方）
    gameState._craftingSystem = craftingSystem;
  }

  update(dt) {
    const ai = this.gs.ai;
    this.thoughtTimer -= dt;
    if (this.thoughtTimer <= 0 && ai.bubble) ai.bubble = '';

    // 狼追击（始终运行，不受决策状态影响）
    this._checkWolfChase(dt);
    this.combat.update(dt);

    // 被攻击检测（唯一的环境触发器，10秒冷却）
    this._checkAttackTrigger(dt);

    // 周期性决策计时
    this.periodicTimer += dt;

    // 无限资源刷新（游戏时间驱动）
    for (let i = this.respawnQueue.length - 1; i >= 0; i--) {
      this.respawnQueue[i].remaining -= dt;
      if (this.respawnQueue[i].remaining <= 0) {
        this.respawnQueue[i].resource.depleted = false;
        this.respawnQueue.splice(i, 1);
      }
    }

    // 看门狗：pendingDecision 卡了超过15秒强制释放
    if (this.pendingDecision) {
      this._pendingTimer = (this._pendingTimer || 0) + dt;
      if (this._pendingTimer > 15) {
        logger.error('决策', 'pendingDecision卡死15秒，强制释放');
        this.pendingDecision = false;
        this._pendingTimer = 0;
        this.action = ACTION.IDLE;
      }
    } else {
      this._pendingTimer = 0;
    }

    // 决策触发（两种方式）
    if (!this.pendingDecision) {
      let shouldDecide = false;
      let trigger = '';

      // 方式1：行动完成 → 立即决策
      if (this.action === ACTION.IDLE) {
        shouldDecide = true;
        trigger = this.lastTrigger || '行动完成';
        this.lastTrigger = '';
      }
      // 方式2：周期性保底（8秒，移动类行动中）
      else if (this.periodicTimer > 8 && (
        this.action === ACTION.WANDER ||
        this.action === ACTION.GOTO ||
        this.action === ACTION.HUNT ||
        this.action === ACTION.FLEE ||
        this.action === ACTION.RETURN_HOME
      )) {
        shouldDecide = true;
        trigger = '周期性重新评估';
      }

      if (shouldDecide) {
        this.periodicTimer = 0; // 任何决策都重置周期计时器
        this._requestLLMDecision(trigger);
      }
    }

    // 执行当前行动
    this._execute(dt);
  }

  // 被攻击检测（10秒冷却防重复）
  _checkAttackTrigger(dt) {
    const ai = this.gs.ai;
    if (ai.hp < this.lastHp - 5 && !this.pendingDecision) {
      if (!this._attackTriggerCooldown || this._attackTriggerCooldown <= 0) {
        this.lastTrigger = `被攻击！生命从${Math.round(this.lastHp)}%降到${Math.round(ai.hp)}%`;
        this.action = ACTION.IDLE;
        this._attackTriggerCooldown = 10;
        logger.info('触发', '被攻击中断', { hp: Math.round(ai.hp) });
      }
    }
    this.lastHp = ai.hp;
    if (this._attackTriggerCooldown > 0) this._attackTriggerCooldown -= dt;
  }

  // 请求 LLM 决策
  async _requestLLMDecision(trigger) {
    if (this.pendingDecision) return;
    this.pendingDecision = true;

    const ai = this.gs.ai;
    ai.expression = 'thinking';
    this._think('...');

    // 收集视野信息
    const visible = this._getVisibleObjects();
    const memorySummary = this.memory ? this.memory.toPromptSummary(ai.x, ai.y) : null;

    try {
      const result = await this.llm.decide(this.gs, visible, memorySummary, trigger);
      this.pendingDecision = false;

      if (result) {
        this._applyLLMDecision(result);
      } else {
        // LLM 失败，回退规则引擎
        logger.warn('决策', '回退规则引擎');
        this._decideFallback();
      }
    } catch (e) {
      this.pendingDecision = false;
      logger.error('决策', '决策异常', e.message);
      this._decideFallback();
    }
  }

  // 解析坐标 target，如 "1550,1100" 或 "berry@1550,1100" 或 "(1550,1100)"
  _parseCoords(target) {
    if (!target) return null;
    const m = String(target).match(/(\d+)\s*[,，]\s*(\d+)/);
    if (m) return { x: parseInt(m[1]), y: parseInt(m[2]) };
    return null;
  }

  // 在 _lastVisibleObjects 中找最接近某坐标的资源/动物
  _findVisibleAt(coords, list) {
    if (!coords || !list) return null;
    let nearest = null, minDist = 50; // 50px容差
    for (const item of list) {
      const d = Math.hypot(item.x - coords.x, item.y - coords.y);
      if (d < minDist) { minDist = d; nearest = item; }
    }
    return nearest;
  }

  // 应用 LLM 决策
  _applyLLMDecision(result) {
    const ai = this.gs.ai;
    const { action, target, thought } = result;

    if (thought) this._think(thought);
    this.gs.logEvent(`LLM决策: ${action}`, target, thought);

    const coords = this._parseCoords(target);

    switch (action) {
      case 'collect': {
        // 优先：坐标精确定位
        if (coords) {
          const hit = this._findVisibleAt(coords, this._lastVisibleObjects?.resources);
          if (hit && hit._ref && !hit._ref.depleted) {
            this._goCollect(hit._ref);
            break;
          }
          // 坐标对应的资源不可用 → 找视野内任何还能采的资源
          logger.warn('决策', `坐标(${coords.x},${coords.y})资源不可用，找替代`);
          const altRes = this.world.resources
            .filter(r => !r.depleted && Math.hypot(r.x - ai.x, r.y - ai.y) <= this.viewRange)
            .sort((a,b) => Math.hypot(a.x-ai.x, a.y-ai.y) - Math.hypot(b.x-ai.x, b.y-ai.y))[0];
          if (altRes) {
            this._goCollect(altRes);
          } else {
            this._exploreUnknown();
          }
          break;
        }
        // 资源类型
        const typeMap = {
          'nearest_berry': 'berry', 'berry': 'berry', '浆果': 'berry',
          'nearest_wood': 'wood', 'wood': 'wood', '木头': 'wood',
          'nearest_stone': 'stone', 'stone': 'stone', '石头': 'stone',
          'nearest_grass': 'grass', 'grass': 'grass', '草': 'grass',
          'nearest_herb': 'herb', 'herb': 'herb', '止血草': 'herb',
          'nearest_clay': 'clay', 'clay': 'clay', '粘土': 'clay',
        };
        const resType = typeMap[target] || target;
        const res = this._findNearestResource(resType);
        if (res) {
          this._goCollect(res.obj);
        } else {
          const remembered = this.memory ? this.memory.findRememberedResource(resType, ai.x, ai.y) : null;
          if (remembered) {
            this.action = ACTION.GOTO;
            this.targetX = remembered.x;
            this.targetY = remembered.y;
          } else {
            this._exploreUnknown();
          }
        }
        break;
      }

      case 'eat': {
        // LLM 通过 target 指定吃哪种食物（如 "烤肉" / "浆果" / "生肉"）
        // 不指定就吃背包里的第一个食物（兼容旧调用）
        let foodIdx = -1;
        if (target && target !== 'best_food') {
          foodIdx = ai.inventory.findIndex(i => i.type === 'food' && i.name === target);
          if (foodIdx < 0) {
            logger.warn('决策', `背包没有 ${target}`);
          }
        }
        if (foodIdx < 0) {
          foodIdx = ai.inventory.findIndex(i => i.type === 'food');
        }
        if (foodIdx >= 0) {
          this._eatTargetIdx = foodIdx;
          this.action = ACTION.EAT;
          this.eatProgress = 0;
        } else {
          this.lastTrigger = '没有食物可吃';
          this._decideFallback();
        }
        break;
      }

      case 'craft': {
        const recipeMap = {
          'stick': 'stick', '木棍': 'stick',
          'stone_axe': 'stone_axe', '石斧': 'stone_axe',
          'stone_spear': 'stone_spear', '石矛': 'stone_spear',
          'campfire': 'campfire', '篝火': 'campfire',
          'basic_shelter': 'basic_shelter', '庇护所': 'basic_shelter', '简易庇护所': 'basic_shelter',
          'cooked_meat': 'cooked_meat', '烤肉': 'cooked_meat',
        };
        const recipeId = recipeMap[target] || target;
        if (this.crafting.canCraft(recipeId)) {
          // 需要在篝火旁？
          const recipe = this.crafting.getRecipe(recipeId);
          if (recipe && recipe.facility === 'campfire' && ai.campfirePos) {
            const dist = Math.hypot(ai.x - ai.campfirePos.x, ai.y - ai.campfirePos.y);
            if (dist > 60) {
              // 暂存待合成的配方，到达篝火后自动开始合成
              this._pendingCraftTarget = recipeId;
              this.action = ACTION.GOTO;
              this.targetX = ai.campfirePos.x;
              this.targetY = ai.campfirePos.y;
              break;
            }
          }
          this.action = ACTION.CRAFT;
          this.craftTarget = recipeId;
          this.craftProgress = 0;
        } else {
          logger.warn('决策', `无法合成 ${recipeId}，材料不足`);
          this._decideFallback();
        }
        break;
      }

      case 'hunt': {
        // 优先：坐标精确定位
        if (coords) {
          const hit = this._findVisibleAt(coords, this._lastVisibleObjects?.animals);
          if (hit && hit._ref && !hit._ref.dead) {
            this.action = ACTION.HUNT;
            this.huntTarget = hit._ref;
            this.targetX = hit._ref.x;
            this.targetY = hit._ref.y;
            ai.expression = 'determined';
            break;
          }
        }
        // 鹿暂时移除，所有 hunt fallback 都找兔子
        const prey = this._findNearest(this.world.rabbits, 300);
        if (prey) {
          this.action = ACTION.HUNT;
          this.huntTarget = prey.obj;
          this.targetX = prey.obj.x;
          this.targetY = prey.obj.y;
          ai.expression = 'determined';
        } else {
          this._exploreUnknown();
        }
        break;
      }

      case 'flee': {
        const wolf = this._findNearest(this.world.wolves, 300);
        if (wolf) {
          this._fleeFrom(wolf.obj.x, wolf.obj.y);
        } else {
          // 逃向某方向
          this._fleeDirection(target);
        }
        ai.expression = 'scared';
        break;
      }

      case 'fight': {
        const wolf = this._findNearest(this.world.wolves, 200);
        if (wolf) {
          this.action = ACTION.HUNT;
          this.huntTarget = wolf.obj;
          this.targetX = wolf.obj.x;
          this.targetY = wolf.obj.y;
          ai.expression = 'determined';
        } else {
          this.action = ACTION.IDLE;
        }
        break;
      }

      case 'goto': {
        // 优先：坐标
        if (coords) {
          this.action = ACTION.GOTO;
          this.targetX = coords.x;
          this.targetY = coords.y;
          break;
        }
        // 资源类型 → 转为 collect
        const resTypes = ['berry','wood','stone','grass','herb','clay','浆果','木头','石头','草','止血草','粘土'];
        if (resTypes.includes(target)) {
          logger.info('决策', `goto ${target} → 转为 collect ${target}`);
          const typeMap = {
            'berry':'berry','浆果':'berry','wood':'wood','木头':'wood',
            'stone':'stone','石头':'stone','grass':'grass','草':'grass',
            'herb':'herb','止血草':'herb','clay':'clay','粘土':'clay',
          };
          const resType = typeMap[target] || target;
          const res = this._findNearestResource(resType);
          if (res) {
            this._goCollect(res.obj);
          } else {
            const remembered = this.memory ? this.memory.findRememberedResource(resType, ai.x, ai.y) : null;
            if (remembered) {
              this.action = ACTION.GOTO;
              this.targetX = remembered.x;
              this.targetY = remembered.y;
            } else {
              this._exploreUnknown();
            }
          }
        } else if (target === 'shelter' && ai.shelterPos) {
          this.action = ACTION.GOTO;
          this.targetX = ai.shelterPos.x;
          this.targetY = ai.shelterPos.y;
        } else if (target === 'campfire' && ai.campfirePos) {
          this.action = ACTION.GOTO;
          this.targetX = ai.campfirePos.x;
          this.targetY = ai.campfirePos.y;
        } else {
          this._gotoDirection(target);
        }
        break;
      }

      case 'wander': {
        if (target === 'explore') {
          this._exploreUnknown();
        } else {
          this._wanderNear({ x: ai.x, y: ai.y }, 300);
        }
        break;
      }

      case 'wait': {
        this.action = ACTION.IDLE;
        ai.expression = 'normal';
        break;
      }

      default:
        this._decideFallback();
    }
  }

  // 回退规则引擎（精简版）
  _decideFallback() {
    const ai = this.gs.ai;

    // 天快黑了回家
    if (this.gs.dayTimeLeft < 25 && ai.shelterPos) {
      this.action = ACTION.RETURN_HOME;
      this.targetX = ai.shelterPos.x;
      this.targetY = ai.shelterPos.y;
      this._think('赶紧回家...');
      return;
    }

    // 饿了就吃
    if (ai.hunger < 20 && ai.inventory.find(i => i.type === 'food')) {
      this.action = ACTION.EAT;
      this.eatProgress = 0;
      this._think('先吃东西...');
      return;
    }

    // 附近有狼就跑
    const wolf = this._findNearest(this.world.wolves, 150);
    if (wolf) {
      this._fleeFrom(wolf.obj.x, wolf.obj.y);
      this._think('危险！');
      return;
    }

    // 闲逛
    this._wanderNear({ x: ai.x, y: ai.y }, 200);
    this._think('看看周围...');
  }

  // ===== 执行行动（和之前基本一样） =====

  _execute(dt) {
    const ai = this.gs.ai;
    const speed = this.action === ACTION.FLEE ? 2.5 :
                  this.action === ACTION.RETURN_HOME ? 1.8 :
                  this.action === ACTION.HUNT ? 2.0 : 1.2;

    switch (this.action) {
      case ACTION.GOTO:
      case ACTION.FLEE:
      case ACTION.RETURN_HOME:
      case ACTION.WANDER: {
        const dx = this.targetX - ai.x, dy = this.targetY - ai.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 5) {
          ai.x += (dx / dist) * speed;
          ai.y += (dy / dist) * speed;
          ai.x = Math.max(30, Math.min(3170, ai.x));
          ai.y = Math.max(30, Math.min(2370, ai.y));
        } else {
          if (this.action === ACTION.GOTO && this.collectTarget) {
            this.action = ACTION.COLLECT;
            this.collectProgress = 0;
          } else if (this.action === ACTION.GOTO && this._pendingCraftTarget) {
            // 走到篝火旁了，恢复合成
            this.action = ACTION.CRAFT;
            this.craftTarget = this._pendingCraftTarget;
            this._pendingCraftTarget = null;
            this.craftProgress = 0;
          } else if (this.action === ACTION.RETURN_HOME) {
            this.lastTrigger = '到家了';
            this.action = ACTION.IDLE;
          } else if (this.action === ACTION.FLEE) {
            this.lastTrigger = '逃跑结束';
            this.action = ACTION.IDLE;
          } else {
            this.lastTrigger = '到达目的地';
            this.action = ACTION.IDLE;
          }
        }
        break;
      }

      case ACTION.HUNT: {
        if (!this.huntTarget || this.huntTarget.dead) {
          this.lastTrigger = '猎物已死';
          this.action = ACTION.IDLE;
          break;
        }
        const dx = this.huntTarget.x - ai.x, dy = this.huntTarget.y - ai.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 30) {
          ai.x += (dx / dist) * speed;
          ai.y += (dy / dist) * speed;
          ai.expression = 'determined';
        } else if (this.combat.canAttack()) {
          const result = this.combat.attack(this.huntTarget);
          if (result === 'killed') {
            ai.expression = 'happy';
            this._think('抓到了！');
            this.huntTarget.dead = true;
            const meat = { type: 'food', name: '生肉', count: this.huntTarget.meatDrop || 1,
                          maxStack: 5, expiryDay: this.gs.day + 1, hungerRestore: 10 };
            this._addToInventory(meat);
            this.gs.logEvent('猎杀' + (this.huntTarget.species || '动物'), '成功', '获得生肉');
            this.huntTarget = null;
            this.lastTrigger = '猎杀成功，获得生肉';
            this.action = ACTION.IDLE;
          }
        }
        break;
      }

      case ACTION.COLLECT: {
        this.collectProgress += dt;
        ai.expression = 'determined';
        const ct = this.collectTarget;
        if (!ct) { this.lastTrigger = '采集目标消失'; this.action = ACTION.IDLE; break; }
        const resType = RESOURCE_TYPES[ct.resourceType];
        const collectTime = resType ? resType.collectTime : 2;
        const axeItem = ai.inventory.find(i => i.name === '石斧' && i.durability > 0);
        const useAxe = axeItem && (ct.resourceType === 'wood' || ct.resourceType === 'stone');
        const actualTime = collectTime * (useAxe ? 0.5 : 1);
        const pct = Math.min(100, Math.round(this.collectProgress / actualTime * 100));
        this.gs.ai.collectingInfo = { name: resType ? resType.name : '资源', progress: pct };

        if (this.collectProgress >= actualTime) {
          this.gs.ai.collectingInfo = null;
          if (!ct.depleted) {
            ct.depleted = true;
            if (useAxe && axeItem) {
              axeItem.durability--;
              if (axeItem.durability <= 0) {
                const idx = ai.inventory.indexOf(axeItem);
                if (idx >= 0) ai.inventory.splice(idx, 1);
                this._think('石斧坏了！');
              }
            }
            const res = resType || { name: '资源', type: 'material' };
            const item = { type: res.type, name: res.name, count: 1, maxStack: res.type === 'food' ? 5 : 10 };
            if (res.shelfLife) item.expiryDay = this.gs.day + res.shelfLife;
            if (res.hungerRestore) item.hungerRestore = res.hungerRestore;
            if (this._addToInventory(item)) {
              this.gs.logEvent('采集' + res.name, '成功', '');
              this.lastTrigger = '采集完成：' + res.name;
            } else {
              this.lastTrigger = '背包满了';
            }
            if (res.infinite) this.respawnQueue.push({ resource: ct, remaining: 3 });
          } else {
            this.lastTrigger = '资源已采空';
          }
          this.collectTarget = null;
          this.action = ACTION.IDLE;
        }
        break;
      }

      case ACTION.EAT: {
        // 用之前 _applyLLMDecision 里指定的索引；若失效则取第一个食物
        let foodIdx = (this._eatTargetIdx != null && ai.inventory[this._eatTargetIdx]?.type === 'food')
          ? this._eatTargetIdx
          : ai.inventory.findIndex(i => i.type === 'food');
        if (foodIdx < 0) {
          this.gs.ai.eatingInfo = null;
          this._eatTargetIdx = null;
          this.lastTrigger = '没有食物';
          this.action = ACTION.IDLE;
          break;
        }
        this.eatProgress = (this.eatProgress || 0) + dt;
        ai.expression = 'happy';
        const food = ai.inventory[foodIdx];
        const eatTime = 1.5;
        const pct = Math.min(100, Math.round(this.eatProgress / eatTime * 100));
        this.gs.ai.eatingInfo = { name: food.name, progress: pct };
        if (this.eatProgress >= eatTime) {
          const restore = food.hungerRestore || 15;
          ai.hunger = Math.min(100, ai.hunger + restore);
          food.count--;
          if (food.count <= 0) ai.inventory.splice(foodIdx, 1);
          this.gs.logEvent('进食' + food.name, '成功', `饥饿恢复到${Math.round(ai.hunger)}%`);
          this.gs.ai.eatingInfo = null;
          this.eatProgress = 0;
          this._eatTargetIdx = null;
          this.lastTrigger = '吃完了' + food.name;
          this.action = ACTION.IDLE;
        }
        break;
      }

      case ACTION.CRAFT: {
        if (!this.craftTarget) { this.action = ACTION.IDLE; break; }
        // 先检查能不能合成（避免等2秒后才发现不行）
        if (!this.crafting.canCraft(this.craftTarget)) {
          const recipe = this.crafting.getRecipe(this.craftTarget);
          logger.warn('决策', `合成失败：${recipe ? recipe.name : this.craftTarget}，材料不足`);
          this.gs.ai.craftingInfo = null;
          this.craftTarget = null;
          this.craftProgress = 0;
          this.lastTrigger = '合成失败，材料不足';
          this.action = ACTION.IDLE;
          break;
        }
        this.craftProgress = (this.craftProgress || 0) + dt;
        ai.expression = 'thinking';
        const pct = Math.round(this.craftProgress / 2 * 100);
        this.gs.ai.craftingInfo = { name: this.craftTarget, progress: Math.min(100, pct) };
        if (this.craftProgress < 2) break;
        const recipe = this.crafting.getRecipe(this.craftTarget);
        this.crafting.craft(this.craftTarget);
        ai.expression = 'happy';
        this.gs.logEvent('合成' + (recipe ? recipe.name : this.craftTarget), '成功', '');
        this.lastTrigger = '合成完成：' + (recipe ? recipe.name : this.craftTarget);
        this.gs.ai.craftingInfo = null;
        this.craftTarget = null;
        this.craftProgress = 0;
        this.action = ACTION.IDLE;
        break;
      }

      case ACTION.IDLE:
      default:
        if (!this.pendingDecision) ai.expression = 'normal';
        break;
    }
  }

  // 狼追击
  _checkWolfChase(dt) {
    const ai = this.gs.ai;
    for (const w of this.world.wolves) {
      if (w.dead) continue;
      const dist = Math.hypot(w.x - ai.x, w.y - ai.y);
      if (dist < 200) {
        const dx = ai.x - w.x, dy = ai.y - w.y;
        const d = Math.hypot(dx, dy) || 1;
        w.x += (dx / d) * 0.8 * dt * 60;
        w.y += (dy / d) * 0.8 * dt * 60;
        w.chasing = true;
        if (dist < 25) {
          if (!w.attackCooldown || w.attackCooldown <= 0) {
            this.combat.animalAttack(w);
            this.gs.logEvent('被狼攻击', '受伤', `生命值${Math.round(ai.hp)}%`);
            w.attackCooldown = 2;
          }
        }
      } else {
        w.chasing = false;
      }
      if (w.attackCooldown) w.attackCooldown -= dt;
    }
  }

  // ===== 工具方法 =====

  _think(text) {
    if (text) {
      this.gs.ai.bubble = text;
      this.lastThought = text;
      this.thoughtTimer = 3;
    }
  }

  // 收集视野内所有物体（供 LLM prompt，使用绝对坐标）
  _getVisibleObjects() {
    const ai = this.gs.ai;
    const result = { resources: [], animals: [], buildings: [] };

    for (const r of this.world.resources) {
      const dist = Math.hypot(r.x - ai.x, r.y - ai.y);
      if (dist > this.viewRange) continue;
      result.resources.push({
        type: r.resourceType, x: Math.round(r.x), y: Math.round(r.y),
        distance: Math.round(dist), depleted: r.depleted,
        _ref: r, // 内部引用，用于直接采集
      });
    }

    const allAnimals = [
      ...this.world.rabbits.map(a => ({ ref: a, type: '兔子', hostile: false })),
      ...this.world.wolves.map(a => ({ ref: a, type: '狼', hostile: true })),
      ...this.world.foxes.map(a => ({ ref: a, type: '狐狸', hostile: false })),
    ];
    for (const item of allAnimals) {
      const a = item.ref;
      if (a.dead) continue;
      const dist = Math.hypot(a.x - ai.x, a.y - ai.y);
      if (dist > this.viewRange) continue;
      result.animals.push({
        type: item.type, x: Math.round(a.x), y: Math.round(a.y),
        distance: Math.round(dist), hostile: item.hostile,
        _ref: a,
      });
    }

    if (ai.shelterPos) {
      const dist = Math.hypot(ai.shelterPos.x - ai.x, ai.shelterPos.y - ai.y);
      if (dist <= this.viewRange) {
        result.buildings.push({ type: '庇护所', x: Math.round(ai.shelterPos.x), y: Math.round(ai.shelterPos.y), distance: Math.round(dist) });
      }
    }
    if (ai.campfirePos) {
      const dist = Math.hypot(ai.campfirePos.x - ai.x, ai.campfirePos.y - ai.y);
      if (dist <= this.viewRange) {
        result.buildings.push({ type: '篝火', x: Math.round(ai.campfirePos.x), y: Math.round(ai.campfirePos.y), distance: Math.round(dist) });
      }
    }

    // 缓存供 _applyLLMDecision 使用
    this._lastVisibleObjects = result;
    return result;
  }

  _goCollect(resourceObj) {
    this.action = ACTION.GOTO;
    this.targetX = resourceObj.x;
    this.targetY = resourceObj.y;
    this.collectTarget = resourceObj;
  }

  _fleeFrom(fx, fy) {
    const ai = this.gs.ai;
    const dx = ai.x - fx, dy = ai.y - fy;
    const d = Math.hypot(dx, dy) || 1;
    this.targetX = Math.max(30, Math.min(3170, ai.x + (dx / d) * 250));
    this.targetY = Math.max(30, Math.min(2370, ai.y + (dy / d) * 250));
    this.action = ACTION.FLEE;
  }

  _fleeDirection(dir) {
    const ai = this.gs.ai;
    const dirAngles = { north: -Math.PI/2, south: Math.PI/2, east: 0, west: Math.PI,
      northeast: -Math.PI/4, southeast: Math.PI/4, northwest: -3*Math.PI/4, southwest: 3*Math.PI/4 };
    const angle = dirAngles[dir] || Math.random() * Math.PI * 2;
    this.targetX = Math.max(30, Math.min(3170, ai.x + Math.cos(angle) * 250));
    this.targetY = Math.max(30, Math.min(2370, ai.y + Math.sin(angle) * 250));
    this.action = ACTION.FLEE;
  }

  _gotoDirection(dir) {
    const ai = this.gs.ai;
    const dirAngles = { north: -Math.PI/2, south: Math.PI/2, east: 0, west: Math.PI,
      northeast: -Math.PI/4, southeast: Math.PI/4, northwest: -3*Math.PI/4, southwest: 3*Math.PI/4 };
    const angle = dirAngles[dir] || Math.random() * Math.PI * 2;
    const dist = 200 + Math.random() * 200;
    this.targetX = Math.max(30, Math.min(3170, ai.x + Math.cos(angle) * dist));
    this.targetY = Math.max(30, Math.min(2370, ai.y + Math.sin(angle) * dist));
    this.action = ACTION.GOTO;
  }

  _findNearest(list, maxDist) {
    const ai = this.gs.ai;
    const range = Math.min(maxDist, this.viewRange);
    let nearest = null, minDist = range;
    for (const obj of list) {
      if (obj.dead || obj.depleted) continue;
      const d = Math.hypot(obj.x - ai.x, obj.y - ai.y);
      if (d < minDist) { minDist = d; nearest = { obj, dist: d }; }
    }
    return nearest;
  }

  _findNearestResource(resourceType) {
    const ai = this.gs.ai;
    const list = this.world.resources.filter(r => r.resourceType === resourceType && !r.depleted);
    let nearest = null, minDist = this.viewRange;
    for (const r of list) {
      const d = Math.hypot(r.x - ai.x, r.y - ai.y);
      if (d < minDist) { minDist = d; nearest = { obj: r, dist: d }; }
    }
    return nearest;
  }

  _exploreUnknown() {
    const ai = this.gs.ai;
    if (this.memory) {
      const dir = this.memory.findUnexploredDirection(ai.x, ai.y);
      if (dir !== null) {
        const dist = 300 + Math.random() * 200;
        this.targetX = Math.max(50, Math.min(3150, ai.x + Math.cos(dir) * dist));
        this.targetY = Math.max(50, Math.min(2350, ai.y + Math.sin(dir) * dist));
        this.action = ACTION.WANDER;
        return;
      }
    }
    this._wanderNear({ x: ai.x, y: ai.y }, 300);
  }

  _wanderNear(center, radius) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * radius;
    this.targetX = Math.max(50, Math.min(3150, center.x + Math.cos(angle) * dist));
    this.targetY = Math.max(50, Math.min(2350, center.y + Math.sin(angle) * dist));
    this.action = ACTION.WANDER;
  }

  _addToInventory(item) {
    const inv = this.gs.ai.inventory;
    const existing = inv.find(i => i.name === item.name && i.count < (i.maxStack || 5));
    if (existing) { existing.count += item.count; return true; }
    if (inv.length < this.gs.ai.inventorySize) { inv.push({ ...item }); return true; }
    return false;
  }
}
