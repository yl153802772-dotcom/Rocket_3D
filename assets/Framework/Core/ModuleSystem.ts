/**
 * @module ModuleSystem
 * @description
 * [模块逻辑]
 * 游戏通用模块管理器。本次重构全面升级为标准的 ILifecycle 契约与优先级排序队列。
 *
 * [调用规则]
 * 1. 业务系统（如战斗循环、定时器管线）均需实现 ILifecycleModule。
 * 2. ModuleSystem 在 register 时会根据 priority 从大到小排序，确保每帧 Update 的执行时序安全（如 TimerManager 永远先于战斗系统执行）。
 */
import { Logger, LogModule } from "db://assets/Framework/Core/Logger";

export interface ILifecycleModule {
    priority?: number; // 优先级，数值越大越早执行 update
    init?(): void | Promise<void>;
    start?(): void | Promise<void>;
    update?(dt: number): void;
    dispose?(): void;
}

export class ModuleSystem {
    private _modules: Map<string, ILifecycleModule> = new Map();
    private _moduleList: ILifecycleModule[] = [];
    private _startedModules: Set<ILifecycleModule> = new Set();

    private _isStarted: boolean = false;

    public init(): void {
        Logger.info(LogModule.ModuleSystem, "ModuleSystem 初始化 (标准化 ILifecycle 契约)");
    }

    public register(name: string, module: ILifecycleModule): void {
        if (this._modules.has(name)) {
            console.warn(`模块已存在: ${name}`);
            return;
        }

        this._modules.set(name, module);
        this._moduleList.push(module);

        // 核心重构：按照优先级从大到小排序，确保帧循环时序稳定
        this._moduleList.sort((a, b) => (b.priority || 0) - (a.priority || 0));

        if (module.init) module.init();
    }

    public async start(): Promise<void> {
        if (this._isStarted) return;

        for (const module of this._moduleList) {
            if (this._startedModules.has(module)) continue;

            if (module.start) await module.start();
            this._startedModules.add(module);
        }

        this._isStarted = true;
    }

    public update(dt: number): void {
        for (const module of this._moduleList) {
            if (module.update) module.update(dt);
        }
    }

    public getModule<T extends ILifecycleModule>(name: string): T {
        return this._modules.get(name) as T;
    }

    public dispose(): void {
        for (const module of this._moduleList) {
            if (module.dispose) module.dispose();
        }

        this._modules.clear();
        this._moduleList.length = 0;
        this._startedModules.clear();
        this._isStarted = false;
    }
}