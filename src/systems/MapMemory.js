// AI 地图记忆系统
// AI 只记住视野范围内看到过的东西，走过的地方标记为"已探索"

import { logger } from './Logger.js';
import { RESOURCE_TYPES } from '../data/recipes.js';

export class MapMemory {
  constructor(worldWidth, worldHeight) {
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;

    // 探索网格（每32px一格，标记是否走过）
    this.gridSize = 32;
    this.gridCols = Math.ceil(worldWidth / this.gridSize);
    this.gridRows = Math.ceil(worldHeight / this.gridSize);
    this.explored = new Uint8Array(this.gridCols * this.gridRows); // 0=未探索, 1=已探索

    // 资源记忆 { key -> { type, x, y, depleted, lastSeenDay } }
    this.knownResources = new Map();

    // 危险记忆 { key -> { type, x, y, lastSeenDay, threat } }
    this.knownDangers = new Map();

    // 统计
    this.totalExplored = 0;
    this.exploredPercent = 0;
  }

  // 每帧调用：根据 AI 位置和视野更新记忆
  update(aiX, aiY, viewRange, worldObjects, currentDay) {
    // 标记 AI 周围为已探索
    this._markExplored(aiX, aiY, viewRange);

    // 扫描视野内的资源和动物，记入记忆
    this._scanResources(aiX, aiY, viewRange, worldObjects.resources, currentDay);
    this._scanDangers(aiX, aiY, viewRange, worldObjects, currentDay);
  }

  _markExplored(x, y, range) {
    const gx1 = Math.max(0, Math.floor((x - range) / this.gridSize));
    const gy1 = Math.max(0, Math.floor((y - range) / this.gridSize));
    const gx2 = Math.min(this.gridCols - 1, Math.floor((x + range) / this.gridSize));
    const gy2 = Math.min(this.gridRows - 1, Math.floor((y + range) / this.gridSize));

    for (let gy = gy1; gy <= gy2; gy++) {
      for (let gx = gx1; gx <= gx2; gx++) {
        const dist = Math.hypot((gx + 0.5) * this.gridSize - x, (gy + 0.5) * this.gridSize - y);
        if (dist <= range) {
          const idx = gy * this.gridCols + gx;
          if (!this.explored[idx]) {
            this.explored[idx] = 1;
            this.totalExplored++;
          }
        }
      }
    }
    this.exploredPercent = Math.round(this.totalExplored / (this.gridCols * this.gridRows) * 100);
  }

  _scanResources(aiX, aiY, range, resources, day) {
    for (const r of resources) {
      const dist = Math.hypot(r.x - aiX, r.y - aiY);
      if (dist > range) continue;

      const key = `${r.resourceType}_${Math.round(r.x)}_${Math.round(r.y)}`;
      const prev = this.knownResources.get(key);
      const entry = {
        type: r.resourceType,
        x: r.x,
        y: r.y,
        depleted: r.depleted,
        lastSeenDay: day,
      };

      if (!prev) {
        logger.info('记忆', `发现新资源: ${r.resourceType} (${Math.round(r.x)},${Math.round(r.y)})`, entry);
      } else if (prev.depleted !== r.depleted) {
        logger.info('记忆', `资源状态更新: ${r.resourceType} (${Math.round(r.x)},${Math.round(r.y)}) depleted=${r.depleted}`, entry);
      }

      this.knownResources.set(key, entry);
    }
  }

  _scanDangers(aiX, aiY, range, worldObjects, day) {
    const dangerous = [
      ...(worldObjects.wolves || []).filter(w => !w.dead).map(w => ({ type: 'wolf', x: w.x, y: w.y, threat: 'high' })),
    ];

    for (const d of dangerous) {
      const dist = Math.hypot(d.x - aiX, d.y - aiY);
      if (dist > range) continue;

      // 危险记忆用区域 key（不精确到像素，因为动物会移动）
      const areaKey = `${d.type}_${Math.round(d.x / 100)}_${Math.round(d.y / 100)}`;
      const prev = this.knownDangers.get(areaKey);

      if (!prev) {
        logger.info('记忆', `发现危险: ${d.type} 在 (${Math.round(d.x)},${Math.round(d.y)}) 附近`, d);
      }

      this.knownDangers.set(areaKey, {
        type: d.type,
        x: d.x,
        y: d.y,
        lastSeenDay: day,
        threat: d.threat,
      });
    }
  }

