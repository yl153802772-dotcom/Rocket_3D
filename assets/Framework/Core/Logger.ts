/**
 * @module Logger
 * @description
 * [模块逻辑]
 * 全局日志管理器，提供分级（DEBUG/INFO/WARN/ERROR）、模块过滤（白名单/黑名单）、性能计时以及内存/微信线上日志的实时收集。
 *
 * [调用规则]
 * 1. 业务层禁止直接使用 console.log，必须通过 Logger 对应级别的方法输出。
 * 2. 输出时建议传入 LogModule 常量作为第一个参数，以便在控制台进行模块化过滤。
 * 3. Core Framework 层绝对禁止引入任何 Game 业务层的类或配置（如 EffectPresetManager）。
 */
import { sys } from 'cc';
import { PreloadManager } from "db://assets/Framework/Core/PreloadManager";

declare const wx: any;

// 日志级别枚举
export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
    SILENT = 4
}

interface DebugConfig {
    enabled: boolean;
    level: LogLevel;
    modules: Map<string, boolean>;
    showTimestamp: boolean;
    showMemory: boolean;
    performanceMarks: Map<string, number>;
}

export class Logger {
    private static _isDebug: boolean = true;
    private static _logLevel: LogLevel = LogLevel.DEBUG;

    private static _config: DebugConfig = {
        enabled: true,
        level: LogLevel.DEBUG,
        modules: new Map(),
        showTimestamp: true,
        showMemory: false,
        performanceMarks: new Map()
    };

    private static _enabledModules: Set<string> = new Set();
    private static _disabledModules: Set<string> = new Set();

    public static get isDebug(): boolean { return this._isDebug; }
    public static set isDebug(value: boolean) {
        this._isDebug = value;
        this._config.enabled = value;
    }

    public static setLogLevel(level: LogLevel): void {
        this._logLevel = level;
        this._config.level = level;
        console.log(`[Logger] 日志级别已设置为: ${LogLevel[level]}`);
    }

    public static getLogLevel(): LogLevel { return this._logLevel; }

    public static enableModule(moduleName: string): void {
        this._enabledModules.add(moduleName);
        this._disabledModules.delete(moduleName);
        this._config.modules.set(moduleName, true);
        console.log(`[Logger] 启用模块日志: ${moduleName}`);
    }

    public static disableModule(moduleName: string): void {
        this._disabledModules.add(moduleName);
        this._enabledModules.delete(moduleName);
        this._config.modules.set(moduleName, false);
        console.log(`[Logger] 禁用模块日志: ${moduleName}`);
    }

    public static enableAllModules(): void {
        this._enabledModules.clear();
        this._disabledModules.clear();
        console.log(`[Logger] 启用所有模块日志`);
    }

    public static showMemoryUsage(show: boolean): void { this._config.showMemory = show; }
    public static showTimestamp(show: boolean): void { this._config.showTimestamp = show; }

    private static getRealtimeLogger() {
        if (sys.platform === sys.Platform.WECHAT_GAME && typeof wx !== 'undefined') {
            return wx.getRealtimeLogManager ? wx.getRealtimeLogManager() : null;
        }
        return null;
    }

    private static getGameInfo(): string {
        if (sys.platform === sys.Platform.WECHAT_GAME && typeof wx !== 'undefined') {
            try {
                const performance = wx.getPerformance();
                const memory = performance?.memory;
                if (memory) {
                    const used = (memory.usedJSHeapSize / 1024 / 1024).toFixed(2);
                    const total = (memory.totalJSHeapSize / 1024 / 1024).toFixed(2);
                    const limit = (memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2);
                    return `[内存: ${used}/${total}MB, 上限: ${limit}MB]`;
                }
            } catch (e) {}
        }
        return '';
    }

    private static pad(num: number, len: number): string {
        let s = num.toString();
        while (s.length < len) s = '0' + s;
        return s;
    }

    private static formatPrefix(level: string, moduleName?: string): string {
        const parts: string[] = [];
        if (this._config.showTimestamp) {
            const now = new Date();
            const time = `${this.pad(now.getHours(), 2)}:${this.pad(now.getMinutes(), 2)}:${this.pad(now.getSeconds(), 2)}.${this.pad(now.getMilliseconds(), 3)}`;
            parts.push(`[${time}]`);
        }
        parts.push(level);
        if (moduleName) parts.push(`[${moduleName}]`);
        if (this._config.showMemory) {
            const memInfo = this.getGameInfo();
            if (memInfo) parts.push(memInfo);
        }
        return parts.join(' ');
    }

    private static shouldLogModule(moduleName?: string): boolean {
        if (!moduleName) return true;
        if (this._enabledModules.size > 0) return this._enabledModules.has(moduleName);
        if (this._disabledModules.size > 0) return !this._disabledModules.has(moduleName);
        return true;
    }

    public static debug(moduleName: string, ...args: any[]): void;
    public static debug(...args: any[]): void;
    public static debug(...args: any[]): void {
        if (!this._isDebug) return;
        if (this._logLevel > LogLevel.DEBUG) return;
        let moduleName: string | undefined;
        let logArgs: any[];
        if (typeof args[0] === 'string' && args.length > 1) {
            moduleName = args[0];
            logArgs = args.slice(1);
        } else {
            logArgs = args;
        }
        if (!this.shouldLogModule(moduleName)) return;
        const prefix = this.formatPrefix('🔍 [DEBUG]', moduleName);
        console.log(prefix, ...logArgs);
    }

