// 所有物件/角色/动物的绘制函数
// 从 world.html 迁移，改为接受 ctx 参数的模块化函数

import { jitS, wobble, sketchLine, sketchCircle, sketchEllipse, sketchArc, COLORS } from './SketchTools.js';

const { INK, INK_L, PEACH, BLUSH, RED_BERRY } = COLORS;

// ========== 植物 ==========

export function drawTree(ctx, x, y, size, id) {
  const sw = wobble(id, 0.03, 0.8);
  ctx.save();
  ctx.translate(x, y + size * 1.5); ctx.rotate(sw); ctx.translate(-x, -(y + size * 1.5));
  ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
  ctx.fillStyle = 'rgba(100,170,80,0.12)';
  sketchLine(ctx, x, y, x - 1, y + size * 1.5, id);
  sketchLine(ctx, x + 4, y + 2, x + 3, y + size * 1.5, id + 10);
  sketchCircle(ctx, x + 1, y - size * 0.3, size, true, id + 20);
  ctx.fillStyle = 'rgba(100,170,80,0.08)';
  sketchCircle(ctx, x - size * 0.5, y, size * 0.7, true, id + 30);
  sketchCircle(ctx, x + size * 0.6, y + 1, size * 0.65, true, id + 40);
  ctx.restore();
}

export function drawPine(ctx, x, y, size, id) {
  const sw = wobble(id, 0.02, 0.7);
  ctx.save();
  ctx.translate(x, y + size * 1.5); ctx.rotate(sw); ctx.translate(-x, -(y + size * 1.5));
  ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.fillStyle = 'rgba(70,130,60,0.1)';
  sketchLine(ctx, x, y + 2, x, y + size * 1.5, id);
  for (let i = 0; i < 3; i++) {
    const ty = y - size * 0.3 * i, w = size * (1 - i * 0.25);
    ctx.beginPath(); ctx.moveTo(x - w, ty + size * 0.5); ctx.lineTo(x, ty - size * 0.3); ctx.lineTo(x + w, ty + size * 0.5);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

export function drawGrass(ctx, x, y, id) {
  const sw = wobble(id, 2, 1.5);
  ctx.strokeStyle = INK_L; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x - 3 + sw, y - 8, x - 2 + sw, y - 12); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 2, y); ctx.quadraticCurveTo(x + 4 + sw, y - 9, x + 6 + sw, y - 11); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 1, y); ctx.quadraticCurveTo(x + 1 + sw * 0.5, y - 10, x + 1 + sw * 0.5, y - 14); ctx.stroke();
}

export function drawBerryBush(ctx, x, y, id) {
  const sw = wobble(id, 1.5, 1);
  ctx.strokeStyle = INK; ctx.lineWidth = 1.3; ctx.fillStyle = 'rgba(100,160,80,0.12)';
  sketchEllipse(ctx, x + sw * 0.5, y, 14, 10, true, id);
  ctx.fillStyle = RED_BERRY; ctx.strokeStyle = INK; ctx.lineWidth = 1;
  sketchCircle(ctx, x - 5 + sw, y - 3, 3, true, id + 10);
  sketchCircle(ctx, x + 4 + sw, y - 1, 3, true, id + 20);
  sketchCircle(ctx, x - 1 + sw * 0.5, y + 3, 2.5, true, id + 30);
}

export function drawMushroom(ctx, x, y, id) {
  ctx.strokeStyle = INK; ctx.lineWidth = 1.3;
  ctx.fillStyle = 'rgba(230,220,210,0.15)'; ctx.fillRect(x - 1.5, y, 3, 5); ctx.strokeRect(x - 1.5, y, 3, 5);
  ctx.fillStyle = 'rgba(216,88,72,0.25)'; ctx.beginPath(); ctx.arc(x, y, 4, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath(); ctx.arc(x - 1.5, y - 1.5, 1, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 1.5, y - 2, 0.8, 0, Math.PI * 2); ctx.fill();
}

export function drawFlower(ctx, x, y, id, colorIndex) {
  const cols = ['rgba(240,200,70,0.45)', 'rgba(232,136,208,0.45)', 'rgba(128,184,240,0.45)', 'rgba(240,120,100,0.45)', 'rgba(200,130,240,0.45)'];
  const sw = wobble(id, 1.5, 1.2);
  ctx.strokeStyle = INK_L; ctx.lineWidth = 0.7;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + sw * 0.5, y + 3, x + sw * 0.3, y + 6); ctx.stroke();
  ctx.fillStyle = cols[colorIndex || 0]; ctx.strokeStyle = INK; ctx.lineWidth = 0.7;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    ctx.beginPath(); ctx.arc(x + Math.cos(a) * 2.8 + sw * 0.3, y + Math.sin(a) * 2.8, 1.8, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,200,0.5)'; ctx.beginPath(); ctx.arc(x + sw * 0.3, y, 1.2, 0, Math.PI * 2); ctx.fill();
}

