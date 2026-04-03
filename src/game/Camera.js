// 平滑跟随相机

export class Camera {
  constructor(viewWidth, viewHeight, worldWidth, worldHeight) {
    this.x = 0;
    this.y = 0;
    this.vw = viewWidth;
    this.vh = viewHeight;
    this.ww = worldWidth;
    this.wh = worldHeight;
    this.smoothing = 0.06;
  }

  follow(targetX, targetY) {
    const tx = Math.max(0, Math.min(this.ww - this.vw, targetX - this.vw / 2));
    const ty = Math.max(0, Math.min(this.wh - this.vh, targetY - this.vh / 2));
    this.x += (tx - this.x) * this.smoothing;
    this.y += (ty - this.y) * this.smoothing;
  }

  // 世界坐标 → 屏幕坐标
  toScreen(wx, wy) {
    return { x: wx - this.x, y: wy - this.y };
  }

  // 是否在视口内（带margin）
  isVisible(wx, wy, margin = 50) {
    return wx - this.x > -margin && wx - this.x < this.vw + margin &&
           wy - this.y > -margin && wy - this.y < this.vh + margin;
  }
}
