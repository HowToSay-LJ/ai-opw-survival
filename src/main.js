// 游戏入口
export const VERSION = 'v0.4.10';
import { setTime } from './render/SketchTools.js';
import { drawAICharacter, drawBubble, drawTree, drawGrass, drawBerryBush, drawRock,
         drawPine, drawMushroom, drawFlower, drawDeadTree, drawCrystal, drawCampfire, drawShelter,
         drawMountainPeak, drawCliffWall,
         drawRabbit, drawWolf, drawDeer, drawFox, drawFish } from './render/Sprites.js';
import { Camera } from './game/Camera.js';
import { MapGenerator } from './world/MapGenerator.js';
import { GameState, PHASE } from './game/GameState.js';
import { NightUI } from './render/NightUI.js';
import { AIBehavior } from './entities/AIBehavior.js';
import { MapMemory } from './systems/MapMemory.js';
import { LocalLLM } from './ai/LocalLLM.js';
import { logger } from './systems/Logger.js';
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

// 游戏状态
const gs = new GameState();
gs.ai.x = map.spawnX;
gs.ai.y = map.spawnY;
gs.ai.personality = 'reckless'; // 测试用，后续改为玩家选择
// 从零开始：无庇护所、无篝火、无装备
gs.startDay();

// 夜晚UI
const nightUI = new NightUI(canvas);

