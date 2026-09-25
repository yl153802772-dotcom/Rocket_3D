/**
 * @module DataCenter
 * @description
 * [模块逻辑]
 * 数据中心分层治理模块。本次重构（Priority 13）彻底拆分了持久化数据与运行时状态。
 * 解决了单局临时状态（如暂停锁、时间倍速）误入存档导致的 I/O 浪费与重启状态污染问题。
 * 已完全对齐最新净化的 GameConst 强类型字典。
 *
 * [调用规则]
 * 1. 资产/等级/设置等需要跨局保存的数据，调用 ArchiveDataCenter。
 * 2. 暂停锁/时间缩放/单局标记等，调用 RuntimeDataCenter。
 * 3. 场景切换或单局结束时，统一调用 RuntimeDataCenter.Instance.clearSession() 一键清理。
 */

import { SaveManager } from '../Core/SaveManager';
import { DataKey, DataPayloadMap } from '../Core/GameConst';
import { Logger, LogModule } from '../Core/Logger';

export type DataWatcher<K extends keyof DataPayloadMap> = (newValue: DataPayloadMap[K], oldValue: DataPayloadMap[K]) => void;

/**
 * ==========================================
 * 基类：BaseDataCenter (纯内存响应式数据驱动)
 * ==========================================
 */
export abstract class BaseDataCenter {
    protected _data: Map<string, any> = new Map();
    protected _watchers: Map<string, Function[]> = new Map();
    protected _isBatchUpdating: boolean = false;
    protected _batchChanges: Array<{ key: string; newValue: any; oldValue: any }> = [];

    public get<K extends keyof DataPayloadMap>(key: K): DataPayloadMap[K] {
        return this._data.get(key as string);
    }

    public set<K extends keyof DataPayloadMap>(key: K, value: DataPayloadMap[K]): void {
        const keyStr = key as string;
        const oldValue = this._data.get(keyStr);

        if (oldValue === value) return;

        this._data.set(keyStr, value);

        // 钩子：供子类决定是否需要落盘
        this.onDataChanged(keyStr, value);

        if (this._isBatchUpdating) {
            this._batchChanges.push({ key: keyStr, newValue: value, oldValue });
        } else {
            this.notifyByKeyRaw(keyStr, value, oldValue);
        }
    }

    public add<K extends keyof DataPayloadMap>(key: K, delta: number): void {
        const currentValue = Number(this.get(key)) || 0;
        if (!isNaN(currentValue)) {
            this.set(key, (currentValue + delta) as unknown as DataPayloadMap[K]);
        } else {
            Logger.error(LogModule.DATA, `BaseDataCenter.add 失败: [${key as string}] 数值计算异常！`);
        }
    }

    public batchUpdate<K extends keyof DataPayloadMap>(updates: Array<{ key: K; value: DataPayloadMap[K] }>): void {
        if (!updates || updates.length === 0) return;

        this._isBatchUpdating = true;
        this._batchChanges = [];

        for (const update of updates) {
            const keyStr = update.key as string;
            const oldValue = this._data.get(keyStr);

            if (oldValue === update.value) continue;

            this._data.set(keyStr, update.value);
            this.onDataChanged(keyStr, update.value);

            this._batchChanges.push({
                key: keyStr,
                newValue: update.value,
                oldValue: oldValue,
            });
        }

        this._isBatchUpdating = false;

        for (const change of this._batchChanges) {
            this.notifyByKeyRaw(change.key, change.newValue, change.oldValue);
        }
        this._batchChanges = [];
    }

    public batchAdd(updates: Array<{ key: keyof DataPayloadMap; delta: number }>): void {
        const batchUpdates: Array<{ key: keyof DataPayloadMap; value: any }> = [];
        for (const update of updates) {
            const currentValue = Number(this.get(update.key)) || 0;
            if (!isNaN(currentValue)) {
                batchUpdates.push({
                    key: update.key,
                    value: (currentValue + update.delta) as unknown as any,
                });
            } else {
                Logger.error(LogModule.DATA, `BaseDataCenter.batchAdd 失败: [${update.key as string}] 数值计算异常！`);
            }
        }
        if (batchUpdates.length > 0) this.batchUpdate(batchUpdates);
    }

