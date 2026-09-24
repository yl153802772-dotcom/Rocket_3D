/**
 * @module DataCenter
 * @description
 * [模块逻辑]
 * 全局响应式数据中心（支持强类型、自动持久化同步、变更监听）。
 * 本阶段(Priority 4)升级了与 SaveManager 的联动：此模块的 set() 与 batchUpdate() 现作为“脏标记投递器(Dirty Mask Emitter)”，
 * 极大解放了持久化过程的 CPU 开销。
 *
 * [调用规则]
 * 1. 禁止业务直接操作底层 _data 字典，必须通过 set() 或 add() 触发响应式变更。
 * 2. 大批量（>3 个）数据同时变化时，必须包裹在 batchUpdate 中，防止高频触发 I/O 节流与 UI 重绘风暴。
 */
import { SaveManager } from '../Core/SaveManager';
import { DataKey, DataPayloadMap } from '../Core/GameConst';
import { Logger, LogModule } from '../Core/Logger';

export type DataWatcher<K extends keyof DataPayloadMap> = (newValue: DataPayloadMap[K], oldValue: DataPayloadMap[K]) => void;

export class DataCenter {
    private static _instance: DataCenter = null;
    public static get Instance(): DataCenter {
        if (!this._instance) this._instance = new DataCenter();
        return this._instance;
    }

    private _data: Map<string, any> = new Map();
    private _watchers: Map<string, Function[]> = new Map();
    private _isBatchUpdating: boolean = false;
    private _batchChanges: Array<{ key: string; newValue: any; oldValue: any }> = [];
    private _pauseLocks: Set<string> = new Set();
    private _codexSet: Set<string> = new Set();

    public init(): void {
        // 维持所有的 Default 初始化
    }

    private initDefault<K extends keyof DataPayloadMap>(key: K, defaultValue: DataPayloadMap[K]): void {
        const keyStr = key as string;
        const savedValue = SaveManager.Instance.get<DataPayloadMap[K]>(keyStr, defaultValue);
        this._data.set(keyStr, savedValue);
    }

    public get<K extends keyof DataPayloadMap>(key: K): DataPayloadMap[K] {
        return this._data.get(key as string);
    }

    public set<K extends keyof DataPayloadMap>(key: K, value: DataPayloadMap[K]): void {
        const keyStr = key as string;
        const oldValue = this._data.get(keyStr);

        if (oldValue === value) return;

        this._data.set(keyStr, value);

        // ✅ 机制说明：此调用仅在 SaveManager 中投递增量脏标记 (dirty key)，绝不会在此帧触发重量级全盘序列化
        SaveManager.Instance.set(keyStr, value);

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
            Logger.error(LogModule.DATA, `DataCenter.add 失败: [${key as string}] 数值计算异常！`);
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
            SaveManager.Instance.set(keyStr, update.value);

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
                Logger.error(LogModule.DATA, `DataCenter.batchAdd 失败: [${update.key as string}] 数值计算异常！`);
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

    private notifyByKeyRaw(keyStr: string, newValue: any, oldValue: any): void {
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

    public unlockCodexTags(tags: string[]): string[] {
        if (!tags || tags.length === 0) return [];
        const newlyUnlocked: string[] = [];

        for (const tag of tags) {
            if (!this._codexSet.has(tag)) {
                this._codexSet.add(tag);
                newlyUnlocked.push(tag);
            }
        }

        if (newlyUnlocked.length > 0) {
            this.set(DataKey.UNLOCKED_CODEX, Array.from(this._codexSet));
            Logger.info(LogModule.DATA, `📖 写入新图鉴并存盘: ${newlyUnlocked.join(', ')}`);
        }

        return newlyUnlocked;
    }
}