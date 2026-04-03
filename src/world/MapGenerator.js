// 地图生成器
// 静态大地图：纸张+网格+贝塞尔曲线地形色块
// 出生点在中心，8个方向都有地形覆盖

import { COLORS } from '../render/SketchTools.js';

function seededRandom(seed) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

// 地形模板：出生点在(1600,1200)中心位置，8个方向铺满
const BASE_TERRAIN_ZONES = [
  // ===== 安全区（中心） =====
  // 草地（出生点四周大片）
  { type:'grass', zone:'safe', color:COLORS.GRASS,
    points:[[1200,900],[1500,850],[1800,900],[2000,1050],[2000,1350],[1800,1500],[1500,1550],[1200,1500],[1050,1350],[1050,1050]] },
  // 花田（东南方向）
  { type:'flower', zone:'safe', color:COLORS.FLOWER,
    points:[[1900,1350],[2100,1300],[2250,1400],[2300,1550],[2150,1650],[1950,1650],[1850,1550]] },

  // ===== 近区：森林（北、西、东南） =====
  // 森林1（北方）
  { type:'forest', zone:'near', color:COLORS.FOREST,
    points:[[1100,400],[1400,300],[1700,350],[1950,500],[1850,700],[1500,750],[1200,700],[1000,550]] },
  // 森林2（西方）
  { type:'forest', zone:'near', color:COLORS.FOREST_LIGHT,
    points:[[400,900],[650,800],[850,900],[900,1100],[850,1300],[650,1400],[400,1350],[250,1200],[250,1000]] },
  // 森林3（东南方）
  { type:'forest', zone:'near', color:'rgba(100,160,80,0.2)',
    points:[[2100,1500],[2350,1450],[2500,1600],[2500,1800],[2350,1900],[2100,1850],[1950,1700]] },
  // 沙地（南方河岸）
  { type:'sand', zone:'near', color:COLORS.SAND,
    points:[[1100,1700],[1400,1650],[1700,1700],[1800,1800],[1600,1850],[1300,1850],[1050,1800]] },

  // ===== 近区：水域 =====
  // 河流（从西北蜿蜒到东南）
  { type:'water', zone:'near', color:COLORS.WATER,
    river:[[600,200],[750,500],[900,800],[1100,1050],[1300,1200],[1500,1350],[1700,1550],[1900,1800],[2100,2050],[2300,2200]],
    width:55 },
  // 湖泊（北方森林中）
  { type:'water', zone:'near', color:COLORS.WATER, ellipse:[1500,550,75,45,-0.15] },
  // 小池塘（西方）
  { type:'water', zone:'near', color:COLORS.WATER, ellipse:[550,1150,45,30,0.2] },

  // ===== 中区：山地（东北、西南） =====
  // 山地1（东北方）
  { type:'mountain', zone:'mid', color:COLORS.MOUNTAIN,
    points:[[2200,200],[2500,150],[2800,250],[3000,500],[2900,750],[2600,800],[2300,700],[2100,500],[2100,300]] },
  // 山地2（西南方）
  { type:'mountain', zone:'mid', color:COLORS.MOUNTAIN_DARK,
    points:[[200,1600],[450,1550],[700,1650],[800,1850],[700,2050],[450,2100],[200,2000],[100,1800]] },
  // 山地3（正南远处）
  { type:'mountain', zone:'mid', color:'rgba(180,140,90,0.13)',
    points:[[1200,2050],[1500,2000],[1800,2100],[1900,2250],[1700,2350],[1400,2400],[1100,2300],[1050,2150]] },

  // ===== 远区：沼泽（西北）、雪地（东北角） =====
  // 沼泽
  { type:'swamp', zone:'far', color:COLORS.SWAMP,
    points:[[200,400],[450,300],[700,400],[800,600],[700,800],[450,850],[200,750],[100,600]] },
  // 雪地
  { type:'snow', zone:'far', color:COLORS.SNOW,
    points:[[2700,0],[3000,0],[3200,0],[3200,350],[3050,500],[2800,450],[2650,300],[2600,100]] },
  // 雪地2（西北角）
  { type:'snow', zone:'far', color:'rgba(200,210,225,0.15)',
    points:[[0,0],[300,0],[400,150],[350,350],[200,400],[0,350]] },
];

export class MapGenerator {
  constructor(seed = Date.now()) {
    this.seed = seed;
    this.rand = seededRandom(seed);
    this.width = 3200;
    this.height = 2400;
    this.spawnX = 1600;
    this.spawnY = 1200;
    this.bgCanvas = null;
    this.zones = [];
  }

  generate() {
    this._buildZones();
    this._renderBackground();
    return this;
  }