    public watch<K extends keyof DataPayloadMap>(key: K, callback: DataWatcher<K>): void {
        const keyStr = key as string;
        if (!this._watchers.has(keyStr)) this._watchers.set(keyStr, []);
        const list = this._watchers.get(keyStr)!;
        if (list.indexOf(callback) === -1) list.push(callback);
    }

    public unwatch<K extends keyof DataPayloadMap>(key: K, callback: Function): void {
        const keyStr = key as string;
        if (this._watchers.has(keyStr)) {
            const list = this._watchers.get(keyStr)!;
            const index = list.indexOf(callback);
            if (index !== -1) list.splice(index, 1);
            if (list.length === 0) this._watchers.delete(keyStr);
        }
    }

    protected notifyByKeyRaw(keyStr: string, newValue: any, oldValue: any): void {
        if (this._watchers.has(keyStr)) {
            const list = this._watchers.get(keyStr)!;
            const copyList = [...list];
            for (let i = 0; i < copyList.length; i++) {
                try {
                    copyList[i](newValue, oldValue);
                } catch (e) {
                    Logger.error(LogModule.DATA, `[DataCenter] Watcher 执行异常阻断: Key [${keyStr}]`, e);
                }
            }
        }
    }

    // 由子类实现具体的变更联动行为
    protected abstract onDataChanged(key: string, value: any): void;
}


/**
 * ==========================================
 * 存档层：ArchiveDataCenter (严格落盘)
 * ==========================================
 */
export class ArchiveDataCenter extends BaseDataCenter {
    private static _instance: ArchiveDataCenter = null;
    public static get Instance(): ArchiveDataCenter {
        if (!this._instance) this._instance = new ArchiveDataCenter();
        return this._instance;
    }

    public init(): void {
        Logger.info(LogModule.DATA, "ArchiveDataCenter 初始化 (持久化状态中心)");
    }

    public initDefault<K extends keyof DataPayloadMap>(key: K, defaultValue: DataPayloadMap[K]): void {
        const keyStr = key as string;
        const savedValue = SaveManager.Instance.get<DataPayloadMap[K]>(keyStr, defaultValue);
        this._data.set(keyStr, savedValue);
    }

    protected onDataChanged(key: string, value: any): void {
        // ✅ 核心隔离：只有存入 ArchiveDataCenter 的数据，才会投递给 SaveManager 触发落盘脏标记
        SaveManager.Instance.set(key, value);
    }
}


/**
 * ==========================================
 * 运行时层：RuntimeDataCenter (纯内存隔离)
 * ==========================================
 */
export class RuntimeDataCenter extends BaseDataCenter {
    private static _instance: RuntimeDataCenter = null;
    public static get Instance(): RuntimeDataCenter {
        if (!this._instance) this._instance = new RuntimeDataCenter();
        return this._instance;
    }

    private _pauseLocks: Set<string> = new Set();

    public init(): void {
        Logger.info(LogModule.DATA, "RuntimeDataCenter 初始化 (纯内存临时状态中心)");
    }

    protected onDataChanged(key: string, value: any): void {
        // ✅ 核心隔离：运行时数据绝对不触发 SaveManager 写盘，纯内存极速响应
    }

    /** 战术暂停锁属于严格的单局运行时状态 */
    public addPauseLock(lockName: string) {
        this._pauseLocks.add(lockName);
        this.set(DataKey.IS_PAUSED, true);
    }

    public removePauseLock(lockName: string) {
        this._pauseLocks.delete(lockName);
        if (this._pauseLocks.size === 0) this.set(DataKey.IS_PAUSED, false);
    }

    public hasPauseLock(lockName: string): boolean {
        return this._pauseLocks.has(lockName);
    }

    public clearAllPauseLocks() {
        this._pauseLocks.clear();
        this.set(DataKey.IS_PAUSED, false);
    }

    /**
     * ✅ 单局重置熔断：切场景或战斗结束时调用，一键清空所有单局临时状态，防止污染下一局
     */
    public clearSession(): void {
        this._data.clear();
        this.clearAllPauseLocks();
        // 重置时间缩放等运行态数据
        this.set(DataKey.TIME_SCALE, 1.0);
        Logger.info(LogModule.DATA, "🧹 RuntimeDataCenter 单局状态已完全清空");
    }
}

// ⚠️ 向后兼容导出（建议业务层代码后续逐步替换引入类型，当前可无缝平替）
export { ArchiveDataCenter as DataCenter };