  // 同步所有已知资源的最新状态（不受视野限制）
  // 每帧调用，确保资源刷新/枯竭都能反映到记忆中
  syncResourceStates(resources) {
    for (const r of resources) {
      const key = `${r.resourceType}_${Math.round(r.x)}_${Math.round(r.y)}`;
      const entry = this.knownResources.get(key);
      if (entry && entry.depleted !== r.depleted) {
        entry.depleted = r.depleted;
        logger.info('记忆', `资源状态同步: ${r.resourceType} (${Math.round(r.x)},${Math.round(r.y)}) depleted=${r.depleted}`);
      }
    }
  }

  // 查询记忆中某类资源最近的未采空点
  findRememberedResource(resourceType, aiX, aiY) {
    let nearest = null, minDist = Infinity;
    for (const [, entry] of this.knownResources) {
      if (entry.type !== resourceType || entry.depleted) continue;
      const d = Math.hypot(entry.x - aiX, entry.y - aiY);
      if (d < minDist) { minDist = d; nearest = entry; }
    }
    return nearest;
  }

  // 查询某个方向是否探索过
  isDirectionExplored(aiX, aiY, angle, distance) {
    const tx = aiX + Math.cos(angle) * distance;
    const ty = aiY + Math.sin(angle) * distance;
    const gx = Math.floor(tx / this.gridSize);
    const gy = Math.floor(ty / this.gridSize);
    if (gx < 0 || gx >= this.gridCols || gy < 0 || gy >= this.gridRows) return false;
    return this.explored[gy * this.gridCols + gx] === 1;
  }

  // 找一个未探索的方向
  findUnexploredDirection(aiX, aiY) {
    const checkDist = 200;
    const dirs = [];
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      if (!this.isDirectionExplored(aiX, aiY, angle, checkDist)) {
        dirs.push(angle);
      }
    }
    if (dirs.length === 0) return null;
    return dirs[Math.floor(Math.random() * dirs.length)];
  }

  // 是否某区域附近有已知危险
  isDangerNear(x, y, range) {
    for (const [, d] of this.knownDangers) {
      if (Math.hypot(d.x - x, d.y - y) < range) return d;
    }
    return null;
  }

  // 导出记忆数据（用于存档和 LLM prompt）
  export() {
    return {
      exploredPercent: this.exploredPercent,
      knownResources: Array.from(this.knownResources.values()),
      knownDangers: Array.from(this.knownDangers.values()),
    };
  }

  // 生成 LLM 可用的记忆摘要（中文显示，绝对坐标）
  toPromptSummary(aiX, aiY) {
    const resources = Array.from(this.knownResources.values())
      .filter(r => !r.depleted)
      .sort((a, b) => Math.hypot(a.x - aiX, a.y - aiY) - Math.hypot(b.x - aiX, b.y - aiY))
      .map(r => {
        const dist = Math.round(Math.hypot(r.x - aiX, r.y - aiY));
        const typeInfo = RESOURCE_TYPES[r.type];
        const cn = typeInfo ? typeInfo.name : r.type;
        return `${cn}(${Math.round(r.x)},${Math.round(r.y)}) 距离${dist}`;
      });

    const dangerNameMap = { wolf: '狼', bear: '熊', snake: '蛇' };
    const dangers = Array.from(this.knownDangers.values())
      .map(d => `${dangerNameMap[d.type] || d.type}(${Math.round(d.x)},${Math.round(d.y)}) 第${d.lastSeenDay}天见过`);

    const unexplored = this.findUnexploredDirection(aiX, aiY);

    return {
      explored: `已探索${this.exploredPercent}%`,
      resources: resources.length > 0 ? resources.slice(0, 8) : ['记忆中没有可用资源'],
      dangers: dangers.length > 0 ? dangers : ['暂无已知危险'],
      unexploredHint: unexplored !== null ? '有未探索的方向' : '周围都探索过了',
    };
  }

  _directionName(fromX, fromY, toX, toY) {
    const angle = Math.atan2(toY - fromY, toX - fromX);
    const deg = ((angle * 180 / Math.PI) + 360) % 360;
    if (deg < 22.5 || deg >= 337.5) return '东';
    if (deg < 67.5) return '东南';
    if (deg < 112.5) return '南';
    if (deg < 157.5) return '西南';
    if (deg < 202.5) return '西';
    if (deg < 247.5) return '西北';
    if (deg < 292.5) return '北';
    return '东北';
  }
}
