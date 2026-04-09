// Google Gemini API（AI Studio）调用封装
// 接口和 LocalLLM 兼容

import { logger } from '../systems/Logger.js';

const VALID_ACTIONS = ['collect', 'eat', 'craft', 'hunt', 'flee', 'fight', 'goto', 'wander', 'wait'];

const PERSONALITY_DESC = {
  cautious: '谨慎型：胆小谨慎，害怕未知事物，倾向待在安全区域，不主动冒险。',
  reckless: '莽撞型：大胆冲动，喜欢冒险，不太怕危险，看到东西就想冲上去。',
  curious: '好奇型：喜欢探索未知区域，对新事物充满好奇，但不主动战斗。',
};

export class GeminiLLM {
  constructor(apiKey, model = 'gemini-2.5-flash-lite') {
    this.apiKey = apiKey;
    this.model = model;
    this.endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    this.systemPrompt = '';
    this.ready = false;
    this.callCount = 0;
    this.totalTime = 0;

    // 短期记忆：对话历史 + 决策历史
    this.history = [];          // [{ user: text, model: text }]
    this.maxHistory = 8;         // 最多保留最近 8 轮对话
    this.recentDecisions = [];   // 最近 N 次决策（用于检测重复模式）
    this.maxRecentDecisions = 6;
  }

  // 清空短期记忆（夜晚结束后或重开时调用）
  clearMemory() {
    this.history = [];
    this.recentDecisions = [];
    logger.info('LLM', '短期记忆已清空');
  }