export function drawDeadTree(ctx, x, y, id) {
  ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
  sketchLine(ctx, x, y + 12, x, y - 8, id);
  sketchLine(ctx, x, y - 4, x - 8, y - 12, id + 10);
  sketchLine(ctx, x, y - 6, x + 6, y - 14, id + 20);
}

export function drawRock(ctx, x, y, size, id) {
  ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.fillStyle = 'rgba(160,160,160,0.1)';
  const pts = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 - 0.3;
    const r = size * (0.7 + Math.abs(jitS(id + i * 10, 0.8)));
    pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r * 0.6]);
  }
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = INK_L; ctx.lineWidth = 0.8;
  sketchLine(ctx, x - size * 0.2, y - size * 0.1, x + size * 0.1, y + size * 0.15, id + 50);
}

export function drawCrystal(ctx, x, y) {
  ctx.fillStyle = 'rgba(160,120,220,0.1)'; ctx.strokeStyle = 'rgba(120,80,180,0.5)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(x, y - 12); ctx.lineTo(x + 5, y + 2); ctx.lineTo(x - 5, y + 2); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 3, y - 8); ctx.lineTo(x + 7, y + 1); ctx.lineTo(x + 2, y + 1); ctx.closePath(); ctx.fill(); ctx.stroke();
}

// ========== 山峰/岩壁 ==========

// 大山峰（三角形山体，带雪顶）
export function drawMountainPeak(ctx, x, y, size, id, hasSnow) {
  const sw = wobble(id, 0.5, 0.3);
  ctx.strokeStyle = INK; ctx.lineWidth = 1.8;
  ctx.fillStyle = 'rgba(170,155,135,0.15)';

  // 山体轮廓
  ctx.beginPath();
  ctx.moveTo(x - size * 1.2 + jitS(id, 2), y + size * 0.6);
  ctx.lineTo(x - size * 0.3 + jitS(id + 1, 2), y - size * 0.8 + sw);
  ctx.lineTo(x + jitS(id + 2, 1.5), y - size + sw);
  ctx.lineTo(x + size * 0.4 + jitS(id + 3, 2), y - size * 0.7 + sw);
  ctx.lineTo(x + size * 1.3 + jitS(id + 4, 2), y + size * 0.6);
  ctx.closePath();
  ctx.fill(); ctx.stroke();

  // 山脊线
  ctx.strokeStyle = INK_L; ctx.lineWidth = 0.8;
  sketchLine(ctx, x - size * 0.3, y - size * 0.8 + sw, x, y - size + sw, id + 10);
  sketchLine(ctx, x, y - size + sw, x + size * 0.4, y - size * 0.7 + sw, id + 20);

  // 阴影面
  ctx.fillStyle = 'rgba(140,125,110,0.1)';
  ctx.beginPath();
  ctx.moveTo(x + jitS(id + 5, 1), y - size + sw);
  ctx.lineTo(x + size * 0.4, y - size * 0.7 + sw);
  ctx.lineTo(x + size * 1.3, y + size * 0.6);
  ctx.lineTo(x + size * 0.2, y + size * 0.6);
  ctx.closePath();
  ctx.fill();

  // 雪顶
  if (hasSnow) {
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.strokeStyle = INK; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - size * 0.15, y - size * 0.65 + sw);
    ctx.lineTo(x, y - size + sw);
    ctx.lineTo(x + size * 0.2, y - size * 0.6 + sw);
    ctx.quadraticCurveTo(x + size * 0.05, y - size * 0.55 + sw, x - size * 0.15, y - size * 0.65 + sw);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
  }

  // 岩石纹理
  ctx.strokeStyle = INK_L; ctx.lineWidth = 0.6;
  sketchLine(ctx, x - size * 0.5, y, x - size * 0.2, y - size * 0.3 + sw, id + 30);
  sketchLine(ctx, x + size * 0.3, y + size * 0.1, x + size * 0.5, y - size * 0.2 + sw, id + 40);
}

