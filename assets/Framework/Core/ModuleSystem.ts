/**
 * @module ModuleSystem
 * @description
 * [模块逻辑]
 * 游戏通用模块管理器。负责管理所有游戏模块的注册、初始化、启动生命周期以及每帧 Update 心跳的统一分发。
 *
 * [调用规则]
 * 1. 作为纯架构层，禁止写死对任何特定模块（如 MainMenuModule、BattleLoopModule）的依赖，必须由外部（如 GameEntry）主动 register。
 * 2. 外部应废除游离的 Component.update 双轨更新，统一注册为 IModule 由本类的 update 驱动。
 * 3. 必须成对维护生命周期，调用 destroy() 时应负责清空自身引用。
 */
import { Logger, LogModule } from "db://assets/Framework/Core/Logger";

export interface IModule {
    init(): void;
    start(): void | Promise<void>;
    update?(dt: number): void;
    destroy(): void;
}

export class ModuleSystem {

    private _modules: Map<string, IModule> = new Map();
    private _moduleList: IModule[] = [];
    private _startedModules: Set<IModule> = new Set();

    private _isStarted: boolean = false;

    public init(): void {
        Logger.info(LogModule.ModuleSystem, "ModuleSystem 初始化");
    }

    public register(name: string, module: IModule): void {

        if (this._modules.has(name)) {
            console.warn(`模块已存在: ${name}`);
            return;
        }

        this._modules.set(name, module);
        this._moduleList.push(module);

        module.init();
    }

    public async start(): Promise<void> {
        if (this._isStarted) return;

        for (const module of this._moduleList) {
            if (this._startedModules.has(module)) continue;

            await module.start();
            this._startedModules.add(module);
        }

        this._isStarted = true;
    }

    public update(dt: number): void {
        for (const module of this._moduleList) {
            module.update?.(dt);
        }
    }

    public getModule<T extends IModule>(name: string): T {
        return this._modules.get(name) as T;
    }

    public destroy(): void {
        for (const module of this._moduleList) {
            module.destroy();
        }

        this._modules.clear();
        this._moduleList.length = 0;
        this._startedModules.clear();
        this._isStarted = false;
    }
}