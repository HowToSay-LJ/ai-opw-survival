// AI 基础自主行为（规则引擎，Phase 4 会被 LLM 决策替代）

import { RESOURCE_TYPES } from '../data/recipes.js';

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
  constructor(gameState, worldObjects, craftingSystem, combatSystem) {
    this.gs = gameState;
    this.world = worldObjects;
    this.crafting = craftingSystem;
    this.combat = combatSystem;

    this.action = ACTION.IDLE;
    this.targetX = 0;
    this.targetY = 0;
    this.actionTimer = 0;
    this.collectTarget = null;
    this.collectProgress = 0;
    this.huntTarget = null;

    this.thinkCooldown = 0;
    this.lastThought = '';
    this.thoughtTimer = 0; // 想法显示持续时间
  }

  update(dt) {
    const ai = this.gs.ai;
    this.thinkCooldown -= dt;
    this.thoughtTimer -= dt;

    // 想法消失
    if (this.thoughtTimer <= 0 && ai.bubble) {
      ai.bubble = '';
    }

    // 被狼追击检测
    this._checkWolfChase(dt);

    // 决策：IDLE时立即决策，其他行动中不打断（除非冷却到了且不在采集/战斗中）
    if (this.action === ACTION.IDLE) {
      this._decide();
      this.thinkCooldown = 3;
    } else if (this.thinkCooldown <= 0 && this.action === ACTION.WANDER) {
      // 只在闲逛时重新决策，采集/移动/战斗中不打断
      this._decide();
      this.thinkCooldown = 3;
    }

    this._execute(dt);
    this.combat.update(dt);
  }

  _decide() {
    const ai = this.gs.ai;
    const timeLeft = this.gs.dayTimeLeft;
    const personality = ai.personality;

    // 优先级1：快天黑了，回家
    if (timeLeft < 25 && ai.shelterPos) {
      const distHome = Math.hypot(ai.x - ai.shelterPos.x, ai.y - ai.shelterPos.y);
      if (distHome > 60) {
        this.action = ACTION.RETURN_HOME;
        this.targetX = ai.shelterPos.x;
        this.targetY = ai.shelterPos.y;
        this._think('天快黑了，得赶紧回去...');
        return;
      }
    }

    // 优先级2：附近有狼，逃跑
    const nearestWolf = this._findNearest(this.world.wolves, 180);
    if (nearestWolf) {
      const fleeThreshold = personality === 'reckless' ? 80 : 150;
      if (nearestWolf.dist < fleeThreshold) {
        this._fleeFrom(nearestWolf.obj.x, nearestWolf.obj.y);
        ai.expression = 'scared';
        this._think('危险！快跑！');
        return;
      }
    }

    // 优先级3：很饿，找吃的
    if (ai.hunger < 40) {
      // 背包有食物？
      const food = ai.inventory.find(i => i.type === 'food');
      if (food) {
        this.action = ACTION.EAT;
        this._think('肚子好饿，吃点东西...');
        return;
      }
      // 找最近的浆果
      const nearestBerry = this._findNearestResource('berry');
      if (nearestBerry) {
        this._goCollect(nearestBerry.obj);
        this._think('得找点吃的...');
        return;
      }
    }

    // 优先级4：能合成且需要合成（30%概率跳过，先干别的，增加行为多样性）
    const available = this.crafting.getAvailable();
    if (available.length > 0 && Math.random() > 0.3) {
      // 判断是否真的需要这个配方
      const shouldCraft = (id) => {
        if (id === 'basic_shelter') return !ai.shelterPos;
        if (id === 'campfire') return !ai.campfirePos;
        if (id === 'stone_spear') return !ai.equipment.weapon;
        if (id === 'stone_axe') return !this._hasItems('石斧', 1) && !ai.equipment.weapon;
        if (id === 'stick') return !this._hasItems('木棍', 2); // 最多备2个
        if (id === 'cooked_meat') return this._hasItems('生肉', 1);
        return false;
      };

      const priority = ['basic_shelter', 'campfire', 'stone_spear', 'cooked_meat', 'stick', 'stone_axe'];
      for (const id of priority) {
        const recipe = available.find(r => r.id === id);
        if (!recipe || !shouldCraft(id)) continue;

        // 需要在篝火旁？
        if (recipe.facility === 'campfire' && ai.campfirePos) {
          const distCamp = Math.hypot(ai.x - ai.campfirePos.x, ai.y - ai.campfirePos.y);
          if (distCamp > 60) {
            this.action = ACTION.GOTO;
            this.targetX = ai.campfirePos.x;
            this.targetY = ai.campfirePos.y;
            this._think('回去篝火旁...');
            return;
          }
        }

        this.action = ACTION.CRAFT;
        this.craftTarget = id;
        this.craftProgress = 0;
        this._think('做' + recipe.name + '...');
        return;
      }
    }

    // 优先级5：主动采集缺少的资源（20%概率先闲逛一下）
    const needed = this._whatDoINeed();
    if (needed && Math.random() > 0.2) {
      const res = this._findNearestResource(needed);
      if (res) {
        this._goCollect(res.obj);
        const names = { wood:'木头', stone:'石头', grass:'草', berry:'浆果', herb:'止血草', clay:'粘土' };
        this._think('去采' + (names[needed] || '资源') + '...');
        return;
      }
    }

    // 优先级6：有生肉去篝火旁烤
    if (this._hasItems('生肉', 1) && ai.campfirePos) {
      const distCamp = Math.hypot(ai.x - ai.campfirePos.x, ai.y - ai.campfirePos.y);
      if (distCamp > 60) {
        this.action = ACTION.GOTO;
        this.targetX = ai.campfirePos.x;
        this.targetY = ai.campfirePos.y;
        this._think('回去把肉烤了...');
        return;
      }
    }

    // 优先级7：篝火快没燃料了
    if (ai.campfirePos && ai.campfireFuel <= 1 && !this._hasItems('木头', 2)) {
      const tree = this._findNearestResource('wood');
      if (tree) {
        this._goCollect(tree.obj);
        this._think('得去砍点柴火...');
        return;
      }
    }

    // 优先级8：有武器就追兔子
    if (ai.equipment.weapon) {
      const rabbit = this._findNearest(this.world.rabbits, 250);
      if (rabbit) {
        this.action = ACTION.HUNT;
        this.huntTarget = rabbit.obj;
        this.targetX = rabbit.obj.x;
        this.targetY = rabbit.obj.y;
        this._think('追兔子！');
        return;
      }
    }

    // 默认：按性格自由行动
    // 偶尔停下来"看看周围"
    if (Math.random() < 0.15) {
      ai.expression = 'curious';
      this._think('看看周围...');
      this.action = ACTION.IDLE;
      this.thinkCooldown = 2 + Math.random() * 3; // 停一会儿再决策
      return;
    }

    const wanderRadius = personality === 'cautious' ? 300 : personality === 'reckless' ? 600 : 450;
    // 有时从家出发，有时从当前位置出发
    const center = Math.random() > 0.4 ? (ai.shelterPos || { x: ai.x, y: ai.y }) : { x: ai.x, y: ai.y };
    this._wanderNear(center, wanderRadius);
    const thoughts = {
      cautious: ['在附近看看...', '小心翼翼...', '安全第一...', '这里还算安全', '要不要走远点呢...'],
      reckless: ['冲啊！', '去看看！', '不怕不怕！', '那边是什么！', '哈哈冒险！'],
      curious: ['那边有什么呢...', '好想去看看...', '探索！', '这个没见过', '走远点看看'],
    };
    const t = thoughts[personality] || thoughts.cautious;
    if (Math.random() > 0.5) this._think(t[Math.floor(Math.random() * t.length)]);
  }

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
          } else if (this.action === ACTION.RETURN_HOME) {
            ai.expression = 'happy';
            this._think('到家了！');
            this.action = ACTION.IDLE;
          } else if (this.action === ACTION.FLEE) {
            ai.expression = 'determined';
            this._think('应该安全了...');
            this.action = ACTION.IDLE;
          } else {
            this.action = ACTION.IDLE;
          }
        }
        if (this.action === ACTION.WANDER) ai.expression = 'normal';
        if (this.action === ACTION.GOTO) ai.expression = 'curious';
        break;
      }

      case ACTION.HUNT: {
        if (!this.huntTarget || this.huntTarget.dead) {
          this.action = ACTION.IDLE;
          break;
        }
        // 追猎物
        const dx = this.huntTarget.x - ai.x, dy = this.huntTarget.y - ai.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 30) {
          ai.x += (dx / dist) * speed;
          ai.y += (dy / dist) * speed;
          ai.expression = 'determined';
        } else if (this.combat.canAttack()) {
          // 攻击
          const result = this.combat.attack(this.huntTarget);
          if (result === 'killed') {
            ai.expression = 'happy';
            this._think('抓到了！');
            this.huntTarget.dead = true;
            // 掉落生肉
            const meat = { type: 'food', name: '生肉', count: this.huntTarget.meatDrop || 1,
                          maxStack: 5, expiryDay: this.gs.day + 1, hungerRestore: 10 };
            this._addToInventory(meat);
            this.gs.logEvent('猎杀' + (this.huntTarget.species || '动物'), '成功', '获得生肉');
            this.huntTarget = null;
            this.action = ACTION.IDLE;
          } else {
            this._think('打！');
          }
        }
        break;
      }

      case ACTION.COLLECT: {
        this.collectProgress += dt;
        ai.expression = 'determined';
        const ct = this.collectTarget;
        if (!ct) { this.action = ACTION.IDLE; break; }

        const resType = RESOURCE_TYPES[ct.resourceType];
        const collectTime = resType ? resType.collectTime : 2;
        const hasAxe = ai.inventory.find(i => i.name === '石斧');
        const axeBonus = hasAxe && (ct.resourceType === 'wood' || ct.resourceType === 'stone') ? 0.5 : 1;
        const actualTime = collectTime * axeBonus;

        // 暴露采集进度给渲染层
        const pct = Math.min(100, Math.round(this.collectProgress / actualTime * 100));
        this.gs.ai.collectingInfo = { name: resType ? resType.name : '资源', progress: pct };

        if (this.collectProgress >= actualTime) {
          this.gs.ai.collectingInfo = null;
          if (!ct.depleted) {
            ct.depleted = true;
            const res = resType || { name: '资源', type: 'material' };
            const item = {
              type: res.type,
              name: res.name,
              count: 1,
              maxStack: res.type === 'food' ? 5 : 10,
            };
            if (res.shelfLife) item.expiryDay = this.gs.day + res.shelfLife;
            if (res.hungerRestore) item.hungerRestore = res.hungerRestore;

            if (this._addToInventory(item)) {
              ai.expression = 'happy';
              this._think('采到' + res.name + '了！');
              this.gs.logEvent('采集' + res.name, '成功', '');
            } else {
              this._think('背包满了...');
            }

            // 无限资源3秒后刷新
            if (res.infinite) {
              setTimeout(() => { ct.depleted = false; }, 3000);
            }

            // 采完食物且饿了就吃
            if (res.type === 'food' && ai.hunger < 60) {
              this.action = ACTION.EAT;
            } else {
              this.action = ACTION.IDLE;
            }
          } else {
            this._think('这里已经没有了...');
            this.gs.ai.collectingInfo = null;
            this.action = ACTION.IDLE;
          }
          this.collectTarget = null;
        }
        break;
      }

      case ACTION.EAT: {
        const foodIdx = ai.inventory.findIndex(i => i.type === 'food');
        if (foodIdx < 0) { this.gs.ai.eatingInfo = null; this.action = ACTION.IDLE; break; }
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
          this._think('吃' + food.name + '！真好吃');
          this.gs.logEvent('进食' + food.name, '成功', `饥饿恢复到${Math.round(ai.hunger)}%`);
          this.gs.ai.eatingInfo = null;
          this.eatProgress = 0;
          this.action = ACTION.IDLE;
        }
        break;
      }

      case ACTION.CRAFT: {
        if (!this.craftTarget) { this.action = ACTION.IDLE; break; }
        this.craftProgress = (this.craftProgress || 0) + dt;
        ai.expression = 'thinking';
        // 合成需要2秒
        if (this.craftProgress < 2) {
          // 显示进度
          const pct = Math.round(this.craftProgress / 2 * 100);
          this.gs.ai.craftingInfo = { name: this.craftTarget, progress: pct };
          break;
        }
        // 合成完成
        if (this.crafting.canCraft(this.craftTarget)) {
          const recipe = this.crafting.getRecipe(this.craftTarget);
          this.crafting.craft(this.craftTarget);
          ai.expression = 'happy';
          this._think('做好了' + (recipe ? recipe.name : '') + '！');
          this.gs.logEvent('合成' + (recipe ? recipe.name : this.craftTarget), '成功', '');
        } else {
          this._think('材料不够了...');
        }
        this.gs.ai.craftingInfo = null;
        this.craftTarget = null;
        this.craftProgress = 0;
        this.action = ACTION.IDLE;
        break;
      }

      case ACTION.IDLE:
      default:
        ai.expression = 'normal';
        break;
    }
  }

  // 狼的追击逻辑
  _checkWolfChase(dt) {
    const ai = this.gs.ai;
    for (const w of this.world.wolves) {
      if (w.dead) continue;
      const dist = Math.hypot(w.x - ai.x, w.y - ai.y);

      // 狼的追击范围
      if (dist < 200) {
        // 狼向AI移动
        const dx = ai.x - w.x, dy = ai.y - w.y;
        const d = Math.hypot(dx, dy) || 1;
        w.x += (dx / d) * 0.8 * dt * 60;
        w.y += (dy / d) * 0.8 * dt * 60;
        w.chasing = true;

        // 狼攻击
        if (dist < 25) {
          if (!w.attackCooldown || w.attackCooldown <= 0) {
            this.combat.animalAttack(w);
            this.gs.logEvent('被狼攻击', '受伤', `生命值${Math.round(ai.hp)}%`);
            ai.expression = 'scared';
            this._think('被咬了！好疼！');
            w.attackCooldown = 2;
          }
        }
      } else {
        w.chasing = false;
      }

      if (w.attackCooldown) w.attackCooldown -= dt;
    }
  }

  // 工具方法
  _think(text) {
    if (text && text !== this.lastThought) {
      this.gs.ai.bubble = text;
      this.lastThought = text;
      this.thoughtTimer = 3; // 显示3秒
    }
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
    this.targetX = ai.x + (dx / d) * 250;
    this.targetY = ai.y + (dy / d) * 250;
    this.targetX = Math.max(30, Math.min(3170, this.targetX));
    this.targetY = Math.max(30, Math.min(2370, this.targetY));
    this.action = ACTION.FLEE;
  }

  _findNearest(list, maxDist) {
    const ai = this.gs.ai;
    let nearest = null, minDist = maxDist;
    for (const obj of list) {
      if (obj.dead || obj.depleted) continue;
      const d = Math.hypot(obj.x - ai.x, obj.y - ai.y);
      if (d < minDist) { minDist = d; nearest = { obj, dist: d }; }
    }
    return nearest;
  }

  _findNearestResource(resourceType) {
    const list = this.world.resources.filter(r => r.resourceType === resourceType && !r.depleted);
    const ai = this.gs.ai;
    let nearest = null, minDist = Infinity;
    for (const r of list) {
      const d = Math.hypot(r.x - ai.x, r.y - ai.y);
      if (d < minDist) { minDist = d; nearest = { obj: r, dist: d }; }
    }
    return nearest;
  }

  _hasItems(name, count) {
    return this.gs.ai.inventory.filter(i => i.name === name).reduce((s, i) => s + i.count, 0) >= count;
  }

  _whatDoINeed() {
    const ai = this.gs.ai;
    // 阶段1：庇护所（草+木头）
    if (!ai.shelterPos) {
      if (!this._hasItems('草', 1)) return 'grass';
      if (!this._hasItems('木头', 1)) return 'wood';
    }
    // 阶段2：篝火（石头+木头）
    if (!ai.campfirePos) {
      if (!this._hasItems('石头', 1)) return 'stone';
      if (!this._hasItems('木头', 1)) return 'wood';
    }
    // 阶段3：武器（木棍→需要木头，石矛→需要木棍+石头×2）
    if (!ai.equipment.weapon) {
      if (!this._hasItems('木棍', 1)) {
        if (!this._hasItems('木头', 1)) return 'wood';
      }
      if (this._hasItems('木棍', 1) && !this._hasItems('石头', 2)) return 'stone';
    }
    // 阶段4：补充木头（篝火燃料+备用）
    if (!this._hasItems('木头', 3)) return 'wood';
    // 阶段5：补充食物
    if (ai.hunger < 70) return 'berry';
    return null;
  }

  _wanderNear(center, radius) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * radius;
    this.targetX = center.x + Math.cos(angle) * dist;
    this.targetY = center.y + Math.sin(angle) * dist;
    this.action = ACTION.WANDER;
  }

  _wanderFar() {
    const ai = this.gs.ai;
    const angle = Math.random() * Math.PI * 2;
    const dist = 150 + Math.random() * 300;
    this.targetX = Math.max(50, Math.min(3150, ai.x + Math.cos(angle) * dist));
    this.targetY = Math.max(50, Math.min(2350, ai.y + Math.sin(angle) * dist));
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
