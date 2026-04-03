// 游戏日志系统
// 关键信息输出到控制台+存储到内存，死亡时随存档一起导出

const LOG_LEVEL = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

class GameLogger {
  constructor() {
    this.logs = [];
    this.level = LOG_LEVEL.DEBUG;
    this.maxLogs = 2000;
  }

  _log(level, category, message, data) {
    const entry = {
      time: new Date().toISOString().slice(11, 23),
      level,
      category,
      message,
      data: data || null,
    };
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) this.logs.shift();

    // 控制台输出
    const prefix = `[${entry.time}][${category}]`;
    const style = {
      DEBUG: 'color:#999',
      INFO: 'color:#4a9',
      WARN: 'color:#da0',
      ERROR: 'color:#e44',
    };
    if (level === 'DEBUG' && this.level > LOG_LEVEL.DEBUG) return;
    console.log(`%c${prefix} ${message}`, style[level] || '', data || '');
  }

  debug(category, message, data) { this._log('DEBUG', category, message, data); }
  info(category, message, data) { this._log('INFO', category, message, data); }
  warn(category, message, data) { this._log('WARN', category, message, data); }
  error(category, message, data) { this._log('ERROR', category, message, data); }

  // 导出日志（随存档保存）
  export() {
    return this.logs.slice();
  }

  clear() {
    this.logs = [];
  }
}

// 全局单例
export const logger = new GameLogger();
