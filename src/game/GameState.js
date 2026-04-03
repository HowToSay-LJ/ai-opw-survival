// 游戏全局状态管理

export const PHASE = {
  START: 'start',
  CHARACTER_SELECT: 'character_select',
  DAY: 'day',
  NIGHT_SETTLE: 'night_settle',
  NIGHT_REPORT: 'night_report',
  NIGHT_MESSAGE: 'night_message',
  STRATEGY_UPDATE: 'strategy_update',
  DEATH: 'death',
  RESULT: 'result',
};

export class GameState {
  constructor() {
    this.phase = PHASE.START;
    this.day = 1;
    this.dayTimeLeft = 90; // 白天剩余秒数
    this.dayDuration = 90; // 白天总时长

    // AI 角色状态
    this.ai = {
      hp: 100,
      maxHp: 100,
      hunger: 100, // 100=饱，0=饥饿
      x: 0,
      y: 0,
      expression: 'curious',
      personality: 'cautious', // cautious | reckless | curious
      bubble: '',

      // 背包（8格上限，每格 { type, name, count, maxStack, durability?, expiryDay? }）
      inventory: [],
      inventorySize: 8,

      // 装备
      equipment: { weapon: null, armor: null },

      // 建筑
      shelterPos: null,
      shelterType: null, // 'basic' | 'wood'
      shelterDaysLeft: null, // basic=3天后损坏，wood=永久(null)
      campfirePos: null,
      campfireFuel: 0, // 木头数量，每天消耗1

      // 中毒状态
      poisoned: false,
      poisonDaysLeft: 0,
    };

    // 夜晚数据
    this.nightReport = '';       // AI 汇报文本
    this.nightSettleText = '';   // 夜间结算文本
    this.playerMessage = '';     // 玩家留言
    this.strategyBook = '';      // 策略手册
    this.strategyDiff = [];      // 策略变更 [{type:'add'|'change'|'keep', text}]

    // 历史记录（用于结算回顾）
    this.history = []; // [{day, message, changes, events}]

    // 事件日志（当天）
    this.todayEvents = [];
  }

  // 开始新的一天
  startDay() {
    this.phase = PHASE.DAY;
    this.dayTimeLeft = this.dayDuration;
    this.todayEvents = [];
    this.ai.bubble = '';
  }

  // 白天 tick（每帧调用）
  tickDay(dt) {
    if (this.phase !== PHASE.DAY) return;

    this.dayTimeLeft -= dt;

    // 饥饿消耗（每秒约0.8，90秒消耗约72点，需要进食补充）
    this.ai.hunger = Math.max(0, this.ai.hunger - 0.8 * dt);

    // 饥饿掉血
    if (this.ai.hunger <= 0) {
      this.ai.hp = Math.max(0, this.ai.hp - 0.5 * dt);
    }

    // 中毒掉血
    if (this.ai.poisoned) {
      this.ai.hp = Math.max(0, this.ai.hp - 0.3 * dt);
    }

    // 死亡检测
    if (this.ai.hp <= 0) {
      this.ai.hp = 0;
      this.phase = PHASE.DEATH;
      return;
    }

    // 天黑了
    if (this.dayTimeLeft <= 0) {
      this.dayTimeLeft = 0;
      this.enterNight();
    }
  }

  // 进入夜晚
  enterNight() {
    // 夜间结算
    this.settleNight();
    this.phase = PHASE.NIGHT_SETTLE;
  }

  // 夜间结算（一次性计算）
  settleNight() {
    let settleText = '';
    let hpChange = 0;

    const hasShelter = this.ai.shelterPos !== null;
    const hasCampfire = this.ai.campfirePos !== null && this.ai.campfireFuel > 0;

    if (hasShelter && hasCampfire) {
      hpChange = 5;
      settleText = '在庇护所里烤着火，休息得不错。(+5 生命)';
      this.ai.campfireFuel -= 1;
    } else if (hasShelter) {
      hpChange = -5 - this.day; // 随天数寒冷加剧
      settleText = `庇护所里没有篝火，有点冷。(${hpChange} 生命)`;
    } else {
      hpChange = -10 - this.day * 2;
      settleText = `露宿野外，冻得够呛。(${hpChange} 生命)`;
    }

    this.ai.hp = Math.max(0, Math.min(this.ai.maxHp, this.ai.hp + hpChange));

    // 简易庇护所耐久
    if (this.ai.shelterType === 'basic') {
      this.ai.shelterDaysLeft--;
      if (this.ai.shelterDaysLeft <= 0) {
        settleText += '\n简易庇护所已经损坏了！';
        this.ai.shelterPos = null;
        this.ai.shelterType = null;
        this.ai.shelterDaysLeft = null;
      }
    }

    // 中毒恢复
    if (this.ai.poisoned) {
      this.ai.poisonDaysLeft--;
      if (this.ai.poisonDaysLeft <= 0) {
        this.ai.poisoned = false;
        settleText += '\n蛇毒终于消退了。';
      } else {
        settleText += `\n蛇毒还在发作...还需要${this.ai.poisonDaysLeft}天恢复。`;
      }
    }

    // 死亡检测
    if (this.ai.hp <= 0) {
      this.ai.hp = 0;
      this.phase = PHASE.DEATH;
      return;
    }

    this.nightSettleText = settleText;
  }

  // 进入汇报阶段
  enterReport(reportText) {
    this.nightReport = reportText;
    this.phase = PHASE.NIGHT_REPORT;
  }

  // 进入留言阶段
  enterMessage() {
    this.phase = PHASE.NIGHT_MESSAGE;
    this.playerMessage = '';
  }

  // 提交留言
  submitMessage(msg) {
    this.playerMessage = msg;
    this.phase = PHASE.STRATEGY_UPDATE;
  }

  // 策略更新完成，进入下一天
  finishStrategyUpdate(newBook, diff) {
    this.strategyBook = newBook;
    this.strategyDiff = diff;

    // 记录历史
    this.history.push({
      day: this.day,
      message: this.playerMessage,
      diff: diff,
      events: [...this.todayEvents],
    });

    this.day++;
    // 食物腐烂处理（在这里做，每天结算一次）
    this.tickSpoilage();
  }

  // 天亮，开始新一天
  dawn() {
    if (this.ai.hp <= 0) {
      this.phase = PHASE.DEATH;
      return;
    }
    this.startDay();
  }

  // 食物腐烂
  tickSpoilage() {
    this.ai.inventory = this.ai.inventory.filter(item => {
      if (item.expiryDay && this.day >= item.expiryDay) {
        return false; // 过期了，移除
      }
      return true;
    });
  }

  // 记录事件
  logEvent(event, decision, reason) {
    this.todayEvents.push({
      time: Math.round(this.dayDuration - this.dayTimeLeft),
      event, decision, reason,
      state: { hp: Math.round(this.ai.hp), hunger: Math.round(this.ai.hunger) },
    });
  }

  // 获取饥饿/生命值的百分比显示
  get hpPercent() { return Math.round(this.ai.hp); }
  get hungerPercent() { return Math.round(this.ai.hunger); }
}
