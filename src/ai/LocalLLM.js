// Ollama LLM 调用封装
// 负责构建 prompt、调用 API、解析响应

import { logger } from '../systems/Logger.js';

const OLLAMA_URL = 'http://localhost:11434/api/chat';
const MODEL = 'qwen3:14b';

// action 枚举定义
const VALID_ACTIONS = ['collect', 'eat', 'craft', 'hunt', 'flee', 'fight', 'goto', 'wander', 'wait'];

// 性格描述
const PERSONALITY_DESC = {
  cautious: '谨慎型：胆小谨慎，害怕未知事物，倾向待在安全区域，不主动冒险。',
  reckless: '莽撞型：大胆冲动，喜欢冒险，不太怕危险，看到东西就想冲上去。',
  curious: '好奇型：喜欢探索未知区域，对新事物充满好奇，但不主动战斗。',
};

export class LocalLLM {
  constructor() {
    this.systemPrompt = '';
    this.ready = false;
    this.callCount = 0;
    this.totalTime = 0;
  }

  // 预热：让模型加载到内存
  async warmup() {
    logger.info('LLM', '正在预热模型...');
    try {
      const start = performance.now();
      await fetch(OLLAMA_URL, {
        method: 'POST',
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: 'user', content: '你好' }],
          stream: false,
          think: false,
          options: { num_predict: 5 },
        }),
      });
      const dur = ((performance.now() - start) / 1000).toFixed(1);
      logger.info('LLM', `模型预热完成 (${dur}s)`);
      this.ready = true;
    } catch (e) {
      logger.error('LLM', '模型预热失败，请确认 Ollama 正在运行', e.message);
      this.ready = false;
    }
  }

  // 构建 system prompt
  buildSystemPrompt(personality, strategyBook) {
    const personalityDesc = PERSONALITY_DESC[personality] || PERSONALITY_DESC.cautious;

    this.systemPrompt = `你是一个生存游戏中的AI角色，需要在危险的野外世界中生存。每次只返回一个JSON决策，不要返回其他任何内容。

【你的性格】
${personalityDesc}

【策略手册】
${strategyBook || '（暂无，按本能行动）'}

【合成配方】
木头→木棍(×2)
木棍+石头→石斧(采集加速)
木棍+石头×2→石矛(武器,攻击力15)
木头+草→简易庇护所(3天耐久)
石头+木头→篝火(需每天添加木头)
生肉(在篝火旁)→烤肉(回复饥饿40)

【坐标系统】
世界是2D坐标系。你的位置和所有可见物体都用(x,y)绝对坐标标注。
你可以用坐标精确指定目标，例如：
  collect target="1550,1100"  → 采集这个坐标的资源
  hunt target="2300,800"      → 追猎这个坐标的动物
  goto target="1700,500"      → 走到这个坐标
推荐对视野内的具体目标使用坐标，而不是模糊的方向词。

【可用动作】
collect: 采集资源。target填坐标"x,y"或资源类型(berry/wood/stone/grass/herb/clay)
eat: 吃东西。target填 best_food
craft: 合成物品。target填配方id(stick/stone_axe/stone_spear/campfire/basic_shelter/cooked_meat)
hunt: 追猎动物。target填坐标"x,y"或 nearest_rabbit/nearest_deer
flee: 逃跑。target填 from_wolf 或方向(north/south/east/west)
fight: 战斗。target填坐标"x,y"或 nearest_wolf
goto: 前往某处。target填坐标"x,y"或 shelter/campfire 或方向
wander: 闲逛探索。target填 explore（去未探索区域）
wait: 原地等待观察

【世界规则】
- 你的目标是活下去，活得越久越好。生命值降到0就死了
- 白天大约90秒，然后自动进入夜晚
- 饥饿值每秒都在下降，一天不吃多次就会饿到0
- 饥饿值降到0后会持续掉血，不吃东西就会死
- 夜间没有庇护所会大量掉血。有庇护所+篝火可以恢复少量生命
- 篝火每天消耗1个木头，没有木头就会熄灭
- 简易庇护所3天后会损坏
- 生肉直接吃回复10饥饿，在篝火旁烤成烤肉回复40饥饿
- 浆果吃了回复15饥饿
- 狼攻击力很高很危险，没有武器时战斗力很弱
- 石斧是采集工具（加速砍树采石），不是武器，无法用来战斗
- 狼会主动攻击，兔子和鹿会逃跑
- 采空的树木和草会重新长出来，浆果和石头采完就没了
- 背包只有8格，满了就无法拾取新物品
- 视野有限，只能看到附近的东西，远处需要走过去才能发现

只返回JSON，格式：{"action":"动作","target":"目标","thought":"第一人称内心想法(20字内)"}`;
  }

  // 构建 user prompt
  buildUserPrompt(gameState, visibleObjects, memorySummary, triggerEvent) {
    const ai = gameState.ai;
    const timeLeft = Math.round(gameState.dayTimeLeft);

    // 当前状态
    let prompt = `位置:(${Math.round(ai.x)},${Math.round(ai.y)}) `;
    prompt += `生命${Math.round(ai.hp)}% `;
    prompt += `饥饿${Math.round(ai.hunger)}%`;
    if (ai.hunger < 30) prompt += '(很饿!)';
    if (ai.hunger < 15) prompt += '(快饿死了!!)';
    prompt += '\n';

    // 装备
    const wpn = ai.equipment.weapon;
    prompt += `装备:${wpn ? wpn.name + '(' + wpn.durability + ')' : '无武器'}`;
    prompt += '\n';

    // 背包
    if (ai.inventory.length > 0) {
      prompt += `背包:${ai.inventory.map(i => i.name + '×' + i.count).join(' ')}`;
    } else {
      prompt += '背包:空';
    }
    prompt += '\n';

    // 建筑
    const hasShelter = !!ai.shelterPos;
    const hasCampfire = !!ai.campfirePos;
    if (hasShelter || hasCampfire) {
      prompt += '建筑:';
      if (hasShelter) {
        const dist = Math.round(Math.hypot(ai.x - ai.shelterPos.x, ai.y - ai.shelterPos.y));
        prompt += `庇护所(${dist > 50 ? dist + 'px远' : '附近'})`;
      }
      if (hasCampfire) {
        const dist = Math.round(Math.hypot(ai.x - ai.campfirePos.x, ai.y - ai.campfirePos.y));
        prompt += ` 篝火(${dist > 50 ? dist + 'px远' : '附近'},燃料${ai.campfireFuel}天)`;
      }
      prompt += '\n';
    }

    // 视野内（绝对坐标，按距离排序）
    prompt += '\n视野内:\n';
    const vis = visibleObjects;
    if (vis.resources.length === 0 && vis.animals.length === 0) {
      prompt += '  什么都没有\n';
    } else {
      const sortedRes = [...vis.resources].sort((a,b) => a.distance - b.distance);
      for (const r of sortedRes.slice(0, 8)) {
        prompt += `  ${r.type}(${r.x},${r.y}) 距离${r.distance}${r.depleted ? '(已采空)' : ''}\n`;
      }
      const sortedAni = [...vis.animals].sort((a,b) => a.distance - b.distance);
      for (const a of sortedAni.slice(0, 4)) {
        prompt += `  ${a.type}(${a.x},${a.y}) 距离${a.distance}${a.hostile ? '(危险!)' : ''}\n`;
      }
    }

    // 记忆摘要（绝对坐标）
    if (memorySummary) {
      prompt += `\n地图记忆(${memorySummary.explored}):\n`;
      if (memorySummary.resources.length > 0 && memorySummary.resources[0] !== '记忆中没有可用资源') {
        prompt += `已知资源: ${memorySummary.resources.slice(0, 6).join(', ')}\n`;
      }
      if (memorySummary.dangers.length > 0 && memorySummary.dangers[0] !== '暂无已知危险') {
        prompt += `已知危险: ${memorySummary.dangers.join(', ')}\n`;
      }
      prompt += `${memorySummary.unexploredHint}\n`;
    }

    // 不告诉LLM能合成什么，让它自己根据背包和配方判断

    prompt += `\n白天剩余:${timeLeft}秒`;
    if (timeLeft < 20) prompt += '(马上天黑!)';
    prompt += '\n';

    if (triggerEvent) {
      prompt += `刚才:${triggerEvent}\n`;
    }

    return prompt;
  }

  // 调用 LLM 决策
  async decide(gameState, visibleObjects, memorySummary, triggerEvent) {
    if (!this.ready) {
      logger.warn('LLM', '模型未就绪，跳过决策');
      return null;
    }

    const userPrompt = this.buildUserPrompt(gameState, visibleObjects, memorySummary, triggerEvent);

    logger.info('LLM', `决策请求 [${triggerEvent || 'idle'}]`, userPrompt.slice(0, 100) + '...');

    const start = performance.now();

    try {
      const resp = await fetch(OLLAMA_URL, {
        method: 'POST',
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: this.systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          stream: false,
          think: false,
          options: { num_predict: 100, temperature: 0.7 },
        }),
      });

      const data = await resp.json();
      const content = data.message?.content || '';
      const dur = ((performance.now() - start) / 1000).toFixed(2);

      this.callCount++;
      this.totalTime += parseFloat(dur);

      // 解析 JSON
      const result = this._parseResponse(content);

      if (result) {
        logger.info('LLM', `决策结果 (${dur}s): ${result.action} → ${result.target}`, { thought: result.thought });
        return result;
      } else {
        logger.warn('LLM', `JSON解析失败 (${dur}s)`, content.slice(0, 200));
        return null;
      }
    } catch (e) {
      const dur = ((performance.now() - start) / 1000).toFixed(2);
      logger.error('LLM', `调用失败 (${dur}s): ${e.message}`);
      return null;
    }
  }

  // 解析 LLM 响应
  _parseResponse(content) {
    try {
      // 去掉可能的 markdown 包裹
      let cleaned = content.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      }

      const obj = JSON.parse(cleaned);

      // 验证 action
      if (!obj.action || !VALID_ACTIONS.includes(obj.action)) {
        logger.warn('LLM', `无效action: ${obj.action}`);
        return null;
      }

      return {
        action: obj.action,
        target: obj.target || '',
        thought: obj.thought || '',
      };
    } catch (e) {
      return null;
    }
  }

  // 统计信息
  getStats() {
    return {
      calls: this.callCount,
      avgTime: this.callCount > 0 ? (this.totalTime / this.callCount).toFixed(2) + 's' : 'N/A',
    };
  }
}