    public static info(moduleName: string, ...args: any[]): void;
    public static info(...args: any[]): void;
    public static info(...args: any[]): void {
        if (!this._isDebug) return;
        if (this._logLevel > LogLevel.INFO) return;
        let moduleName: string | undefined;
        let logArgs: any[];
        if (typeof args[0] === 'string' && args.length > 1) {
            moduleName = args[0];
            logArgs = args.slice(1);
        } else {
            logArgs = args;
        }
        if (!this.shouldLogModule(moduleName)) return;
        const prefix = this.formatPrefix('🟢 [INFO]', moduleName);
        console.log(prefix, ...logArgs);
    }

    public static warn(moduleName: string, ...args: any[]): void;
    public static warn(...args: any[]): void;
    public static warn(...args: any[]): void {
        if (!this._isDebug) return;
        if (this._logLevel > LogLevel.WARN) return;
        let moduleName: string | undefined;
        let logArgs: any[];
        if (typeof args[0] === 'string' && args.length > 1) {
            moduleName = args[0];
            logArgs = args.slice(1);
        } else {
            logArgs = args;
        }
        if (!this.shouldLogModule(moduleName)) return;
        const prefix = this.formatPrefix('🟠 [WARN]', moduleName);
        console.warn(prefix, ...logArgs);
        const rtLogger = this.getRealtimeLogger();
        if (rtLogger) {
            try { rtLogger.warn(prefix, ...logArgs); } catch (e) {}
        }
    }

    public static error(moduleName: string, ...args: any[]): void;
    public static error(...args: any[]): void;
    public static error(...args: any[]): void {
        if (this._logLevel > LogLevel.ERROR) return;
        let moduleName: string | undefined;
        let logArgs: any[];
        if (typeof args[0] === 'string' && args.length > 1) {
            moduleName = args[0];
            logArgs = args.slice(1);
        } else {
            logArgs = args;
        }
        const prefix = this.formatPrefix('🔴 [ERROR]', moduleName);
        console.error(prefix, ...logArgs);
        const rtLogger = this.getRealtimeLogger();
        if (rtLogger) {
            try { rtLogger.error(prefix, ...logArgs); } catch (e) {}
        }
    }

    public static timeStart(label: string): void {
        if (!this._isDebug) return;
        this._config.performanceMarks.set(label, Date.now());
        this.debug('Performance', `⏱️ [计时开始] ${label}`);
    }

    public static timeEnd(label: string): void {
        if (!this._isDebug) return;
        const startTime = this._config.performanceMarks.get(label);
        if (startTime) {
            const duration = Date.now() - startTime;
            this._config.performanceMarks.delete(label);
            this.info('Performance', `⏱️ [计时结束] ${label}: ${duration}ms`);
        } else {
            this.warn('Performance', `⏱️ 未找到计时起点: ${label}`);
        }
    }

    public static logMemory(): void {
        if (!this._isDebug) return;
        const memInfo = this.getGameInfo();
        if (memInfo) {
            this.info('Memory', memInfo);
        } else {
            this.warn('Memory', '无法获取内存信息（非微信小游戏环境）');
        }
    }

    public static getDebugConfig(): DebugConfig {
        return { ...this._config };
    }

    public static configure(options: {
        enabled?: boolean;
        level?: LogLevel;
        showTimestamp?: boolean;
        showMemory?: boolean;
    }): void {
        if (options.enabled !== undefined) this._config.enabled = options.enabled;
        if (options.level !== undefined) this.setLogLevel(options.level);
        if (options.showTimestamp !== undefined) this._config.showTimestamp = options.showTimestamp;
        if (options.showMemory !== undefined) this._config.showMemory = options.showMemory;
        this.info('Logger', 'Debug 配置已更新', this._config);
    }

    public static listEnabledModules(): void {
        if (this._enabledModules.size > 0) {
            console.log('[Logger] 白名单模块:', Array.from(this._enabledModules));
        } else if (this._disabledModules.size > 0) {
            console.log('[Logger] 黑名单模块:', Array.from(this._disabledModules));
        } else {
            console.log('[Logger] 所有模块日志已启用');
        }
    }

    public static reset(): void {
        this._isDebug = true;
        this._logLevel = LogLevel.DEBUG;
        this._config = {
            enabled: true,
            level: LogLevel.DEBUG,
            modules: new Map(),
            showTimestamp: true,
            showMemory: false,
            performanceMarks: new Map()
        };
        this._enabledModules.clear();
        this._disabledModules.clear();
        this.info('Logger', '配置已重置');
    }
}

export const LogModule = {
    FRAMEWORK: 'Framework',
    RES_MANAGER: 'ResManager',
    UI_MANAGER: 'UIManager',
    PRELOAD: 'Preload',
    BATTLE: 'BattleUI',
    NETWORK: 'Network',
    AUDIO: 'Audio',
    DATA: 'DataCenter',
    EVENT: 'EventCenter',
    TIMER: 'TimerManager',
    POOL: 'GameObjectPool',
    ANIMATION: 'AnimationHelper',
    ModuleSystem: 'ModuleSystem',
    UIBase: 'UIBase',
    APP: 'App',
    AdManager: 'AdManager',
    ConfigManager: 'ConfigManager',
    GMManager: 'GMManager',
    LoadingUI: 'LoadingUI',
    MainMenuView: 'MainMenuView',
    MainMenuModule: 'MainMenuModule',
    MainMenuController: 'MainMenuController',
    PreloadManager: 'PreloadManager',
    EffectPresetManager: 'EffectPresetManager',
} as const;

export type LogModuleType = typeof LogModule[keyof typeof LogModule];