// 游戏入口
export const VERSION = 'v0.1.4';
import { setTime } from './render/SketchTools.js';
import { drawAICharacter, drawBubble, drawTree, drawGrass, drawBerryBush, drawRock,
         drawPine, drawMushroom, drawFlower, drawDeadTree, drawCrystal, drawCampfire, drawShelter,
         drawMountainPeak, drawCliffWall,
         drawRabbit, drawWolf, drawDeer, drawFox, drawFish } from './render/Sprites.js';
import { Camera } from './game/Camera.js';
import { MapGenerator } from './world/MapGenerator.js';
import { wobble } from './render/SketchTools.js';

// ===== 初始化 =====
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const VW = canvas.width;
const VH = canvas.height;

const mmCanvas = document.getElementById('minimap');
const mmCtx = mmCanvas.getContext('2d');
const MMW = mmCanvas.width, MMH = mmCanvas.height;

// 生成地图
const map = new MapGenerator(42).generate();
const camera = new Camera(VW, VH, map.width, map.height);

// 小地图：缩小版的背景地图，只生成一次
let mmBgCache = null;
function buildMinimapBg() {
  const oc = document.createElement('canvas');
  oc.width = MMW; oc.height = MMH;
  const ox = oc.getContext('2d');
  // 把大地图背景缩放画到小地图上
  ox.drawImage(map.bgCanvas, 0, 0, map.width, map.height, 0, 0, MMW, MMH);
  mmBgCache = oc;
}

function drawMinimap() {
  if (!mmBgCache) buildMinimapBg();
  // 背景
  mmCtx.drawImage(mmBgCache, 0, 0);

  // 视口框
  const sx = (camera.x / map.width) * MMW;
  const sy = (camera.y / map.height) * MMH;
  const sw = (VW / map.width) * MMW;
  const sh = (VH / map.height) * MMH;
  mmCtx.strokeStyle = '#3a3a3a';
  mmCtx.lineWidth = 1.5;
  mmCtx.strokeRect(sx, sy, sw, sh);

  // AI 位置（红点）
  const ax = (ai.x / map.width) * MMW;
  const ay = (ai.y / map.height) * MMH;
  mmCtx.fillStyle = '#e04040';
  mmCtx.beginPath(); mmCtx.arc(ax, ay, 3, 0, Math.PI * 2); mmCtx.fill();
}

let time = 0;

// ===== 静态物件（覆盖8个方向，后续改为自动撒点） =====
// 出生点在(1600,1200)
const trees = [
  // 北方森林
  [1300,450,12],[1400,380,14],[1550,500,11],[1650,420,13],[1750,550,10],[1500,600,12],[1350,580,11],[1800,480,13],
  // 西方森林
  [500,950,13],[600,880,11],[700,1000,14],[550,1100,10],[650,1200,12],[480,1050,11],[750,1150,13],
  // 东南森林
  [2200,1550,13],[2300,1500,11],[2400,1650,14],[2250,1700,10],[2350,1800,12],
];
const pines = [
  [1200,500,12],[1600,380,11],[1100,550,10],[1700,450,13],
  [550,1050,11],[480,900,10],
];
const grasses = [
  // 中心草地
  [1450,1100],[1550,1150],[1650,1080],[1750,1150],[1500,1250],[1400,1200],[1700,1300],
  [1350,1050],[1800,1100],
];
const rocks = [
  // 东北山地
  [2400,350,14],[2550,280,10],[2650,450,12],[2500,550,11],[2700,380,8],[2350,500,13],
  // 西南山地
  [400,1700,13],[550,1750,10],[650,1850,11],[350,1900,9],[500,1650,12],
  // 南方山地
  [1350,2100,12],[1500,2080,10],[1650,2150,11],[1400,2200,9],
];
const berries = [
  // 中心安全区
  [1450,1050],[1600,1100],[1750,1150],[1500,1300],[1650,1250],
  // 西方森林
  [600,1000],[700,1150],
];
const mushrooms = [[580,950],[1300,550],[2250,1600]];
const flowers = [
  // 花田区域（东南）
  [1950,1400],[2000,1430],[2050,1380],[2100,1450],[1980,1500],[2050,1550],[2120,1400],[1920,1480],[2150,1520],[2000,1580],
];
const deadTrees = [
  // 沼泽（西北）
  [350,500],[500,550],[450,700],[300,650],[550,450],
];
const crystals = [
  // 山地
  [2500,400],[2600,500],[450,1800],
];
// 山峰（大型，有视觉冲击力）
const mountainPeaks = [
  // 东北山地
  { x:2350, y:350, size:40, id:10000, snow:true },
  { x:2600, y:300, size:50, id:10100, snow:true },
  { x:2800, y:450, size:35, id:10200, snow:false },
  { x:2500, y:550, size:30, id:10300, snow:false },
  { x:2700, y:650, size:38, id:10400, snow:false },
  // 西南山地
  { x:350, y:1700, size:35, id:10500, snow:false },
  { x:550, y:1800, size:42, id:10600, snow:false },
  { x:450, y:1950, size:30, id:10700, snow:false },
  { x:680, y:1900, size:28, id:10800, snow:false },
  // 南方山地
  { x:1400, y:2100, size:38, id:10900, snow:false },
  { x:1600, y:2150, size:45, id:11000, snow:true },
  { x:1800, y:2200, size:35, id:11100, snow:false },
  // 雪地山峰（更高大）
  { x:2900, y:200, size:55, id:11200, snow:true },
  { x:3050, y:300, size:45, id:11300, snow:true },
  { x:200, y:150, size:40, id:11400, snow:true },
];