  _buildZones() {
    const jitter = 60;
    this.zones = BASE_TERRAIN_ZONES.map(tmpl => {
      const zone = { ...tmpl };
      if (zone.points) {
        zone.points = zone.points.map(([x, y]) => [
          x + (this.rand() - 0.5) * jitter,
          y + (this.rand() - 0.5) * jitter
        ]);
      }
      if (zone.river) {
        zone.river = zone.river.map(([x, y]) => [
          x + (this.rand() - 0.5) * jitter * 0.5,
          y + (this.rand() - 0.5) * jitter * 0.3
        ]);
      }
      if (zone.ellipse) {
        zone.ellipse = [
          zone.ellipse[0] + (this.rand() - 0.5) * jitter,
          zone.ellipse[1] + (this.rand() - 0.5) * jitter,
          zone.ellipse[2], zone.ellipse[3], zone.ellipse[4]
        ];
      }
      return zone;
    });
  }

  _renderBackground() {
    const W = this.width, H = this.height;
    const oc = document.createElement('canvas');
    oc.width = W; oc.height = H;
    const ox = oc.getContext('2d');

    // 纸张
    ox.fillStyle = COLORS.PAPER;
    ox.fillRect(0, 0, W, H);

    // 噪点
    const nr = seededRandom(this.seed + 777);
    for (let i = 0; i < 15000; i++) {
      ox.fillStyle = `rgba(0,0,0,${nr() * 0.02})`;
      ox.fillRect(nr() * W, nr() * H, 1, 1);
    }

    // 网格
    ox.strokeStyle = COLORS.PAPER_LINE; ox.lineWidth = 0.5;
    for (let x = 0; x < W; x += 32) { ox.beginPath(); ox.moveTo(x, 0); ox.lineTo(x, H); ox.stroke(); }
    for (let y = 0; y < H; y += 32) { ox.beginPath(); ox.moveTo(0, y); ox.lineTo(W, y); ox.stroke(); }

    // 地形色块
    for (const zone of this.zones) {
      ox.fillStyle = zone.color;

      if (zone.ellipse) {
        const [cx, cy, rx, ry, rot] = zone.ellipse;
        ox.beginPath(); ox.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2); ox.fill();
      } else if (zone.river) {
        const pts = zone.river, hw = zone.width / 2;
        ox.beginPath();
        ox.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) {
          const p = pts[i - 1], c = pts[i];
          ox.quadraticCurveTo(p[0], p[1], (p[0] + c[0]) / 2, (p[1] + c[1]) / 2);
        }
        ox.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
        // 回程
        for (let i = pts.length - 1; i >= 0; i--) {
          ox.lineTo(pts[i][0] + hw, pts[i][1]);
        }
        ox.closePath(); ox.fill();
      } else if (zone.points) {
        const pts = zone.points;
        ox.beginPath();
        ox.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) {
          const p = pts[i - 1], c = pts[i];
          ox.quadraticCurveTo(p[0], p[1], (p[0] + c[0]) / 2, (p[1] + c[1]) / 2);
        }
        // 闭合回到起点
        const last = pts[pts.length - 1], first = pts[0];
        ox.quadraticCurveTo(last[0], last[1], (last[0] + first[0]) / 2, (last[1] + first[1]) / 2);
        ox.closePath(); ox.fill();
      }
    }

    // 区域标注
    ox.fillStyle = COLORS.INK_L; ox.font = 'italic 14px Georgia,serif';
    ox.fillText('~ 安全草地 ~', 1450, 1200);
    ox.fillText('~ 花田 ~', 2050, 1480);
    ox.fillText('~ 森林 ~', 1400, 520);
    ox.fillText('~ 森林 ~', 520, 1080);
    ox.fillText('~ 森林 ~', 2250, 1680);
    ox.fillText('~ 山地 ~', 2500, 480);
    ox.fillText('~ 山地 ~', 420, 1800);
    ox.fillText('~ 山地 ~', 1450, 2180);
    ox.fillText('~ 沼泽 ~', 420, 580);
    ox.fillText('~ 雪地 ~', 2850, 220);
    ox.fillText('~ 雪地 ~', 120, 160);
    ox.fillText('~ 沙地 ~', 1380, 1750);
    ox.save(); ox.translate(1050, 900); ox.rotate(Math.PI * 0.3); ox.fillText('~ 河流 ~', 0, 0); ox.restore();

    this.bgCanvas = oc;
  }

  getZoneAt(wx, wy) {
    const dist = Math.hypot(wx - this.spawnX, wy - this.spawnY);
    if (dist < 250) return 'safe';
    if (dist < 600) return 'near';
    if (dist < 1000) return 'mid';
    return 'far';
  }
}