// 小山丘/岩壁（阻挡型，不可通行的感觉）
export function drawCliffWall(ctx, x, y, width, id) {
  ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
  ctx.fillStyle = 'rgba(160,145,125,0.12)';

  // 崖壁主体
  ctx.beginPath();
  ctx.moveTo(x - width / 2 + jitS(id, 2), y + 8);
  ctx.lineTo(x - width / 2 + 5 + jitS(id + 1, 2), y - 12 + jitS(id + 2, 3));
  ctx.lineTo(x - width / 6 + jitS(id + 3, 2), y - 18 + jitS(id + 4, 2));
  ctx.lineTo(x + width / 6 + jitS(id + 5, 2), y - 15 + jitS(id + 6, 3));
  ctx.lineTo(x + width / 2 - 5 + jitS(id + 7, 2), y - 10 + jitS(id + 8, 2));
  ctx.lineTo(x + width / 2 + jitS(id + 9, 2), y + 8);
  ctx.closePath();
  ctx.fill(); ctx.stroke();

  // 崖壁横纹
  ctx.strokeStyle = INK_L; ctx.lineWidth = 0.6;
  sketchLine(ctx, x - width / 3, y - 2, x + width / 3, y - 4, id + 50);
  sketchLine(ctx, x - width / 4, y + 3, x + width / 4, y + 2, id + 60);
}

// 水面岸线装饰已移除（不好看）

// ========== 建筑 ==========

export function drawShelter(ctx, x, y) {
  ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.fillStyle = 'rgba(180,140,80,0.1)';
  ctx.beginPath();
  ctx.moveTo(x - 20, y + 15); ctx.lineTo(x - 20, y - 5); ctx.lineTo(x, y - 22);
  ctx.lineTo(x + 20, y - 5); ctx.lineTo(x + 20, y + 15); ctx.closePath();
  ctx.fill(); ctx.stroke();
  sketchLine(ctx, x - 4, y + 15, x - 4, y + 2, 6000);
  sketchLine(ctx, x + 4, y + 15, x + 4, y + 2, 6010);
  sketchLine(ctx, x - 4, y + 2, x + 4, y + 2, 6020);
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x + 2, y + 9, 1.2, 0, Math.PI * 2); ctx.fill();
}

export function drawCampfire(ctx, x, y) {
  ctx.strokeStyle = INK; ctx.lineWidth = 1.3;
  sketchLine(ctx, x - 10, y + 4, x + 10, y + 2, 5000);
  sketchLine(ctx, x - 8, y + 1, x + 8, y + 5, 5010);
  const f1 = wobble(1, 3, 4), f2 = wobble(2, 2, 5), fh = 18 + wobble(3, 3, 3);
  ctx.fillStyle = 'rgba(240,160,50,0.15)';
  ctx.beginPath(); ctx.moveTo(x - 6, y + 2); ctx.quadraticCurveTo(x - 8 + f1, y - 10, x + f2, y - fh);
  ctx.quadraticCurveTo(x + 8 + f1, y - 10, x + 6, y + 2); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 1.3; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - 3, y + 1); ctx.quadraticCurveTo(x - 1 + f2, y - 5, x + f1 * 0.3, y - fh * 0.55);
  ctx.quadraticCurveTo(x + 2 - f2, y - 5, x + 3, y + 1); ctx.closePath(); ctx.stroke();
  ctx.fillStyle = INK_L;
  const sy = y - fh - 5 + wobble(10, 4, 2);
  ctx.beginPath(); ctx.arc(x + f1 * 0.8 - 3, sy, 0.8, 0, Math.PI * 2); ctx.fill();
}

// ========== AI 角色 ==========