// 小地图
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
  mmCtx.drawImage(mmBgCache, 0, 0);

  // 战争迷雾：未探索区域覆盖半透明黑色
  const scaleX = MMW / map.width;
  const scaleY = MMH / map.height;
  const gs32 = mapMemory.gridSize;

  mmCtx.fillStyle = 'rgba(60,55,50,0.55)';
  for (let gy = 0; gy < mapMemory.gridRows; gy++) {
    for (let gx = 0; gx < mapMemory.gridCols; gx++) {
      if (!mapMemory.explored[gy * mapMemory.gridCols + gx]) {
        mmCtx.fillRect(gx * gs32 * scaleX, gy * gs32 * scaleY, gs32 * scaleX + 0.5, gs32 * scaleY + 0.5);
      }
    }
  }

  // 视口框
  const sx = (camera.x / map.width) * MMW;
  const sy = (camera.y / map.height) * MMH;
  const sw = (VW / map.width) * MMW;
  const sh = (VH / map.height) * MMH;
  mmCtx.strokeStyle = '#3a3a3a';
  mmCtx.lineWidth = 1.5;
  mmCtx.strokeRect(sx, sy, sw, sh);

  // AI 位置（红点）
  const ax = (gs.ai.x / map.width) * MMW;
  const ay = (gs.ai.y / map.height) * MMH;
  mmCtx.fillStyle = '#e04040';
  mmCtx.beginPath(); mmCtx.arc(ax, ay, 3, 0, Math.PI * 2); mmCtx.fill();

  // 探索百分比
  mmCtx.fillStyle = '#999'; mmCtx.font = '9px Georgia,serif';
  mmCtx.fillText(`探索 ${mapMemory.exploredPercent}%`, 4, MMH - 4);
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
// ===== 可采集资源（统一格式：{ x, y, resourceType, depleted }） =====
const resources = [
  // 浆果（安全区4个，近区8个，共12个）
  // 安全区
  { x:1550, y:1100, resourceType:'berry', depleted:false },
  { x:1650, y:1180, resourceType:'berry', depleted:false },
  { x:1500, y:1250, resourceType:'berry', depleted:false },
  { x:1700, y:1300, resourceType:'berry', depleted:false },
  // 近区-北方森林
  { x:1350, y:550, resourceType:'berry', depleted:false },
  { x:1600, y:480, resourceType:'berry', depleted:false },
  { x:1450, y:650, resourceType:'berry', depleted:false },
  // 近区-西方森林
  { x:600, y:1000, resourceType:'berry', depleted:false },
  { x:700, y:1150, resourceType:'berry', depleted:false },
  { x:550, y:1100, resourceType:'berry', depleted:false },
  // 近区-东南森林
  { x:2200, y:1600, resourceType:'berry', depleted:false },
  { x:2300, y:1700, resourceType:'berry', depleted:false },
  // 树木（出生点附近2个 + 各森林区）
  { x:1500, y:1050, resourceType:'wood', depleted:false },  // 出生点北侧150px
  { x:1750, y:1100, resourceType:'wood', depleted:false },  // 出生点东北170px
  { x:1320, y:500, resourceType:'wood', depleted:false },
  { x:1500, y:650, resourceType:'wood', depleted:false },
  { x:1700, y:500, resourceType:'wood', depleted:false },
  { x:550, y:980, resourceType:'wood', depleted:false },
  { x:680, y:1080, resourceType:'wood', depleted:false },
  { x:2250, y:1580, resourceType:'wood', depleted:false },
  // 石头（出生点附近1个 + 近区溪边 + 中区山地大量）
  { x:1650, y:1050, resourceType:'stone', depleted:false },  // 出生点北侧160px
  { x:1400, y:950, resourceType:'stone', depleted:false },
  { x:1700, y:1000, resourceType:'stone', depleted:false },
  { x:1300, y:1100, resourceType:'stone', depleted:false },
  { x:1200, y:700, resourceType:'stone', depleted:false },
  { x:1400, y:750, resourceType:'stone', depleted:false },
  { x:2400, y:380, resourceType:'stone', depleted:false },
  { x:2550, y:500, resourceType:'stone', depleted:false },
  { x:2650, y:600, resourceType:'stone', depleted:false },
  { x:400, y:1750, resourceType:'stone', depleted:false },
  { x:550, y:1850, resourceType:'stone', depleted:false },
  { x:1450, y:2100, resourceType:'stone', depleted:false },
  // 草（到处都有，无限）
  { x:1480, y:1150, resourceType:'grass', depleted:false },
  { x:1620, y:1050, resourceType:'grass', depleted:false },
  { x:1550, y:1300, resourceType:'grass', depleted:false },
  { x:1350, y:1180, resourceType:'grass', depleted:false },
  { x:1700, y:1200, resourceType:'grass', depleted:false },
  // 止血草（花田边缘）
  { x:1900, y:1380, resourceType:'herb', depleted:false },
  { x:2050, y:1420, resourceType:'herb', depleted:false },
  // 粘土（沙地）
  { x:1300, y:1730, resourceType:'clay', depleted:false },
  { x:1500, y:1750, resourceType:'clay', depleted:false },
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
  { x:1500, y:1100, vx:0.3, phase:0, minX:1400, maxX:1600, hp:10, species:'兔子', meatDrop:1, dead:false },
  { x:1700, y:1250, vx:-0.2, phase:2, minX:1600, maxX:1800, hp:10, species:'兔子', meatDrop:1, dead:false },
  { x:2050, y:1450, vx:0.25, phase:1, minX:1950, maxX:2150, hp:10, species:'兔子', meatDrop:1, dead:false },
  { x:1400, y:600, vx:-0.2, phase:0.5, minX:1300, maxX:1500, hp:10, species:'兔子', meatDrop:1, dead:false },
];
const wolves = [
  { x:2500, y:450, vx:-0.15, phase:0, minX:2350, maxX:2650, hp:50, attackDamage:12, species:'狼', dead:false },
  { x:2600, y:600, vx:0.1, phase:1, minX:2450, maxX:2750, hp:50, attackDamage:12, species:'狼', dead:false },
  { x:500, y:1800, vx:0.12, phase:2, minX:350, maxX:650, hp:50, attackDamage:12, species:'狼', dead:false },
  { x:1500, y:2150, vx:-0.1, phase:0.5, minX:1350, maxX:1650, hp:50, attackDamage:12, species:'狼', dead:false },
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

// ===== 系统初始化 =====
import { CraftingSystem } from './systems/Crafting.js';
import { CombatSystem } from './entities/Combat.js';

const craftingSystem = new CraftingSystem(gs);
const combatSystem = new CombatSystem(gs);
const mapMemory = new MapMemory(map.width, map.height);
const localLLM = new LocalLLM();
const worldObjects = { resources, rabbits, wolves, deers, fishes, foxes, shelterPos, campfirePos };
const aiBehavior = new AIBehavior(gs, worldObjects, craftingSystem, combatSystem, mapMemory, localLLM);

// 初始化 LLM
logger.info('游戏', '游戏启动', { version: VERSION, personality: gs.ai.personality });
localLLM.buildSystemPrompt(gs.ai.personality, gs.strategyBook);
localLLM.warmup();

// ===== 动物更新 =====
function updateAnimals() {
  const aiX = gs.ai.x, aiY = gs.ai.y;
  for (const r of rabbits) {
    if (r.dead) continue;
    // 兔子：AI靠近时逃跑
    const dist = Math.hypot(r.x - aiX, r.y - aiY);
    if (dist < 120) {
      const dx = r.x - aiX, dy = r.y - aiY;
      const d = Math.hypot(dx, dy) || 1;
      r.x += (dx / d) * 1.5;
      r.y += (dy / d) * 1.5;
    } else {
      r.x += r.vx; if (r.x > r.maxX || r.x < r.minX) r.vx *= -1;
    }
    r.phase += 0.05;
  }
  // 狼的移动在 AIBehavior._checkWolfChase 中处理
  for (const w of wolves) {
    if (w.dead) continue;
    if (!w.chasing) { w.x += w.vx; w.phase += 0.02; if (w.x > w.maxX || w.x < w.minX) w.vx *= -1; }
  }
  for (const d of deers) { d.timer++; if (d.timer % 120 === 0) d.eating = !d.eating; d.headY += (d.eating ? 8 : 0 - d.headY) * 0.05; }
  for (const f of fishes) { f.x += f.vx; f.phase += 0.03; if (f.x > f.maxX || f.x < f.minX) f.vx *= -1; }
  for (const f of foxes) { f.x += f.vx; f.phase += 0.03; if (f.x > f.maxX || f.x < f.minX) f.vx *= -1; }
}

// ===== UI =====
function drawUI() {
  const hp = gs.hpPercent, hunger = gs.hungerPercent;
  const timeLeft = Math.ceil(gs.dayTimeLeft);

  // 天数+倒计时
  ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.roundRect(VW / 2 - 70, 12, 140, 35, 8); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#3a3a3a'; ctx.font = '14px Georgia,serif'; ctx.textAlign = 'center';
  ctx.fillText(`☀ 第 ${gs.day} 天  ${timeLeft}s`, VW / 2, 35);
  ctx.textAlign = 'left';

  // 状态面板
  const px = 15, py = VH - 140;
  ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.roundRect(px, py, 220, 125, 8); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#3a3a3a'; ctx.font = 'bold 13px Georgia,serif'; ctx.fillText('AI 状态', px + 12, py + 20);
  ctx.font = '12px Georgia,serif';

  // 生命条
  ctx.fillText('生命', px + 12, py + 42);
  ctx.strokeStyle = '#999'; ctx.lineWidth = 1; ctx.strokeRect(px + 52, py + 32, 100, 12);
  ctx.fillStyle = hp > 30 ? 'rgba(220,80,80,0.4)' : 'rgba(220,40,40,0.6)';
  ctx.fillRect(px + 53, py + 33, hp, 10);
  ctx.fillStyle = '#3a3a3a'; ctx.fillText(`${hp}%`, px + 160, py + 42);

  // 饥饿条
  ctx.fillText('饥饿', px + 12, py + 60);
  ctx.strokeStyle = '#999'; ctx.strokeRect(px + 52, py + 50, 100, 12);
  ctx.fillStyle = hunger > 30 ? 'rgba(100,170,80,0.4)' : 'rgba(200,160,40,0.5)';
  ctx.fillRect(px + 53, py + 51, hunger, 10);
  ctx.fillStyle = '#3a3a3a'; ctx.fillText(`${hunger}%`, px + 160, py + 60);

  // 武器
  const wpn = gs.ai.equipment.weapon;
  if (wpn) {
    ctx.fillStyle = '#666'; ctx.font = '11px Georgia,serif';
    ctx.fillText(`⚔ ${wpn.name}(${wpn.durability})`, px + 12, py + 80);
  } else {
    ctx.fillStyle = '#bbb'; ctx.font = '11px Georgia,serif';
    ctx.fillText('⚔ 无武器', px + 12, py + 80);
  }

  // 内心想法 + 当前行动
  ctx.fillStyle = '#999'; ctx.font = 'italic 11px Georgia,serif';
  ctx.fillText('💭 ' + (gs.ai.bubble || '...'), px + 12, py + 98);
  // debug: 当前行动
  ctx.fillStyle = '#bbb'; ctx.font = '9px Georgia,serif';
  ctx.fillText('行动: ' + aiBehavior.action, px + 12, py + 110);

  // 中毒标记
  if (gs.ai.poisoned) {
    ctx.fillStyle = '#8a40a0'; ctx.font = 'bold 11px Georgia,serif';
    ctx.fillText('🐍 中毒中', px + 140, py + 20);
  }

  // 版本号
  ctx.fillStyle = '#ccc'; ctx.font = '10px Georgia,serif';
  ctx.fillText(VERSION, 10, VH - 8);

  // ===== 背包面板（右下角） =====
  const bx = VW - 195, by = VH - 170;
  ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.roundRect(bx, by, 180, 155, 8); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#3a3a3a'; ctx.font = 'bold 12px Georgia,serif';
  ctx.fillText('背包', bx + 10, by + 18);
  ctx.fillStyle = '#999'; ctx.font = '10px Georgia,serif';
  ctx.fillText(`${gs.ai.inventory.length}/${gs.ai.inventorySize}`, bx + 145, by + 18);

  // 背包格子
  const inv = gs.ai.inventory;
  const cellSize = 38, cols = 4, padX = 10, padY = 28;
  for (let i = 0; i < gs.ai.inventorySize; i++) {
    const cx = bx + padX + (i % cols) * (cellSize + 4);
    const cy = by + padY + Math.floor(i / cols) * (cellSize + 4);
    // 格子背景
    ctx.fillStyle = i < inv.length ? 'rgba(245,241,232,0.8)' : 'rgba(230,226,218,0.4)';
    ctx.strokeStyle = i < inv.length ? '#bbb' : '#ddd';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(cx, cy, cellSize, cellSize, 4); ctx.fill(); ctx.stroke();

    if (i < inv.length) {
      const item = inv[i];
      // 物品名（缩短）
      ctx.fillStyle = '#3a3a3a'; ctx.font = '10px Georgia,serif'; ctx.textAlign = 'center';
      const shortName = item.name.length > 3 ? item.name.slice(0, 3) : item.name;
      ctx.fillText(shortName, cx + cellSize / 2, cy + cellSize / 2 + 2);
      // 数量
      if (item.count > 1) {
        ctx.fillStyle = '#666'; ctx.font = 'bold 9px Georgia,serif'; ctx.textAlign = 'right';
        ctx.fillText('×' + item.count, cx + cellSize - 2, cy + cellSize - 3);
      }
      // 耐久条（工具）
      if (item.durability != null) {
        const durPct = item.durability / 15; // 假设max15
        ctx.fillStyle = durPct > 0.3 ? 'rgba(100,170,80,0.5)' : 'rgba(220,80,80,0.5)';
        ctx.fillRect(cx + 2, cy + cellSize - 5, (cellSize - 4) * durPct, 3);
      }
      ctx.textAlign = 'left';
    }
  }

  // ===== 进度条（AI头上方） =====
  const progressInfo = gs.ai.craftingInfo || gs.ai.collectingInfo || gs.ai.eatingInfo;
  if (progressInfo) {
    const sx = gs.ai.x - camera.x, sy = gs.ai.y - camera.y - 35;
    const barW = 44, barH = 5;
    // 背景
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(sx - barW / 2, sy, barW, barH);
    // 进度
    const isCraft = !!gs.ai.craftingInfo;
    const isEat = !!gs.ai.eatingInfo;
    ctx.fillStyle = isCraft ? 'rgba(200,170,60,0.6)' : isEat ? 'rgba(220,140,80,0.6)' : 'rgba(100,170,80,0.6)';
    ctx.fillRect(sx - barW / 2, sy, barW * progressInfo.progress / 100, barH);
    ctx.strokeStyle = '#aaa'; ctx.lineWidth = 0.5;
    ctx.strokeRect(sx - barW / 2, sy, barW, barH);
    ctx.fillStyle = '#555'; ctx.font = '9px Georgia,serif'; ctx.textAlign = 'center';
    const label = isCraft ? '制作中...' : isEat ? '吃' + progressInfo.name : '采集' + progressInfo.name;
    ctx.fillText(label, sx, sy - 4);
    ctx.textAlign = 'left';

    // 简单动画：采集时资源旁边画几个小粒子
    if (!isCraft && aiBehavior.collectTarget) {
      const t = aiBehavior.collectTarget;
      const tx = t.x - camera.x, ty = t.y - camera.y;
      const sparkCount = 3;
      for (let i = 0; i < sparkCount; i++) {
        const angle = time * 3 + i * (Math.PI * 2 / sparkCount);
        const r = 10 + Math.sin(time * 5 + i) * 4;
        const px = tx + Math.cos(angle) * r;
        const py = ty + Math.sin(angle) * r - 5;
        ctx.fillStyle = 'rgba(180,160,100,0.4)';
        ctx.beginPath(); ctx.arc(px, py, 1.5, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
}

// ===== 存档系统 =====
let gameSaved = false;

function saveGameData() {
  if (gameSaved) return;
  gameSaved = true;

  const data = gs.exportSaveData(VERSION);
  data.mapMemory = mapMemory.export();
  data.logs = logger.export();
  const filename = `${VERSION}_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`;
  const json = JSON.stringify(data, null, 2);

  // 存到 localStorage
  const saves = JSON.parse(localStorage.getItem('ai-survival-saves') || '[]');
  saves.push({ filename, data });
  // 最多保留50局
  if (saves.length > 50) saves.shift();
  localStorage.setItem('ai-survival-saves', JSON.stringify(saves));

  // 自动下载文件到 saves/ 目录（浏览器会下载到默认下载目录）
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);

  console.log(`[存档] ${filename} 已保存（存活${data.survivedDays}天，死因：${data.deathCause}）`);
}

// ===== 夜晚流程控制 =====
function respawnAnimals() {
  // 每天刷新2只兔子（随机位置在安全区/近区）
  const spawnAreas = [
    { x: 1400, y: 1000, range: 200 },
    { x: 1700, y: 1200, range: 200 },
    { x: 600, y: 1050, range: 150 },
    { x: 1500, y: 600, range: 150 },
  ];
  let respawned = 0;
  for (const r of rabbits) {
    if (r.dead && respawned < 2) {
      const area = spawnAreas[Math.floor(Math.random() * spawnAreas.length)];
      r.x = area.x + (Math.random() - 0.5) * area.range;
      r.y = area.y + (Math.random() - 0.5) * area.range;
      r.hp = 10;
      r.dead = false;
      respawned++;
      logger.info('刷新', `兔子重生在 (${Math.round(r.x)},${Math.round(r.y)})`);
    }
  }
}

function enterNightFlow() {
  respawnAnimals();
  // 模拟AI汇报（Phase 4会换成Claude API生成）
  const events = gs.todayEvents;
  let report = `今天是第${gs.day}天。`;
  if (events.length === 0) {
    report += '我在附近转了转，没什么特别的事。';
  } else {
    report += events.map(e => e.event).join('，然后') + '。';
  }
  report += `\n现在我的状态：生命${gs.hpPercent}%，饥饿${gs.hungerPercent}%。`;

  gs.enterReport(report);

  nightUI.activate(
    // onSubmit：玩家提交留言
    (msg) => {
      nightUI._resetAutoTimer();
      gs.submitMessage(msg);
      // 模拟策略更新（Phase 4会换成Claude API）
      const mockDiff = [
        { type: 'add', text: '根据留言调整策略...' },
        { type: 'keep', text: '保持基础生存优先' },
      ];
      gs.finishStrategyUpdate(gs.strategyBook + '\n' + msg, mockDiff);
      // 重建 LLM system prompt（策略手册更新了）
      localLLM.buildSystemPrompt(gs.ai.personality, gs.strategyBook);
    },
    // onNext：进入下一阶段
    () => {
      nightUI._resetAutoTimer();
      const phase = gs.phase;
      if (phase === PHASE.NIGHT_SETTLE) {
        gs.enterReport(gs.nightReport || '今天没什么特别的...');
        gs.phase = PHASE.NIGHT_REPORT;
      } else if (phase === PHASE.NIGHT_REPORT) {
        gs.enterMessage();
      } else if (phase === PHASE.STRATEGY_UPDATE) {
        nightUI.deactivate();
        gs.dawn();
      } else if (phase === PHASE.DEATH) {
        location.reload();
      }
    }
  );
}

// ===== 主循环 =====
let lastTime = 0;
function frame(timestamp) {
  const dt = lastTime ? Math.min((timestamp - lastTime) / 1000, 0.05) : 0.016;
  lastTime = timestamp;
  time += dt;
  setTime(time);

  // ===== 游戏阶段分支 =====
  const phase = gs.phase;

  // 夜晚阶段 → 渲染夜晚UI
  if (phase === PHASE.NIGHT_SETTLE) {
    nightUI.drawSettle(gs.day, gs.nightSettleText);
    requestAnimationFrame(frame); return;
  }
  if (phase === PHASE.NIGHT_REPORT) {
    nightUI.drawReport(gs.day, gs.nightReport);
    requestAnimationFrame(frame); return;
  }
  if (phase === PHASE.NIGHT_MESSAGE) {
    nightUI.drawMessageInput(gs.day);
    requestAnimationFrame(frame); return;
  }
  if (phase === PHASE.STRATEGY_UPDATE) {
    nightUI.drawStrategyUpdate(gs.day, gs.strategyDiff);
    requestAnimationFrame(frame); return;
  }
  if (phase === PHASE.DEATH) {
    saveGameData();
    nightUI.drawDeath(gs.day, gs.history);
    if (!nightUI.active) nightUI.activate(null, () => location.reload());
    requestAnimationFrame(frame); return;
  }

  // ===== 白天阶段 =====
  // 游戏状态tick
  gs.tickDay(dt);

  // 天黑 → 进入夜晚流程
  if (gs.phase === PHASE.NIGHT_SETTLE) {
    enterNightFlow();
    requestAnimationFrame(frame); return;
  }
  if (gs.phase === PHASE.DEATH) {
    saveGameData();
    nightUI.drawDeath(gs.day, gs.history);
    if (!nightUI.active) nightUI.activate(null, () => location.reload());
    requestAnimationFrame(frame); return;
  }

  aiBehavior.update(dt);
  updateAnimals();
  mapMemory.update(gs.ai.x, gs.ai.y, aiBehavior.viewRange, worldObjects, gs.day);
  mapMemory.syncResourceStates(resources);
  camera.follow(gs.ai.x, gs.ai.y);

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
  // 可采集资源
  resources.forEach((r, i) => {
    if (!camera.isVisible(r.x, r.y)) return;
    if (r.depleted) {
      // 已采空：淡色标记
      draws.push({ y: r.y, fn: () => {
        ctx.strokeStyle = '#ccc'; ctx.lineWidth = 0.8;
        ctx.fillStyle = 'rgba(200,200,190,0.06)';
        ctx.beginPath(); ctx.ellipse(r.x - cx, r.y - cy, 8, 5, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
      }});
      return;
    }
    switch (r.resourceType) {
      case 'berry':
        draws.push({ y: r.y, fn: () => drawBerryBush(ctx, r.x - cx, r.y - cy, i * 400) }); break;
      case 'wood':
        draws.push({ y: r.y, fn: () => drawTree(ctx, r.x - cx, r.y - cy, 11, i * 200 + 5000) }); break;
      case 'stone':
        draws.push({ y: r.y, fn: () => drawRock(ctx, r.x - cx, r.y - cy, 9, i * 300 + 6000) }); break;
      case 'grass':
        draws.push({ y: r.y, fn: () => drawGrass(ctx, r.x - cx, r.y - cy, i * 100 + 7000) }); break;
      case 'herb':
        draws.push({ y: r.y, fn: () => drawFlower(ctx, r.x - cx, r.y - cy, i * 150 + 8000, 1) }); break;
      case 'clay':
        draws.push({ y: r.y, fn: () => drawRock(ctx, r.x - cx, r.y - cy, 7, i * 300 + 9000) }); break;
    }
  });
  mushrooms.forEach((m, i) => { if (camera.isVisible(m[0], m[1])) draws.push({ y: m[1], fn: () => drawMushroom(ctx, m[0] - cx, m[1] - cy, i * 500) }); });
  flowers.forEach((f, i) => { if (camera.isVisible(f[0], f[1])) draws.push({ y: f[1], fn: () => drawFlower(ctx, f[0] - cx, f[1] - cy, i * 150, i % 5) }); });
  deadTrees.forEach((d, i) => { if (camera.isVisible(d[0], d[1])) draws.push({ y: d[1], fn: () => drawDeadTree(ctx, d[0] - cx, d[1] - cy, i * 250) }); });
  crystals.forEach((c, i) => { if (camera.isVisible(c[0], c[1])) draws.push({ y: c[1], fn: () => drawCrystal(ctx, c[0] - cx, c[1] - cy) }); });

  // 山峰
  mountainPeaks.forEach(p => { if (camera.isVisible(p.x, p.y, 80)) draws.push({ y: p.y + p.size * 0.6, fn: () => drawMountainPeak(ctx, p.x - cx, p.y - cy, p.size, p.id, p.snow) }); });
  // 崖壁
  cliffWalls.forEach(c => { if (camera.isVisible(c.x, c.y, 60)) draws.push({ y: c.y + 8, fn: () => drawCliffWall(ctx, c.x - cx, c.y - cy, c.w, c.id) }); });
  // 庇护所和篝火（从游戏状态获取，AI建造后才有）
  const sp = gs.ai.shelterPos, cp = gs.ai.campfirePos;
  if (sp && camera.isVisible(sp.x, sp.y)) draws.push({ y: sp.y, fn: () => drawShelter(ctx, sp.x - cx, sp.y - cy) });
  if (cp && camera.isVisible(cp.x, cp.y)) draws.push({ y: cp.y, fn: () => drawCampfire(ctx, cp.x - cx, cp.y - cy) });

  // 动物
  rabbits.forEach(r => { if (!r.dead && camera.isVisible(r.x, r.y)) draws.push({ y: r.y, fn: () => { const hop = Math.abs(Math.sin(r.phase * 3)) * 5; drawRabbit(ctx, r.x - cx, r.y - cy, r.vx < 0 ? -1 : 1, hop); } }); });
  wolves.forEach(w => { if (!w.dead && camera.isVisible(w.x, w.y)) draws.push({ y: w.y, fn: () => { const tw = wobble(w.phase * 100, 5, 2); drawWolf(ctx, w.x - cx, w.y - cy, w.vx < 0 ? -1 : 1, tw); } }); });
  deers.forEach(d => { if (camera.isVisible(d.x, d.y)) draws.push({ y: d.y, fn: () => drawDeer(ctx, d.x - cx, d.y - cy, d.headY) }); });
  fishes.forEach(f => { if (camera.isVisible(f.x, f.y)) draws.push({ y: f.y, fn: () => { const fy = f.y + Math.sin(f.phase * 2) * 3; drawFish(ctx, f.x - cx, fy - cy, f.vx < 0 ? -1 : 1); } }); });
  foxes.forEach(f => { if (camera.isVisible(f.x, f.y)) draws.push({ y: f.y, fn: () => { const tw = wobble(f.phase * 80, 4, 1.5); drawFox(ctx, f.x - cx, f.y - cy, f.vx < 0 ? -1 : 1, tw); } }); });

  // AI 角色
  draws.push({ y: gs.ai.y + 20, fn: () => {
    drawAICharacter(ctx, gs.ai.x - cx, gs.ai.y - cy, gs.ai.expression);
    drawBubble(ctx, gs.ai.x - cx, gs.ai.y - cy, gs.ai.bubble);
  }});

  // 深度排序渲染
  draws.sort((a, b) => a.y - b.y);
  for (const d of draws) d.fn();

  drawUI();
  drawMinimap();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