// 崖壁（不可通行的屏障感）
const cliffWalls = [
  // 东北山地边缘
  { x:2150, y:450, w:60, id:12000 },
  { x:2250, y:600, w:50, id:12100 },
  { x:2650, y:750, w:55, id:12200 },
  // 西南山地边缘
  { x:300, y:1650, w:50, id:12300 },
  { x:600, y:2000, w:55, id:12400 },
  // 南方山地
  { x:1300, y:2050, w:60, id:12500 },
  { x:1700, y:2100, w:50, id:12600 },
];

// 岸线（水域边缘装饰）
const shoreLines = [
  // 湖泊1（北方）岸线
  { x:1430, y:520, len:80, angle:-0.2, id:13000 },
  { x:1480, y:560, len:70, angle:0.3, id:13100 },
  // 小池塘（西方）
  { x:510, y:1130, len:50, angle:0.1, id:13200 },
  { x:540, y:1165, len:45, angle:-0.15, id:13300 },
  // 河流沿岸（多段）
  { x:700, y:470, len:60, angle:0.5, id:13400 },
  { x:900, y:780, len:65, angle:0.4, id:13500 },
  { x:1100, y:1030, len:60, angle:0.3, id:13600 },
  { x:1300, y:1180, len:55, angle:0.35, id:13700 },
  { x:1500, y:1330, len:60, angle:0.3, id:13800 },
  { x:1700, y:1530, len:55, angle:0.4, id:13900 },
  { x:1900, y:1780, len:60, angle:0.35, id:14000 },
  { x:2100, y:2030, len:55, angle:0.3, id:14100 },
];

const campfirePos = { x: 1640, y: 1220 };
const shelterPos = { x: 1560, y: 1210 };

// ===== 动物（覆盖各区域） =====
const rabbits = [
  // 中心草地
  { x:1500, y:1100, vx:0.3, phase:0, minX:1400, maxX:1600 },
  { x:1700, y:1250, vx:-0.2, phase:2, minX:1600, maxX:1800 },
  // 花田
  { x:2050, y:1450, vx:0.25, phase:1, minX:1950, maxX:2150 },
];
const wolves = [
  // 东北山地
  { x:2500, y:450, vx:-0.15, phase:0, minX:2350, maxX:2650 },
  { x:2600, y:600, vx:0.1, phase:1, minX:2450, maxX:2750 },
  // 西南山地
  { x:500, y:1800, vx:0.12, phase:2, minX:350, maxX:650 },
  // 南方山地
  { x:1500, y:2150, vx:-0.1, phase:0.5, minX:1350, maxX:1650 },
];
const deers = [
  // 中心/北方
  { x:1500, y:1050, headY:0, eating:false, timer:0 },
  { x:1400, y:550, headY:0, eating:false, timer:60 },
  // 西方
  { x:650, y:1100, headY:0, eating:false, timer:30 },
];
const fishes = [
  // 湖泊（北方）
  { x:1480, y:540, vx:0.4, phase:0, minX:1440, maxX:1560 },
  // 小池塘（西方）
  { x:540, y:1140, vx:0.3, phase:0.8, minX:510, maxX:590 },
  // 河流中
  { x:1100, y:1050, vx:-0.3, phase:1.5, minX:1050, maxX:1150 },
];
const foxes = [
  // 北方森林
  { x:1500, y:500, vx:0.18, phase:0, minX:1350, maxX:1650 },
  // 西方森林
  { x:600, y:1050, vx:-0.15, phase:1, minX:480, maxX:720 },
];