export function drawAICharacter(ctx, x, y, expression) {
  const br = wobble(99, 0.5, 2), armSw = wobble(77, 8, 3), legSw = wobble(88, 3, 3);
  ctx.strokeStyle = INK; ctx.lineWidth = 1.8;

  // 影子
  ctx.fillStyle = 'rgba(0,0,0,0.06)';
  ctx.beginPath(); ctx.ellipse(x, y + 22, 14 + br, 4, 0, 0, Math.PI * 2); ctx.fill();
  // 身体
  ctx.fillStyle = PEACH;
  sketchEllipse(ctx, x, y + 14 + br * 0.5, 7, 5 + br * 0.3, true, 8000);
  // 手臂
  ctx.lineWidth = 1.5;
  sketchLine(ctx, x - 7, y + 12, x - 12 + armSw * 0.5, y + 18 + Math.abs(armSw) * 0.3, 8100);
  sketchLine(ctx, x + 7, y + 12, x + 12 - armSw * 0.5, y + 18 - Math.abs(armSw) * 0.3, 8110);
  // 脚
  sketchLine(ctx, x - 3, y + 19, x - 4 + legSw, y + 24, 8120);
  sketchLine(ctx, x + 3, y + 19, x + 4 - legSw, y + 24, 8130);
  // 脸
  ctx.lineWidth = 1.8; ctx.fillStyle = PEACH;
  sketchCircle(ctx, x, y, 16 - br * 0.2, true, 8050);
  // 腮红
  ctx.fillStyle = BLUSH;
  ctx.beginPath(); ctx.arc(x - 11, y + 3, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 11, y + 3, 3.5, 0, Math.PI * 2); ctx.fill();

  // 表情
  ctx.fillStyle = INK; ctx.strokeStyle = INK;
  switch (expression) {
    case 'normal':
      ctx.beginPath(); ctx.arc(x - 5, y - 2, 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 5, y - 2, 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 1.5; sketchLine(ctx, x - 4, y + 6, x + 4, y + 6, 8060);
      break;
    case 'scared':
      ctx.lineWidth = 1.5;
      sketchCircle(ctx, x - 5, y - 2, 3.5, false, 8061);
      sketchCircle(ctx, x + 5, y - 2, 3.5, false, 8062);
      ctx.beginPath(); ctx.arc(x - 5, y - 2, 1.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 5, y - 2, 1.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - 4, y + 5); ctx.lineTo(x + 4, y + 5); ctx.lineTo(x, y + 10); ctx.closePath(); ctx.stroke();
      break;
    case 'happy':
      ctx.lineWidth = 1.8;
      sketchArc(ctx, x - 5, y - 1, 3.5, Math.PI, 0, 8063);
      sketchArc(ctx, x + 5, y - 1, 3.5, Math.PI, 0, 8064);
      ctx.lineWidth = 1.5;
      sketchArc(ctx, x, y + 4, 5, 0.1, Math.PI - 0.1, 8065);
      break;
    case 'thinking':
      ctx.beginPath(); ctx.arc(x - 5, y - 2, 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 1.5; sketchLine(ctx, x + 3, y - 2, x + 7, y - 2, 8066);
      ctx.beginPath(); ctx.moveTo(x - 4, y + 6);
      ctx.quadraticCurveTo(x - 1, y + 3, x + 1, y + 6);
      ctx.quadraticCurveTo(x + 3, y + 9, x + 5, y + 6); ctx.stroke();
      break;
    case 'curious':
      ctx.beginPath(); ctx.arc(x - 5, y - 2, 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 5, y - 2, 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x - 4, y - 3, 0.9, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 6, y - 3, 0.9, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 1.3; sketchCircle(ctx, x, y + 6, 2.5, false, 8067);
      break;
    case 'determined':
      ctx.lineWidth = 1.5;
      sketchLine(ctx, x - 7, y - 4, x - 4, y - 1, 8068);
      sketchLine(ctx, x - 4, y - 1, x - 7, y + 2, 8069);
      sketchLine(ctx, x + 7, y - 4, x + 4, y - 1, 8070);
      sketchLine(ctx, x + 4, y - 1, x + 7, y + 2, 8071);
      sketchLine(ctx, x - 3, y + 7, x + 3, y + 7, 8072);
      break;
  }
}

// ========== 思考气泡 ==========

export function drawBubble(ctx, x, y, text) {
  if (!text) return;
  ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.fillStyle = 'rgba(255,255,255,0.88)';
  sketchCircle(ctx, x + 18, y - 14, 2, true, 9000);
  sketchCircle(ctx, x + 24, y - 22, 3, true, 9010);
  ctx.font = '12px Georgia,serif';
  const tw = ctx.measureText(text).width, bw = tw + 24, bx = x + 38 + bw / 2, by = y - 36;
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const px = bx + Math.cos(a) * (bw / 2 + jitS(9020 + i, 0.8));
    const py = by + Math.sin(a) * (14 + jitS(9070 + i, 0.8));
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath(); ctx.fill(); ctx.strokeStyle = INK; ctx.stroke();
  ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.fillText(text, bx, by + 4); ctx.textAlign = 'left';
}

// ========== 动物 ==========

export function drawRabbit(ctx, x, y, flip, hopOffset) {
  ctx.save(); ctx.translate(x, y - hopOffset); ctx.scale(flip, 1);
  ctx.strokeStyle = INK; ctx.lineWidth = 1.3; ctx.fillStyle = 'rgba(220,200,170,0.15)';
  sketchEllipse(ctx, 0, 3, 6, 4.5, true, 3000);
  sketchCircle(ctx, 0, -4, 5, true, 3010);
  ctx.fillStyle = 'rgba(240,180,180,0.15)';
  sketchEllipse(ctx, -3, -14 - hopOffset * 0.3, 2, 5, true, 3020);
  sketchEllipse(ctx, 3, -14 - hopOffset * 0.3, 2, 5, true, 3030);
  ctx.fillStyle = INK;
  ctx.beginPath(); ctx.arc(-2, -5, 1, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(2, -5, 1, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

export function drawWolf(ctx, x, y, flip, tailWag) {
  ctx.save(); ctx.translate(x, y); ctx.scale(flip, 1);
  ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.fillStyle = 'rgba(120,120,130,0.2)';
  sketchEllipse(ctx, 0, 3, 10, 6, true, 4000);
  sketchCircle(ctx, 0, -6, 7, true, 4010);
  ctx.beginPath(); ctx.moveTo(-6, -8); ctx.lineTo(-3, -18); ctx.lineTo(0, -8); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(3, -18); ctx.lineTo(6, -8); ctx.stroke();
  ctx.lineWidth = 1.5;
  sketchLine(ctx, -5, -8, -2, -5, 4020);
  sketchLine(ctx, 5, -8, 2, -5, 4030);
  ctx.fillStyle = INK;
  ctx.beginPath(); ctx.arc(-3, -6, 1.3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(3, -6, 1.3, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-10, 1); ctx.quadraticCurveTo(-18, -5 + tailWag, -15, -10 + tailWag); ctx.stroke();
  ctx.lineWidth = 1;
  sketchLine(ctx, -3, -1, 0, 0, 4040); sketchLine(ctx, 0, 0, 3, -1, 4050);
  ctx.restore();
}

export function drawDeer(ctx, x, y, headY) {
  ctx.strokeStyle = INK; ctx.lineWidth = 1.3; ctx.fillStyle = 'rgba(200,160,110,0.12)';
  sketchEllipse(ctx, x, y + 2, 8, 5, true, 5000);
  sketchCircle(ctx, x, y - 6 + headY, 5.5, true, 5010);
  ctx.fillStyle = 'rgba(230,215,190,0.15)';
  sketchEllipse(ctx, x, y + 5, 4.5, 2.5, true, 5015);
  ctx.lineWidth = 1.5;
  const as = wobble(55, 1, 0.5);
  sketchLine(ctx, x - 3, y - 10 + headY, x - 6 + as, y - 20 + headY, 5020);
  sketchLine(ctx, x - 6 + as, y - 17 + headY, x - 9 + as, y - 15 + headY, 5030);
  sketchLine(ctx, x + 3, y - 10 + headY, x + 6 - as, y - 20 + headY, 5040);
  sketchLine(ctx, x + 6 - as, y - 17 + headY, x + 9 - as, y - 15 + headY, 5050);
  ctx.fillStyle = INK;
  ctx.beginPath(); ctx.arc(x - 2, y - 7 + headY, 1.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 2, y - 7 + headY, 1.2, 0, Math.PI * 2); ctx.fill();
}

export function drawFox(ctx, x, y, flip, tailWag) {
  ctx.save(); ctx.translate(x, y); ctx.scale(flip, 1);
  ctx.strokeStyle = INK; ctx.lineWidth = 1.3; ctx.fillStyle = 'rgba(220,140,60,0.12)';
  sketchEllipse(ctx, 0, 2, 8, 5, true, 6000);
  sketchCircle(ctx, 0, -5, 5.5, true, 6010);
  ctx.fillStyle = 'rgba(220,140,60,0.08)';
  ctx.beginPath(); ctx.moveTo(-8, 2); ctx.quadraticCurveTo(-16, -2 + tailWag, -12, -8 + tailWag);
  ctx.quadraticCurveTo(-8, -4 + tailWag, -8, 2); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-4, -8); ctx.lineTo(-2, -15); ctx.lineTo(0, -8); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(2, -15); ctx.lineTo(4, -8); ctx.stroke();
  ctx.fillStyle = INK;
  ctx.beginPath(); ctx.arc(-2, -6, 1.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(2, -6, 1.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  sketchEllipse(ctx, 0, -2, 3, 2, true, 6020);
  ctx.restore();
}

export function drawFish(ctx, x, y, flip) {
  ctx.save(); ctx.translate(x, y); ctx.scale(flip, 1);
  ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.fillStyle = 'rgba(100,170,220,0.1)';
  sketchEllipse(ctx, 0, 0, 7, 3, true, 7000);
  ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(11, -4); ctx.lineTo(11, 4); ctx.closePath(); ctx.stroke();
  ctx.fillStyle = INK;
  ctx.beginPath(); ctx.arc(-2, -0.5, 0.8, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = INK_L; ctx.lineWidth = 0.8;
  const bub = wobble(7050, 3, 2);
  ctx.beginPath(); ctx.arc(-8, -4 + bub, 1.5, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}
