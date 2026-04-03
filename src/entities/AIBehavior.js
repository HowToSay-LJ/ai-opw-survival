// AI 基础自主行为（规则引擎，Phase 4 会被 LLM 决策替代）
// 根据性格 + 当前状态选择行动

const ACTION = {
  IDLE: 'idle',
  WANDER: 'wander',
  GOTO: 'goto',
  COLLECT: 'collect',
  EAT: 'eat',
  FLEE: 'flee',
  RETURN_HOME: 'return_home',
};

export class AIBehavior {
  constructor(gameState, worldObjects) {
    this.gs = gameState;
    this.world = worldObjects; // { berries, shelterPos, campfirePos, wolves, ... }

    this.action = ACTION.IDLE;
    this.targetX = 0;
    this.targetY = 0;
    this.actionTimer = 0;
    this.collectTarget = null;  // 正在采集的资源引用
    this.collectProgress = 0;

    this.thinkCooldown = 0; // 决策冷却
    this.lastThought = '';
  }

  update(dt) {
    const ai = this.gs.ai;
    this.thinkCooldown -= dt;

    // 每隔一段时间重新决策
    if (this.thinkCooldown <= 0 || this.action === ACTION.IDLE) {
      this._decide();
      this.thinkCooldown = 2 + Math.random() * 2; // 2-4秒决策一次
    }

    // 执行当前行动
    this._execute(dt);
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
    const nearestWolf = this._findNearestThreat();
    if (nearestWolf && nearestWolf.dist < 150) {
      // 性格影响：莽撞型不怕狼（远一点才跑）
      const fleeThreshold = personality === 'reckless' ? 80 : 150;
      if (nearestWolf.dist < fleeThreshold) {
        const dx = ai.x - nearestWolf.x;
        const dy = ai.y - nearestWolf.y;
        const d = Math.hypot(dx, dy) || 1;
        this.targetX = ai.x + (dx / d) * 200;
        this.targetY = ai.y + (dy / d) * 200;
        this.action = ACTION.FLEE;
        ai.expression = 'scared';
        this._think('危险！快跑！');
        return;
      }
    }

    // 优先级3：很饿，找吃的或吃背包里的
    if (ai.hunger < 40) {
      // 先看背包有没有食物
      const food = ai.inventory.find(i => i.type === 'food');
      if (food) {
        this.action = ACTION.EAT;
        this._think('肚子好饿，吃点东西...');
        return;
      }
      // 没有就找最近的浆果丛
      const nearestBerry = this._findNearestBerry();
      if (nearestBerry) {
        this.action = ACTION.GOTO;
        this.targetX = nearestBerry.x;
        this.targetY = nearestBerry.y;
        this.collectTarget = nearestBerry;
        this._think('得找点吃的...');
        return;
      }
    }

    // 优先级4：根据性格自由行动
    if (personality === 'cautious') {
      // 谨慎型：在安全区附近晃，偶尔采浆果
      this._wanderNear(ai.shelterPos || { x: this.gs.ai.x, y: this.gs.ai.y }, 200);
      this._think(Math.random() > 0.5 ? '在附近看看...' : '');
    } else if (personality === 'reckless') {
      // 莽撞型：到处跑
      this._wanderFar();
      this._think(Math.random() > 0.5 ? '冲啊！去看看！' : '');
    } else {
      // 好奇型：往没去过的方向探索
      this._wanderFar();
      this._think(Math.random() > 0.5 ? '那边有什么呢...' : '');
    }
  }

