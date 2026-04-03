// 夜晚界面渲染
// 包括：夜间结算、AI汇报、玩家留言输入、策略变更展示

import { COLORS } from './SketchTools.js';

const { INK, INK_L, PAPER } = COLORS;

export class NightUI {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.vw = canvas.width;
    this.vh = canvas.height;

    // 留言输入状态
    this.inputText = '';
    this.maxChars = 100;
    this.cursorBlink = 0;

    // 按钮区域（用于点击检测）
    this.buttons = {};

    // 键盘监听
    this._onClick = this._onClick.bind(this);
    this.active = false;
    this.onSubmit = null;
    this.onNext = null;

    // 隐藏 input 元素（支持中文输入法）
    this._hiddenInput = document.createElement('input');
    this._hiddenInput.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
    this._hiddenInput.maxLength = this.maxChars;
    document.body.appendChild(this._hiddenInput);
    this._hiddenInput.addEventListener('input', () => {
      this.inputText = this._hiddenInput.value.slice(0, this.maxChars);
    });
    this._hiddenInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && this.inputText.length > 0) {
        if (this.onSubmit) {
          const msg = this.inputText;
          this.inputText = '';
          this._hiddenInput.value = '';
          this.onSubmit(msg);
        }
      }
    });

    // 自动跳过计时器
    this.autoTimer = 0;
    this.autoDelay = 5; // 5秒后自动跳过
    this.autoRounds = parseInt(localStorage.getItem('ai-survival-auto-rounds') || '0');
    this.maxAutoRounds = 5; // 最多自动5局
  }

  activate(onSubmit, onNext) {
    if (this.active) return;
    this.active = true;
    this.onSubmit = onSubmit;
    this.onNext = onNext;
    this.inputText = '';
    this._hiddenInput.value = '';
    this.canvas.addEventListener('click', this._onClick);
  }

  deactivate() {
    this.active = false;
    this.canvas.removeEventListener('click', this._onClick);
    this._hiddenInput.blur();
  }

  // 聚焦隐藏输入框（在留言阶段每帧调用）
  _focusInput() {
    if (document.activeElement !== this._hiddenInput) {
      this._hiddenInput.focus();
    }
  }

  _onClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    for (const [name, btn] of Object.entries(this.buttons)) {
      if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
        if (name === 'submit' && this.inputText.length > 0 && this.onSubmit) {
          const msg = this.inputText;
          this.inputText = '';
          this._hiddenInput.value = '';
          this.onSubmit(msg);
        } else if (name === 'next' && this.onNext) {
          this.onNext();
        }
      }
    }
  }

  // ===== 渲染各阶段 =====

  drawSettle(day, settleText) {
    const ctx = this.ctx;
    this.buttons = {};
    this._drawNightBg(ctx, day);

    // 结算文本
    ctx.fillStyle = INK;
    ctx.font = 'bold 16px Georgia,serif';
    ctx.textAlign = 'center';
    ctx.fillText('夜间结算', this.vw / 2, 200);

    ctx.font = '14px Georgia,serif';
    ctx.fillStyle = INK;
    const lines = settleText.split('\n');
    lines.forEach((line, i) => {
      ctx.fillText(line, this.vw / 2, 240 + i * 24);
    });

    // 继续按钮
    this._drawButton(ctx, 'next', '继续', this.vw / 2 - 60, 350, 120, 40);
    ctx.textAlign = 'left';
    this._tickAutoSkip(ctx, () => { if (this.onNext) this.onNext(); });
  }

  drawReport(day, reportText) {
    const ctx = this.ctx;
    this.buttons = {};
    this._drawNightBg(ctx, day);

    // AI 汇报
    ctx.fillStyle = INK;
    ctx.font = 'bold 16px Georgia,serif';
    ctx.textAlign = 'center';
    ctx.fillText('AI 的汇报', this.vw / 2, 160);

    // 汇报框
    const bx = this.vw / 2 - 250, by = 185, bw = 500, bh = 160;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.strokeStyle = INK_L;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 8); ctx.fill(); ctx.stroke();

    ctx.font = '13px Georgia,serif';
    ctx.fillStyle = INK;
    ctx.textAlign = 'left';
    this._wrapText(ctx, reportText, bx + 16, by + 26, bw - 32, 20);

    // 继续按钮
    ctx.textAlign = 'center';
    this._drawButton(ctx, 'next', '继续', this.vw / 2 - 60, 370, 120, 40);
    ctx.textAlign = 'left';
    this._tickAutoSkip(ctx, () => { if (this.onNext) this.onNext(); });
  }

  drawMessageInput(day) {
    const ctx = this.ctx;
    this.buttons = {};
    this.cursorBlink += 0.03;
    this._focusInput(); // 保持隐藏输入框聚焦
    this._drawNightBg(ctx, day);

    ctx.fillStyle = INK;
    ctx.font = 'bold 16px Georgia,serif';
    ctx.textAlign = 'center';
    ctx.fillText('给 AI 的留言', this.vw / 2, 180);

    ctx.font = '12px Georgia,serif';
    ctx.fillStyle = INK_L;
    ctx.fillText('你的AI明天会根据这段话调整行为策略', this.vw / 2, 202);

    // 输入框
    const bx = this.vw / 2 - 250, by = 220, bw = 500, bh = 140;
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 8); ctx.fill(); ctx.stroke();

    // 输入文字
    ctx.font = '14px Georgia,serif';
    ctx.fillStyle = INK;
    ctx.textAlign = 'left';
    this._wrapText(ctx, this.inputText + (Math.sin(this.cursorBlink * 3) > 0 ? '|' : ''), bx + 16, by + 26, bw - 32, 22);

    // 字数
    ctx.textAlign = 'right';
    ctx.fillStyle = this.inputText.length >= this.maxChars ? '#e04040' : INK_L;
    ctx.font = '12px Georgia,serif';
    ctx.fillText(`${this.inputText.length}/${this.maxChars} 字`, bx + bw - 10, by + bh + 20);

    // 提交按钮
    ctx.textAlign = 'center';
    const canSubmit = this.inputText.length > 0;
    this._drawButton(ctx, 'submit', '提交留言，天亮了', this.vw / 2 - 90, 400, 180, 42, canSubmit);
    ctx.textAlign = 'left';
    // 自动跳过：提交默认留言
    this._tickAutoSkip(ctx, () => {
      if (this.onSubmit) {
        const msg = this.inputText.length > 0 ? this.inputText : '继续加油';
        this.inputText = '';
        this._hiddenInput.value = '';
        this.onSubmit(msg);
      }
    });
  }

  drawStrategyUpdate(day, diff) {
    const ctx = this.ctx;
    this.buttons = {};
    this._drawNightBg(ctx, day);

    ctx.fillStyle = INK;
    ctx.font = 'bold 16px Georgia,serif';
    ctx.textAlign = 'center';
    ctx.fillText('策略变更', this.vw / 2, 170);

    // 变更列表
    const bx = this.vw / 2 - 250, by = 195, bw = 500;
    ctx.textAlign = 'left';
    ctx.font = '13px Georgia,serif';

    let y = by + 10;
    for (const item of diff) {
      if (item.type === 'add') {
        ctx.fillStyle = '#2a8a2a';
        ctx.fillText('✚ 新增：' + item.text, bx + 16, y);
      } else if (item.type === 'change') {
        ctx.fillStyle = '#c07000';
        ctx.fillText('↑ 调整：' + item.text, bx + 16, y);
      } else {
        ctx.fillStyle = INK_L;
        ctx.fillText('— 不变：' + item.text, bx + 16, y);
      }
      y += 24;
    }

    // 天亮按钮
    ctx.textAlign = 'center';
    this._drawButton(ctx, 'next', '天亮了', this.vw / 2 - 60, Math.max(y + 20, 380), 120, 40);
    ctx.textAlign = 'left';
    this._tickAutoSkip(ctx, () => { if (this.onNext) this.onNext(); });
  }

  drawDeath(day, history) {
    const ctx = this.ctx;
    ctx.fillStyle = PAPER; ctx.fillRect(0, 0, this.vw, this.vh);

    ctx.fillStyle = INK;
    ctx.font = 'bold 22px Georgia,serif';
    ctx.textAlign = 'center';
    ctx.fillText('AI 倒下了...', this.vw / 2, 120);

    ctx.font = '16px Georgia,serif';
    ctx.fillStyle = INK_L;
    ctx.fillText(`存活了 ${day - 1} 天`, this.vw / 2, 160);

    // 训练回顾
    ctx.font = 'bold 14px Georgia,serif';
    ctx.fillStyle = INK;
    ctx.fillText('训练回顾', this.vw / 2, 210);

    ctx.font = '12px Georgia,serif';
    ctx.textAlign = 'left';
    const rx = this.vw / 2 - 200;
    let ry = 235;
    for (const h of history.slice(-8)) { // 最多显示最后8天
      ctx.fillStyle = INK_L;
      ctx.fillText(`第${h.day}天：`, rx, ry);
      ctx.fillStyle = INK;
      ctx.fillText(`"${h.message.slice(0, 30)}${h.message.length > 30 ? '...' : ''}"`, rx + 55, ry);
      ry += 22;
    }

    ctx.textAlign = 'center';
    const label = this.autoRounds >= this.maxAutoRounds ? '再来一局' : '再来一局（自动）';
    this._drawButton(ctx, 'next', label, this.vw / 2 - 60, Math.max(ry + 30, 500), 120, 40);
    ctx.textAlign = 'left';
    this._tickAutoSkip(ctx, () => {
      // 自动重开时累加局数
      this.autoRounds++;
      localStorage.setItem('ai-survival-auto-rounds', String(this.autoRounds));
      if (this.onNext) this.onNext();
    });
  }

  // ===== 内部工具 =====

  // 自动跳过：累加计时，画倒计时，到了就触发
  _tickAutoSkip(ctx, action) {
    if (this.autoRounds >= this.maxAutoRounds) return; // 超过局数限制，不再自动
    this.autoTimer += 0.016;
    const remaining = Math.ceil(this.autoDelay - this.autoTimer);
    ctx.fillStyle = INK_L; ctx.font = '11px Georgia,serif'; ctx.textAlign = 'center';
    ctx.fillText(`自动模式 (${this.autoRounds + 1}/${this.maxAutoRounds})  ${remaining}秒后跳过`, this.vw / 2, this.vh - 100);
    ctx.textAlign = 'left';
    if (this.autoTimer >= this.autoDelay) {
      this.autoTimer = 0;
      action();
    }
  }

  _resetAutoTimer() {
    this.autoTimer = 0;
  }

  _drawNightBg(ctx, day) {
    // 深色夜晚背景
    ctx.fillStyle = '#2a2a3a';
    ctx.fillRect(0, 0, this.vw, this.vh);

    // 纸张感的中心区域
    ctx.fillStyle = PAPER;
    ctx.beginPath(); ctx.roundRect(60, 80, this.vw - 120, this.vh - 160, 12); ctx.fill();

    // 标题
    ctx.fillStyle = INK;
    ctx.font = '14px Georgia,serif';
    ctx.textAlign = 'center';
    ctx.fillText(`🌙 第 ${day} 天 夜晚`, this.vw / 2, 120);
  }

  _drawButton(ctx, name, text, x, y, w, h, enabled = true) {
    ctx.fillStyle = enabled ? 'rgba(255,255,255,0.95)' : 'rgba(240,240,240,0.7)';
    ctx.strokeStyle = enabled ? INK : INK_L;
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 6); ctx.fill(); ctx.stroke();

    ctx.fillStyle = enabled ? INK : INK_L;
    ctx.font = '14px Georgia,serif';
    ctx.fillText(text, x + w / 2, y + h / 2 + 5);

    this.buttons[name] = { x, y, w, h };
  }

  _wrapText(ctx, text, x, y, maxW, lineH) {
    let line = '';
    let ly = y;
    for (const char of text) {
      const test = line + char;
      if (ctx.measureText(test).width > maxW) {
        ctx.fillText(line, x, ly);
        line = char;
        ly += lineH;
      } else {
        line = test;
      }
    }
    ctx.fillText(line, x, ly);
  }
}