// ===== AI 角色（8方向大环绕路径） =====
const ai = {
  x: 1600, y: 1200, expr: 'curious', bubble: '这里好像很安全...',
  wait: 0, speed: 1.5,
  path: [
    // 出生点
    { x:1600, y:1200, w:100, e:'curious', b:'这里好像很安全...' },
    // → 北方（森林）
    { x:1550, y:1050, w:50, e:'normal', b:'' },
    { x:1500, y:850, w:60, e:'thinking', b:'往北走走看...' },
    { x:1500, y:600, w:70, e:'curious', b:'好多树！这是森林' },
    { x:1500, y:530, w:60, e:'happy', b:'发现一个湖！' },
    // → 东北（山地）
    { x:1800, y:450, w:50, e:'normal', b:'继续往东北走' },
    { x:2200, y:350, w:60, e:'thinking', b:'地上好多石头...' },
    { x:2450, y:400, w:40, e:'scared', b:'有狼！快跑！' },
    { x:2100, y:500, w:40, e:'scared', b:'' },
    { x:1800, y:600, w:60, e:'determined', b:'还好跑掉了' },
    // → 回中心
    { x:1600, y:900, w:40, e:'normal', b:'' },
    { x:1600, y:1200, w:80, e:'happy', b:'回到家了' },
    // → 东南（花田+森林）
    { x:1800, y:1300, w:50, e:'normal', b:'' },
    { x:2000, y:1400, w:70, e:'curious', b:'好多花！好漂亮' },
    { x:2200, y:1550, w:60, e:'normal', b:'再往深处看看' },
    { x:2350, y:1700, w:60, e:'thinking', b:'这里树很密...' },
    { x:2200, y:1600, w:40, e:'normal', b:'回去吧' },
    // → 回中心
    { x:1800, y:1350, w:30, e:'normal', b:'' },
    { x:1600, y:1200, w:60, e:'happy', b:'到家了！' },
    // → 西方（森林）
    { x:1300, y:1100, w:40, e:'normal', b:'' },
    { x:900, y:1000, w:50, e:'thinking', b:'往西边探索' },
    { x:650, y:1000, w:60, e:'curious', b:'又一片森林' },
    { x:550, y:1100, w:50, e:'happy', b:'发现浆果了！' },
    // → 西南（山地）
    { x:500, y:1400, w:50, e:'normal', b:'继续往南' },
    { x:450, y:1700, w:60, e:'thinking', b:'这里好荒凉...' },
    { x:500, y:1850, w:40, e:'scared', b:'又有狼！' },
    { x:650, y:1600, w:40, e:'scared', b:'快跑！' },
    { x:900, y:1300, w:50, e:'determined', b:'这边太危险了' },
    // → 回中心
    { x:1300, y:1200, w:30, e:'normal', b:'' },
    { x:1600, y:1200, w:80, e:'happy', b:'安全！' },
    // → 南方（沙地+山地）
    { x:1500, y:1400, w:40, e:'normal', b:'' },
    { x:1400, y:1700, w:60, e:'curious', b:'这里有沙地' },
    { x:1450, y:1950, w:50, e:'thinking', b:'越来越远了...' },
    { x:1500, y:2100, w:40, e:'scared', b:'好像有狼群！' },
    { x:1500, y:1800, w:40, e:'scared', b:'' },
    { x:1550, y:1500, w:50, e:'determined', b:'赶紧回去' },
    // → 回中心
    { x:1600, y:1200, w:80, e:'happy', b:'终于到家了' },
    // → 西北（沼泽）
    { x:1300, y:1000, w:40, e:'normal', b:'' },
    { x:900, y:750, w:50, e:'thinking', b:'往西北方向' },
    { x:600, y:550, w:60, e:'curious', b:'这里雾蒙蒙的...' },
    { x:400, y:500, w:50, e:'thinking', b:'是沼泽！好多枯树' },
    { x:450, y:650, w:40, e:'scared', b:'脚陷进去了！' },
    { x:700, y:750, w:40, e:'determined', b:'赶紧走' },
    { x:1000, y:900, w:40, e:'normal', b:'' },
    // → 回中心
    { x:1600, y:1200, w:80, e:'happy', b:'还是家里安全' },
  ],
  si: 0,
};