  _execute(dt) {
    const ai = this.gs.ai;
    const speed = this.action === ACTION.FLEE ? 2.5 :
                  this.action === ACTION.RETURN_HOME ? 1.8 : 1.2;

    switch (this.action) {
      case ACTION.GOTO:
      case ACTION.FLEE:
      case ACTION.RETURN_HOME:
      case ACTION.WANDER: {
        const dx = this.targetX - ai.x;
        const dy = this.targetY - ai.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 5) {
          ai.x += (dx / dist) * speed;
          ai.y += (dy / dist) * speed;
          // 地图边界限制
          ai.x = Math.max(30, Math.min(this.gs.ai.x, 3170));
          ai.y = Math.max(30, Math.min(this.gs.ai.y, 2370));
        } else {
          // 到达目标
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
        // 移动时表情
        if (this.action === ACTION.WANDER) ai.expression = 'normal';
        if (this.action === ACTION.GOTO) ai.expression = 'curious';
        break;
      }

      case ACTION.COLLECT: {
        this.collectProgress += dt;
        ai.expression = 'normal';
        this._think('采集中...');
        // 采集需要2秒
        if (this.collectProgress >= 2) {
          if (this.collectTarget && !this.collectTarget.depleted) {
            // 采集成功
            this.collectTarget.depleted = true;
            const item = {
              type: 'food',
              name: '浆果',
              count: 1,
              maxStack: 5,
              expiryDay: this.gs.day + 2, // 2天后腐烂
            };
            this._addToInventory(item);
            ai.expression = 'happy';
            this._think('采到浆果了！');
            this.gs.logEvent('采集浆果', '成功', '找到浆果丛');
            // 采完直接吃
            if (ai.hunger < 60) {
              this.action = ACTION.EAT;
            } else {
              this.action = ACTION.IDLE;
            }
          } else {
            this._think('这里已经没有了...');
            this.action = ACTION.IDLE;
          }
          this.collectTarget = null;
        }
        break;
      }

      case ACTION.EAT: {
        const foodIdx = ai.inventory.findIndex(i => i.type === 'food');
        if (foodIdx >= 0) {
          const food = ai.inventory[foodIdx];
          // 恢复饥饿值
          const restore = food.name === '浆果' ? 20 :
                         food.name === '烤肉' ? 40 :
                         food.name === '蜂蜜' ? 50 : 15;
          ai.hunger = Math.min(100, ai.hunger + restore);
          food.count--;
          if (food.count <= 0) ai.inventory.splice(foodIdx, 1);
          ai.expression = 'happy';
          this._think('真好吃！');
          this.gs.logEvent('进食 ' + food.name, '成功', `饥饿恢复到${Math.round(ai.hunger)}%`);
        }
        this.action = ACTION.IDLE;
        break;
      }

      case ACTION.IDLE:
      default:
        ai.expression = 'normal';
        break;
    }
  }

  // 工具方法
  _think(text) {
    if (text && text !== this.lastThought) {
      this.gs.ai.bubble = text;
      this.lastThought = text;
    }
  }

  _findNearestBerry() {
    const ai = this.gs.ai;
    let nearest = null, minDist = Infinity;
    for (const b of this.world.berries) {
      if (b.depleted) continue;
      const d = Math.hypot(b.x - ai.x, b.y - ai.y);
      if (d < minDist) { minDist = d; nearest = b; }
    }
    return nearest;
  }

  _findNearestThreat() {
    const ai = this.gs.ai;
    let nearest = null, minDist = Infinity;
    for (const w of this.world.wolves) {
      const d = Math.hypot(w.x - ai.x, w.y - ai.y);
      if (d < minDist) { minDist = d; nearest = { x: w.x, y: w.y, dist: d }; }
    }
    return nearest;
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
    this.targetX = ai.x + Math.cos(angle) * dist;
    this.targetY = ai.y + Math.sin(angle) * dist;
    // 限制在地图内
    this.targetX = Math.max(50, Math.min(3150, this.targetX));
    this.targetY = Math.max(50, Math.min(2350, this.targetY));
    this.action = ACTION.WANDER;
  }

  _addToInventory(item) {
    const inv = this.gs.ai.inventory;
    // 尝试堆叠
    const existing = inv.find(i => i.name === item.name && i.count < i.maxStack);
    if (existing) {
      existing.count++;
      return true;
    }
    // 新格子
    if (inv.length < this.gs.ai.inventorySize) {
      inv.push({ ...item });
      return true;
    }
    return false; // 背包满了
  }
}
