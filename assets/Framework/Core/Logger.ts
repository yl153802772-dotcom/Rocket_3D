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
declare const wx: any;

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
    }

    public static disableModule(moduleName: string): void {
        this._disabledModules.add(moduleName);
        this._enabledModules.delete(moduleName);
        this._config.modules.set(moduleName, false);
    }

    public static enableAllModules(): void {
        this._enabledModules.clear();
        this._disabledModules.clear();
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
        if (!this._isDebug || this._logLevel > LogLevel.DEBUG) return;
        let moduleName: string | undefined;
        let logArgs: any[] = args;
        if (typeof args[0] === 'string' && args.length > 1) { moduleName = args[0]; logArgs = args.slice(1); }
        if (!this.shouldLogModule(moduleName)) return;
        console.log(this.formatPrefix('🔍 [DEBUG]', moduleName), ...logArgs);
    }

    public static info(moduleName: string, ...args: any[]): void;
    public static info(...args: any[]): void;
    public static info(...args: any[]): void {
        if (!this._isDebug || this._logLevel > LogLevel.INFO) return;
        let moduleName: string | undefined;
        let logArgs: any[] = args;
        if (typeof args[0] === 'string' && args.length > 1) { moduleName = args[0]; logArgs = args.slice(1); }
        if (!this.shouldLogModule(moduleName)) return;
        console.log(this.formatPrefix('🟢 [INFO]', moduleName), ...logArgs);
    }

    public static warn(moduleName: string, ...args: any[]): void;
    public static warn(...args: any[]): void;
    public static warn(...args: any[]): void {
        if (!this._isDebug || this._logLevel > LogLevel.WARN) return;
        let moduleName: string | undefined;
        let logArgs: any[] = args;
        if (typeof args[0] === 'string' && args.length > 1) { moduleName = args[0]; logArgs = args.slice(1); }
        if (!this.shouldLogModule(moduleName)) return;
        const prefix = this.formatPrefix('🟠 [WARN]', moduleName);
        console.warn(prefix, ...logArgs);
        const rtLogger = this.getRealtimeLogger();
        if (rtLogger) { try { rtLogger.warn(prefix, ...logArgs); } catch (e) {} }
    }

    public static error(moduleName: string, ...args: any[]): void;
    public static error(...args: any[]): void;
    public static error(...args: any[]): void {
        if (this._logLevel > LogLevel.ERROR) return;
        let moduleName: string | undefined;
        let logArgs: any[] = args;
        if (typeof args[0] === 'string' && args.length > 1) { moduleName = args[0]; logArgs = args.slice(1); }
        const prefix = this.formatPrefix('🔴 [ERROR]', moduleName);
        console.error(prefix, ...logArgs);
        const rtLogger = this.getRealtimeLogger();
        if (rtLogger) { try { rtLogger.error(prefix, ...logArgs); } catch (e) {} }
    }
}

// ✅ 核心重构：仅保留 Core 层基础设施的枚举标识，业务层（Game）标识全部剔除
export const LogModule = {
    FRAMEWORK: 'Framework',
    RES_MANAGER: 'ResManager',
    UI_MANAGER: 'UIManager',
    PRELOAD: 'PreloadManager',
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
    GMManager: 'GMManager'
} as const;

export type LogModuleType = typeof LogModule[keyof typeof LogModule];