function updateAI() {
  const s = ai.path[ai.si];
  const dx = s.x - ai.x, dy = s.y - ai.y, d = Math.hypot(dx, dy);
  if (d > 2) {
    ai.x += dx / d * ai.speed;
    ai.y += dy / d * ai.speed;
  } else {
    ai.expr = s.e; ai.bubble = s.b; ai.wait++;
    if (ai.wait >= s.w) { ai.wait = 0; ai.si = (ai.si + 1) % ai.path.length; }
  }
}

// ===== 动物更新 =====
function updateAnimals() {
  for (const r of rabbits) { r.x += r.vx; r.phase += 0.05; if (r.x > r.maxX || r.x < r.minX) r.vx *= -1; }
  for (const w of wolves) { w.x += w.vx; w.phase += 0.02; if (w.x > w.maxX || w.x < w.minX) w.vx *= -1; }
  for (const d of deers) { d.timer++; if (d.timer % 120 === 0) d.eating = !d.eating; d.headY += (d.eating ? 8 : 0 - d.headY) * 0.05; }
  for (const f of fishes) { f.x += f.vx; f.phase += 0.03; if (f.x > f.maxX || f.x < f.minX) f.vx *= -1; }
  for (const f of foxes) { f.x += f.vx; f.phase += 0.03; if (f.x > f.maxX || f.x < f.minX) f.vx *= -1; }
}

// ===== UI =====
function drawUI() {
  ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.roundRect(VW - 130, 15, 115, 35, 8); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#3a3a3a'; ctx.font = '15px Georgia,serif';
  ctx.fillText('☀ 第 1 天', VW - 118, 38);

  // 状态面板
  const px = 15, py = VH - 125;
  ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.roundRect(px, py, 220, 110, 8); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#3a3a3a'; ctx.font = 'bold 13px Georgia,serif'; ctx.fillText('AI 状态', px + 12, py + 20);
  ctx.font = '12px Georgia,serif';
  ctx.fillText('生命', px + 12, py + 42);
  ctx.strokeStyle = '#999'; ctx.lineWidth = 1; ctx.strokeRect(px + 52, py + 32, 100, 12);
  ctx.fillStyle = 'rgba(220,80,80,0.4)'; ctx.fillRect(px + 53, py + 33, 78, 10);
  ctx.fillStyle = '#3a3a3a'; ctx.fillText('80%', px + 160, py + 42);
  ctx.fillText('饥饿', px + 12, py + 60);
  ctx.strokeStyle = '#999'; ctx.strokeRect(px + 52, py + 50, 100, 12);
  ctx.fillStyle = 'rgba(100,170,80,0.4)'; ctx.fillRect(px + 53, py + 51, 55, 10);
  ctx.fillStyle = '#3a3a3a'; ctx.fillText('55%', px + 160, py + 60);
  ctx.fillText('背包: 浆果×3  木头×2', px + 12, py + 80);
  ctx.fillStyle = '#999'; ctx.font = 'italic 11px Georgia,serif';
  ctx.fillText('💭 ' + (ai.bubble || '...'), px + 12, py + 98);

  // 版本号
  ctx.fillStyle = '#ccc'; ctx.font = '10px Georgia,serif';
  ctx.fillText(VERSION, 10, VH - 8);
}

