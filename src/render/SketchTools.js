// 手绘风格工具函数
// 从 sketch-animated.html 迁移，改为模块化，接受 ctx 参数

// 固定种子抖动缓存（每帧稳定，不会抖成PPT）
const jitCache = {};

export function jitS(id, amp) {
  if (!jitCache[id]) jitCache[id] = (Math.sin(id * 127.1) * 43758.5) % 1 * amp - amp / 2;
  return jitCache[id];
}

// 动态抖动（缓慢摆动动画）
let _time = 0;
export function setTime(t) { _time = t; }
export function getTime() { return _time; }

export function wobble(id, amp, speed) {
  return Math.sin(_time * speed + id * 3.7) * amp;
}

// 手绘直线
export function sketchLine(ctx, x1, y1, x2, y2, id) {
  const s = Math.max(3, Math.floor(Math.hypot(x2 - x1, y2 - y1) / 8));
  ctx.beginPath();
  ctx.moveTo(x1 + jitS(id, 1), y1 + jitS(id + 1, 1));
  for (let i = 1; i <= s; i++) {
    const t = i / s;
    ctx.lineTo(
      x1 + (x2 - x1) * t + jitS(id + i * 2, 1),
      y1 + (y2 - y1) * t + jitS(id + i * 2 + 1, 1)
    );
  }
  ctx.stroke();
}

// 手绘圆
export function sketchCircle(ctx, x, y, r, fill, id) {
  id = id || 0;
  ctx.beginPath();
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const rr = r + jitS(id + i, 1);
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  if (fill) { ctx.fill(); ctx.stroke(); } else ctx.stroke();
}

// 手绘椭圆
export function sketchEllipse(ctx, x, y, rx, ry, fill, id) {
  id = id || 0;
  ctx.beginPath();
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const px = x + Math.cos(a) * (rx + jitS(id + i, 0.6));
    const py = y + Math.sin(a) * (ry + jitS(id + i + 50, 0.6));
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  if (fill) { ctx.fill(); ctx.stroke(); } else ctx.stroke();
}

// 手绘弧线
export function sketchArc(ctx, x, y, r, startAngle, endAngle, id) {
  id = id || 0;
  ctx.beginPath();
  for (let i = 0; i <= 20; i++) {
    const a = startAngle + (endAngle - startAngle) * (i / 20);
    const rr = r + jitS(id + i, 0.6);
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();
}

// 配色常量
export const COLORS = {
  INK: '#3a3a3a',
  INK_L: '#8a8a8a',
  PAPER: '#f5f1e8',
  PAPER_LINE: '#d8d4cc',
  PEACH: '#ffe8d0',
  BLUSH: 'rgba(240,140,140,0.35)',
  RED_BERRY: 'rgba(220,70,80,0.6)',

  // 地形色块
  GRASS: 'rgba(120,180,100,0.15)',
  FOREST: 'rgba(100,160,80,0.25)',
  FOREST_LIGHT: 'rgba(100,160,80,0.22)',
  MOUNTAIN: 'rgba(180,140,90,0.15)',
  MOUNTAIN_DARK: 'rgba(180,140,90,0.18)',
  WATER: 'rgba(100,170,220,0.2)',
  WATER_LIGHT: 'rgba(100,170,220,0.18)',
  SWAMP: 'rgba(110,140,100,0.18)',
  SNOW: 'rgba(200,210,225,0.2)',
  FLOWER: 'rgba(140,200,120,0.15)',
  SAND: 'rgba(220,200,160,0.18)',
};
