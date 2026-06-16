// ==================== 统一日志系统 ====================
// 分级：fatal / error / warn / info
// - fatal: 致命错误，弹窗提示用户，记录 console.error
// - error: 严重错误，console.error，可选标记 UI 状态
// - warn:  警告，console.warn，不影响核心功能
// - info:  信息，console.log，正常操作日志
//
// 使用方式：
//   Logger.fatal('msg'[, err])
//   Logger.error('msg'[, err])
//   Logger.warn('msg'[, err])
//   Logger.info('msg'[, data])
//
// 所有日志保留在 App._logHistory（最近 200 条），方便调试

(function() {
  'use strict';

  var LEVELS = { FATAL: 0, ERROR: 1, WARN: 2, INFO: 3 };
  var LEVEL_LABELS = { 0: 'FATAL', 1: 'ERROR', 2: 'WARN', 3: 'INFO' };
  var MAX_HISTORY = 200;

  // 初始化日志历史
  if (!window.App) window.App = {};
  if (!App._logHistory) App._logHistory = [];

  function _record(level, message, err) {
    var entry = {
      level: LEVEL_LABELS[level],
      message: message,
      time: new Date().toISOString()
    };
    if (err) {
      if (err instanceof Error) {
        entry.errorName = err.name;
        entry.errorMessage = err.message;
        entry.errorStack = err.stack ? err.stack.split('\n').slice(0, 4).join('\n') : '';
      } else {
        entry.errorDetail = String(err);
      }
    }
    App._logHistory.push(entry);
    if (App._logHistory.length > MAX_HISTORY) {
      App._logHistory.shift();
    }
  }

  function _formatMsg(level, message) {
    var ts = new Date().toISOString().split('T')[1].slice(0, 8);
    return '[' + ts + '] [' + LEVEL_LABELS[level] + '] ' + message;
  }

  window.Logger = {
    // 致命错误：弹窗 + console.error
    fatal: function(message, err) {
      _record(LEVELS.FATAL, message, err);
      console.error(_formatMsg(LEVELS.FATAL, message), err || '');
      alert('\u26A0\uFE0F ' + message);
    },

    // 严重错误：console.error，不弹窗
    error: function(message, err) {
      _record(LEVELS.ERROR, message, err);
      console.error(_formatMsg(LEVELS.ERROR, message), err || '');
    },

    // 警告：console.warn
    warn: function(message, err) {
      _record(LEVELS.WARN, message, err);
      console.warn(_formatMsg(LEVELS.WARN, message), err || '');
    },

    // 信息：console.log
    info: function(message, data) {
      _record(LEVELS.INFO, message, data);
      console.log(_formatMsg(LEVELS.INFO, message), data !== undefined ? data : '');
    },

    // 获取最近 N 条日志（默认全部）
    getHistory: function(n) {
      var h = App._logHistory;
      if (n === undefined) return h.slice();
      return h.slice(-n);
    },

    // 清除历史
    clearHistory: function() {
      App._logHistory = [];
    }
  };
})();