// ===== 主循环 =====
function frame() {
  time += 0.016;
  setTime(time);
  updateAI();
  updateAnimals();
  camera.follow(ai.x, ai.y);

  // 清屏 + 背景
  ctx.clearRect(0, 0, VW, VH);
  ctx.drawImage(map.bgCanvas, camera.x, camera.y, VW, VH, 0, 0, VW, VH);

  // 收集所有可绘制物体，按y排序
  const draws = [];
  const cx = camera.x, cy = camera.y;

  // 静态物件
  trees.forEach((t, i) => { if (camera.isVisible(t[0], t[1])) draws.push({ y: t[1], fn: () => drawTree(ctx, t[0] - cx, t[1] - cy, t[2], i * 200) }); });
  pines.forEach((t, i) => { if (camera.isVisible(t[0], t[1])) draws.push({ y: t[1], fn: () => drawPine(ctx, t[0] - cx, t[1] - cy, t[2], i * 200 + 1000) }); });
  grasses.forEach((g, i) => { if (camera.isVisible(g[0], g[1])) draws.push({ y: g[1], fn: () => drawGrass(ctx, g[0] - cx, g[1] - cy, i * 100) }); });
  rocks.forEach((r, i) => { if (camera.isVisible(r[0], r[1])) draws.push({ y: r[1], fn: () => drawRock(ctx, r[0] - cx, r[1] - cy, r[2], i * 300) }); });
  berries.forEach((b, i) => { if (camera.isVisible(b[0], b[1])) draws.push({ y: b[1], fn: () => drawBerryBush(ctx, b[0] - cx, b[1] - cy, i * 400) }); });
  mushrooms.forEach((m, i) => { if (camera.isVisible(m[0], m[1])) draws.push({ y: m[1], fn: () => drawMushroom(ctx, m[0] - cx, m[1] - cy, i * 500) }); });
  flowers.forEach((f, i) => { if (camera.isVisible(f[0], f[1])) draws.push({ y: f[1], fn: () => drawFlower(ctx, f[0] - cx, f[1] - cy, i * 150, i % 5) }); });
  deadTrees.forEach((d, i) => { if (camera.isVisible(d[0], d[1])) draws.push({ y: d[1], fn: () => drawDeadTree(ctx, d[0] - cx, d[1] - cy, i * 250) }); });
  crystals.forEach((c, i) => { if (camera.isVisible(c[0], c[1])) draws.push({ y: c[1], fn: () => drawCrystal(ctx, c[0] - cx, c[1] - cy) }); });

  // 山峰
  mountainPeaks.forEach(p => { if (camera.isVisible(p.x, p.y, 80)) draws.push({ y: p.y + p.size * 0.6, fn: () => drawMountainPeak(ctx, p.x - cx, p.y - cy, p.size, p.id, p.snow) }); });
  // 崖壁
  cliffWalls.forEach(c => { if (camera.isVisible(c.x, c.y, 60)) draws.push({ y: c.y + 8, fn: () => drawCliffWall(ctx, c.x - cx, c.y - cy, c.w, c.id) }); });
  if (camera.isVisible(shelterPos.x, shelterPos.y)) draws.push({ y: shelterPos.y, fn: () => drawShelter(ctx, shelterPos.x - cx, shelterPos.y - cy) });
  if (camera.isVisible(campfirePos.x, campfirePos.y)) draws.push({ y: campfirePos.y, fn: () => drawCampfire(ctx, campfirePos.x - cx, campfirePos.y - cy) });

  // 动物
  rabbits.forEach(r => { if (camera.isVisible(r.x, r.y)) draws.push({ y: r.y, fn: () => { const hop = Math.abs(Math.sin(r.phase * 3)) * 5; drawRabbit(ctx, r.x - cx, r.y - cy, r.vx < 0 ? -1 : 1, hop); } }); });
  wolves.forEach(w => { if (camera.isVisible(w.x, w.y)) draws.push({ y: w.y, fn: () => { const tw = wobble(w.phase * 100, 5, 2); drawWolf(ctx, w.x - cx, w.y - cy, w.vx < 0 ? -1 : 1, tw); } }); });
  deers.forEach(d => { if (camera.isVisible(d.x, d.y)) draws.push({ y: d.y, fn: () => drawDeer(ctx, d.x - cx, d.y - cy, d.headY) }); });
  fishes.forEach(f => { if (camera.isVisible(f.x, f.y)) draws.push({ y: f.y, fn: () => { const fy = f.y + Math.sin(f.phase * 2) * 3; drawFish(ctx, f.x - cx, fy - cy, f.vx < 0 ? -1 : 1); } }); });
  foxes.forEach(f => { if (camera.isVisible(f.x, f.y)) draws.push({ y: f.y, fn: () => { const tw = wobble(f.phase * 80, 4, 1.5); drawFox(ctx, f.x - cx, f.y - cy, f.vx < 0 ? -1 : 1, tw); } }); });

  // AI 角色
  draws.push({ y: ai.y + 20, fn: () => {
    drawAICharacter(ctx, ai.x - cx, ai.y - cy, ai.expr);
    drawBubble(ctx, ai.x - cx, ai.y - cy, ai.bubble);
  }});

  // 深度排序渲染
  draws.sort((a, b) => a.y - b.y);
  for (const d of draws) d.fn();

  drawUI();
  drawMinimap();
  requestAnimationFrame(frame);
}

frame();