  async warmup() {
    if (!this.apiKey) {
      logger.error('LLM', 'Gemini API key 未配置');
      this.ready = false;
      return;
    }
    logger.info('LLM', `Gemini ${this.model} 准备就绪`);
    this.ready = true;
  }

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
用坐标精确指定目标，例如：
  collect target="1550,1100"
  hunt target="2300,800"
  goto target="1700,500"

【可用动作】
collect: 采集资源。target填坐标"x,y"或资源类型（"浆果"/"木头"/"石头"/"草"/"粘土"）
eat: 吃东西。target填食物名（如"烤肉"/"浆果"/"生肉"），自己挑最合适的
craft: 合成物品。target填配方id(stick/stone_axe/stone_spear/campfire/basic_shelter/cooked_meat)
hunt: 追猎动物。target填坐标"x,y"或 nearest_rabbit
flee: 逃跑。target填 from_wolf 或方向
fight: 战斗。target填坐标"x,y"或 nearest_wolf
goto: 前往某处。target填坐标"x,y"或 shelter/campfire 或方向
wander: 闲逛探索。target填 explore
wait: 原地等待

【世界规则】
- 你的目标是活下去，活得越久越好。生命值降到0就死了
- 白天大约90秒，然后自动进入夜晚
- 饥饿值每秒都在下降，一天不吃多次就会饿到0
- 饥饿值降到0后会持续掉血，不吃东西就会死
- 夜间没有庇护所会大量掉血。有庇护所+篝火可以恢复少量生命
- 篝火每天消耗1个木头，没有木头就会熄灭
- 简易庇护所3天后会损坏
- 生肉直接吃回复10饥饿，烤肉回复40饥饿，浆果回复15饥饿
- 狼攻击力很高很危险，没有武器时战斗力很弱
- 石斧是采集工具（加速砍树采石），不是武器
- 狼会主动攻击，兔子和鹿会逃跑
- 采空的树木和草会重新长出来，浆果和石头采完就没了
- 背包只有8格
- 视野有限，远处需要走过去才能发现

只返回JSON，格式：{"action":"动作","target":"目标","thought":"第一人称内心想法(20字内)"}`;
  }

  buildUserPrompt(gameState, visibleObjects, memorySummary, triggerEvent) {
    const ai = gameState.ai;
    const timeLeft = Math.round(gameState.dayTimeLeft);

    let prompt = '';

    // === 反馈头部：明确告诉LLM上次决策的结果 ===
    if (triggerEvent) {
      const isFailure = /失败|没有|不可用|材料不足/.test(triggerEvent);
      const isSuccess = /完成|成功|到家|到达/.test(triggerEvent);
      if (isFailure) {
        prompt += `❌ 上次决策结果：${triggerEvent}（请换一种思路，不要重复同样的尝试）\n`;
      } else if (isSuccess) {
        prompt += `✓ 上次决策结果：${triggerEvent}\n`;
      } else {
        prompt += `⚠️ ${triggerEvent}\n`;
      }
    }

    // === 重复模式检测：如果连续多次同样的决策，强提醒 ===
    const repeat = this._detectRepeatPattern();
    if (repeat) {
      prompt += `🚨 警告：你已连续 ${repeat.count} 次决定 "${repeat.action} ${repeat.target}"，这条路明显走不通！必须立刻换思路！\n`;
    }
    if (prompt) prompt += '\n';

    prompt += `位置:(${Math.round(ai.x)},${Math.round(ai.y)}) `;
    prompt += `生命${Math.round(ai.hp)}% `;
    prompt += `饥饿${Math.round(ai.hunger)}%`;
    if (ai.hunger < 30) prompt += '(很饿!)';
    if (ai.hunger < 15) prompt += '(快饿死了!!)';
    prompt += '\n';

    const wpn = ai.equipment.weapon;
    prompt += `装备:${wpn ? wpn.name + '(' + wpn.durability + ')' : '无武器'}\n`;

    if (ai.inventory.length > 0) {
      const merged = {};
      for (const i of ai.inventory) merged[i.name] = (merged[i.name]||0) + i.count;
      prompt += `背包:${Object.entries(merged).map(([n,c]) => n+'×'+c).join(' ')}`;
    } else {
      prompt += '背包:空';
    }
    prompt += '\n';

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

    prompt += '\n视野内:\n';
    const vis = visibleObjects;
    const liveRes = vis.resources.filter(r => !r.depleted);
    if (liveRes.length === 0 && vis.animals.length === 0) {
      prompt += '  什么都没有\n';
    } else {
      const sortedRes = [...liveRes].sort((a,b) => a.distance - b.distance);
      for (const r of sortedRes.slice(0, 8)) {
        prompt += `  ${r.type}(${r.x},${r.y}) 距离${r.distance}\n`;
      }
      const sortedAni = [...vis.animals].sort((a,b) => a.distance - b.distance);
      for (const a of sortedAni.slice(0, 4)) {
        prompt += `  ${a.type}(${a.x},${a.y}) 距离${a.distance}${a.hostile ? '(危险!)' : ''}\n`;
      }
    }

    if (memorySummary) {
      prompt += `\n地图记忆(${memorySummary.explored}):\n`;
      if (memorySummary.resources.length > 0 && memorySummary.resources[0] !== '记忆中没有可用资源') {
        prompt += `已知资源: ${memorySummary.resources.slice(0, 6).join(', ')}\n`;
      }
      if (memorySummary.dangers.length > 0 && memorySummary.dangers[0] !== '暂无已知危险') {
        prompt += `已知危险: ${memorySummary.dangers.join(', ')}\n`;
      }
    }

    prompt += `\n白天剩余:${timeLeft}秒`;
    if (timeLeft < 20) prompt += '(马上天黑!)';
    prompt += '\n';

    if (triggerEvent) prompt += `刚才:${triggerEvent}\n`;

    return prompt;
  }

  // 检测最近 N 次是否在反复同一个决策
  _detectRepeatPattern() {
    if (this.recentDecisions.length < 3) return null;
    const last = this.recentDecisions[this.recentDecisions.length - 1];
    let count = 1;
    for (let i = this.recentDecisions.length - 2; i >= 0; i--) {
      if (this.recentDecisions[i].action === last.action &&
          this.recentDecisions[i].target === last.target) {
        count++;
      } else {
        break;
      }
    }
    return count >= 3 ? { action: last.action, target: last.target, count } : null;
  }

  async decide(gameState, visibleObjects, memorySummary, triggerEvent) {
    if (!this.ready) {
      logger.warn('LLM', '模型未就绪，跳过决策');
      return null;
    }

    const userPrompt = this.buildUserPrompt(gameState, visibleObjects, memorySummary, triggerEvent);
    logger.info('LLM', `决策请求 [${triggerEvent || 'idle'}] (历史${this.history.length}轮)`, userPrompt);

    // 构建带历史的 contents（多轮对话）
    const contents = [];
    for (const turn of this.history) {
      contents.push({ role: 'user', parts: [{ text: turn.user }] });
      contents.push({ role: 'model', parts: [{ text: turn.model }] });
    }
    contents.push({ role: 'user', parts: [{ text: userPrompt }] });

    const start = performance.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const resp = await fetch(`${this.endpoint}?key=${this.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: this.systemPrompt }] },
          contents,
          generationConfig: {
            temperature: 0.5,
            maxOutputTokens: 200,
            responseMimeType: 'application/json',
          },
        }),
      });
      clearTimeout(timeoutId);

      if (!resp.ok) {
        const errText = await resp.text();
        logger.error('LLM', `Gemini HTTP ${resp.status}: ${errText.slice(0, 200)}`);
        return null;
      }

      const data = await resp.json();
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const dur = ((performance.now() - start) / 1000).toFixed(2);

      this.callCount++;
      this.totalTime += parseFloat(dur);

      const result = this._parseResponse(content);
      if (result) {
        logger.info('LLM', `决策结果 (${dur}s): ${result.action} → ${result.target}`, { thought: result.thought });

        // 写入对话历史
        this.history.push({ user: userPrompt, model: content });
        while (this.history.length > this.maxHistory) this.history.shift();

        // 写入决策历史（用于重复模式检测）
        this.recentDecisions.push({ action: result.action, target: String(result.target || '') });
        while (this.recentDecisions.length > this.maxRecentDecisions) this.recentDecisions.shift();

        return result;
      } else {
        logger.warn('LLM', `JSON解析失败 (${dur}s)`, content.slice(0, 200));
        return null;
      }
    } catch (e) {
      clearTimeout(timeoutId);
      const dur = ((performance.now() - start) / 1000).toFixed(2);
      const reason = e.name === 'AbortError' ? '超时(>15s)' : e.message;
      logger.error('LLM', `Gemini调用失败 (${dur}s): ${reason}`);
      return null;
    }
  }

  _parseResponse(content) {
    try {
      let cleaned = content.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      }
      const obj = JSON.parse(cleaned);
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

  getStats() {
    return {
      calls: this.callCount,
      avgTime: this.callCount > 0 ? (this.totalTime / this.callCount).toFixed(2) + 's' : 'N/A',
    };
  }
}
