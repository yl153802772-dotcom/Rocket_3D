/**
 * DataCenter.ts
 * 作用：全局响应式数据中心（支持强类型、自动持久化同步、变更监听）
 */
import { SaveManager } from '../Core/SaveManager';
import { DataKey, DataPayloadMap } from '../Core/GameConst';
import { Logger } from '../Core/Logger';

// 监听器回调定义：接收新值和旧值
export type DataWatcher<K extends keyof DataPayloadMap> = (newValue: DataPayloadMap[K], oldValue: DataPayloadMap[K]) => void;

export class DataCenter {
    private static _instance: DataCenter = null;
    public static get Instance(): DataCenter {
        if (!this._instance) this._instance = new DataCenter();
        return this._instance;
    }

    // 内存中的数据字典
    private _data: Map<string, any> = new Map();

    // 监听器字典: Map<数据键名, 回调数组>
    private _watchers: Map<string, Function[]> = new Map();

    // 🔴 新增：批量更新标记
    private _isBatchUpdating: boolean = false;
    // 🔴 新增：批量更新期间收集的变化
    private _batchChanges: Array<{ key: string; newValue: any; oldValue: any }> = [];

    // ==========================================
    // 🌟 新增：多重暂停状态锁机制
    // ==========================================
    private _pauseLocks: Set<string> = new Set();


    // 🌟 新增：私有的图鉴 Set，用于内存极速查询
    private _codexSet: Set<string> = new Set();

    public init(): void {
        this.initDefault(DataKey.GOLD, 0);
        this.initDefault(DataKey.DIAMOND, 0);
        this.initDefault(DataKey.PLAYER_LEVEL, 1);
        this.initDefault(DataKey.IS_MUSIC_ON, true);
        this.initDefault(DataKey.SETTING_BGM, true);   // BGM默认开
        // 🌟 新增配置默认值
        this.initDefault(DataKey.IS_UI_SOUND_ON, true); // UI音效默认开
        this.initDefault(DataKey.SELECTED_BGM_INDEX, 0); // 默认选第0首BGM
        
        this.initDefault(DataKey.IN_MATCH_COIN, 0);

        this.initDefault(DataKey.CUR_LEVEL, 1);
        this.initDefault(DataKey.MAX_LEVEL, 1);
        // 🌟 核心修复：严格对齐设计文档，将基地血量从测试用的 100 回调至 20
        this.initDefault(DataKey.BASE_HP, 20);

        // 🌟 修复 1：补全漏网的默认值初始化，防止冷启动时状态丢失
        this.initDefault(DataKey.IS_GUIDE_COMPLETED, false);
        this.initDefault(DataKey.TIME_SCALE, 1.0);
        this.initDefault(DataKey.BASE_HP_LV, 1);

        // ==========================================
        // 🌟 [新增] P0级架构落地：注册持久化波次，默认从第 1 波开始
        // 此时会自动尝试从微信本地缓存 (wx.getStorageSync) 读取历史波次
        // ==========================================
        this.initDefault(DataKey.CURRENT_WAVE_PROGRESS, 1);

        // 🌟 [新增] 模块一：初始化最高解锁等级，默认值为 1，自动参与 SaveManager 本地存盘
        this.initDefault(DataKey.MAX_UNLOCKED_LEVEL, 1);
        // 🌟 [新增] 严格初始化：设置合成保护符默认值为 0 (或测试用的数量)
        this.initDefault(DataKey.MERGE_PROTECT_TICKET, 3); // 测试阶段默认给 3 个用于验证拦截

        // 🌟 初始化图鉴数据，如果为空则给个空数组
        this.initDefault(DataKey.UNLOCKED_CODEX, []);

        // 🌟【核心修复】补齐文明结晶及单局结算统计字段的默认值初始化，防止 .add() 报错
        this.initDefault(DataKey.CIV_CRYSTAL, 0);
        this.initDefault(DataKey.MATCH_SURVIVED_WAVE, 0);
        this.initDefault(DataKey.MATCH_KILL_COUNT, 0);
        this.initDefault(DataKey.MATCH_EXP_EARNED, 0);
        this.initDefault(DataKey.MATCH_CRYSTAL_EARNED, 0);
        this.initDefault(DataKey.LAST_ONLINE_TIMESTAMP, Date.now());

        this.initDefault(DataKey.CIV_TOTAL_EXP, 0); // 默认 0 经验
        this.initDefault(DataKey.CIV_LEVEL, 1);     // 默认 1 级

        this.initDefault(DataKey.ACCEL_EXPIRE_TIMESTAMP, 0); // 🌟 默认 0 表示未激活加速
        this.initDefault(DataKey.LAST_SHARE_DATE, "");
        this.initDefault(DataKey.DAILY_SHARE_COUNT, 0);
        this.initDefault(DataKey.LAST_MEDITATION_DATE, "");
        this.initDefault(DataKey.DAILY_MEDITATION_COUNT, 0);
        
        // 🌟 修复：科技树响应式数据池初始化（默认为空对象）
        this.initDefault(DataKey.CIV_TECH_DATA, {});

        // 🌟 [新增] 复活分享额度的初始化，无缝接入 SaveManager 本地存档
        this.initDefault(DataKey.LAST_REVIVE_SHARE_DATE, "");
        this.initDefault(DataKey.DAILY_REVIVE_SHARE_COUNT, 0);

        // 🌟 将读取到的数组转入内存 Set 中
        const savedCodex = this.get(DataKey.UNLOCKED_CODEX) as string[];
        if (savedCodex && Array.isArray(savedCodex)) {
            this._codexSet = new Set(savedCodex);
        }

        Logger.info("DataCenter 初始化完成 (强类型响应式数据已就绪)");
    }

    /**
     * 初始化默认值，并尝试从本地加载存档
     */
    private initDefault<K extends keyof DataPayloadMap>(key: K, defaultValue: DataPayloadMap[K]): void {
        const keyStr = key as string;
        const savedValue = SaveManager.Instance.get<DataPayloadMap[K]>(keyStr, defaultValue);
        this._data.set(keyStr, savedValue);
    }

    /**
     * 🟢 【获取数据】（O(1) 内存极速读取）
     */
    public get<K extends keyof DataPayloadMap>(key: K): DataPayloadMap[K] {
        return this._data.get(key as string);
    }

    /**
     * 🔴 【设置数据】（核心：改内存 + 自动存盘 + 自动广播更新）
     */
    public set<K extends keyof DataPayloadMap>(key: K, value: DataPayloadMap[K]): void {
        const keyStr = key as string;
        const oldValue = this._data.get(keyStr);

        if (oldValue === value) return;

        // 1. 更新内存
        this._data.set(keyStr, value);

        // 2. 同步到底层的加密存盘 (SaveManager 内部自带节流，不卡顿)
        SaveManager.Instance.set(keyStr, value);

        // 3. 🔴 修改：如果在批量更新中，只记录变化，不立即通知
        if (this._isBatchUpdating) {
            this._batchChanges.push({ key: keyStr, newValue: value, oldValue });
        } else {
            // 非批量模式，直接通知
            this.notifyByKeyRaw(keyStr, value, oldValue);
        }
    }

    /**
     * 增加/减少数值型数据
     */
    public add<K extends keyof DataPayloadMap>(key: K, delta: number): void {
        // 🌟 修复 3：使用 Number() 强制转换。如果是 undefined，则兜底为 0，防止吞金！
        const currentValue = Number(this.get(key)) || 0;

        if (!isNaN(currentValue)) {
            this.set(key, (currentValue + delta) as unknown as DataPayloadMap[K]);
        } else {
            Logger.error(`DataCenter.add 失败: [${key as string}] 数值计算异常！`);
        }
    }

    // 🔴 ==================== 新增：批量更新接口 ====================

    /**
     * 🔴 新增：批量更新数据（事务性操作）
     * 在一次操作中修改多个数据项，只在最后统一触发存盘和通知
     *
     * @param updates 更新列表
     * @example
     * DataCenter.Instance.batchUpdate([
     *     { key: DataKey.GOLD, value: 100 },
     *     { key: DataKey.DIAMOND, value: 50 },
     * ]);
     */
    public batchUpdate<K extends keyof DataPayloadMap>(
        updates: Array<{ key: K; value: DataPayloadMap[K] }>
    ): void {
        if (!updates || updates.length === 0) return;

        // 1. 开始批量模式
        this._isBatchUpdating = true;
        this._batchChanges = [];

        // 2. 逐项修改内存（不触发立即通知）
        for (const update of updates) {
            const keyStr = update.key as string;
            const oldValue = this._data.get(keyStr);

            // 如果值完全没变，跳过
            if (oldValue === update.value) continue;

            // 更新内存
            this._data.set(keyStr, update.value);

            // 同步到存盘
            SaveManager.Instance.set(keyStr, update.value);

            // 记录变化（稍后统一通知）
            this._batchChanges.push({
                key: keyStr,
                newValue: update.value,
                oldValue: oldValue,
            });
        }

        // 3. 结束批量模式
        this._isBatchUpdating = false;

        // 4. 🔴 修复：使用内部方法统一通知所有变化
        for (const change of this._batchChanges) {
            this.notifyByKeyRaw(change.key, change.newValue, change.oldValue);
        }

        // 5. 清空记录
        this._batchChanges = [];
    }

    /**
     * 🔴 新增：批量增加数值（批量add的语法糖）
     *
     * @param updates 增加列表
     * @example
     * DataCenter.Instance.batchAdd([
     *     { key: DataKey.GOLD, delta: 100 },
     *     { key: DataKey.DIAMOND, delta: -50 },
     * ]);
     */
    public batchAdd(
        updates: Array<{ key: keyof DataPayloadMap; delta: number }>
    ): void {
        const batchUpdates: Array<{ key: keyof DataPayloadMap; value: any }> = [];

        for (const update of updates) {
            // 🌟 修复 3：同理，增强批量操作的鲁棒性
            const currentValue = Number(this.get(update.key)) || 0;

            if (!isNaN(currentValue)) {
                batchUpdates.push({
                    key: update.key,
                    value: (currentValue + update.delta) as unknown as any,
                });
            } else {
                Logger.error(`DataCenter.batchAdd 失败: [${update.key as string}] 数值计算异常！`);
            }
        }

        if (batchUpdates.length > 0) {
            this.batchUpdate(batchUpdates);
        }
    }

    // 🔴 ==================== 以上为新增部分 ====================

    /**
     * 监听数据变化
     */
    public watch<K extends keyof DataPayloadMap>(key: K, callback: DataWatcher<K>): void {
        const keyStr = key as string;
        if (!this._watchers.has(keyStr)) {
            this._watchers.set(keyStr, []);
        }
        const list = this._watchers.get(keyStr)!;
        if (list.indexOf(callback) === -1) {
            list.push(callback);
        }
    }

    /**
     * 取消监听
     */
    public unwatch<K extends keyof DataPayloadMap>(key: K, callback: Function): void {
        const keyStr = key as string;
        if (this._watchers.has(keyStr)) {
            const list = this._watchers.get(keyStr)!;
            const index = list.indexOf(callback);
            if (index !== -1) {
                list.splice(index, 1);
            }
            // 🌟 架构级防漏：如果该数据键下已经没有任何监听者，彻底从字典中抹除该键
            if (list.length === 0) {
                this._watchers.delete(keyStr);
            }
        }
    }

    /**
     * 🔴 新增：内部方法，用原始字符串key执行广播
     * 这是实际执行通知的底层方法
     */
    private notifyByKeyRaw(keyStr: string, newValue: any, oldValue: any): void {
        if (this._watchers.has(keyStr)) {
            const list = this._watchers.get(keyStr)!;
            const copyList = [...list];
            for (let i = 0; i < copyList.length; i++) {
                copyList[i](newValue, oldValue);
            }
        }
    }

    /**
     * 🔴 修改：原有的泛型notify方法，改为调用新的内部方法
     */
    private notify<K extends keyof DataPayloadMap>(key: K, newValue: DataPayloadMap[K], oldValue: DataPayloadMap[K]): void {
        this.notifyByKeyRaw(key as string, newValue, oldValue);
    }

    public addPauseLock(lockName: string) {
        this._pauseLocks.add(lockName);
        this.set(DataKey.IS_PAUSED, true);
        Logger.info("DataCenter", `🔒 增加暂停锁 [${lockName}]。当前锁定源: ${Array.from(this._pauseLocks)}`);
    }

    public removePauseLock(lockName: string) {
        this._pauseLocks.delete(lockName);
        Logger.info("DataCenter", `🔓 移除暂停锁 [${lockName}]。当前锁定源: ${Array.from(this._pauseLocks)}`);

        // 🌟 核心：只有当所有锁都被清空时，游戏才真正解除暂停！
        if (this._pauseLocks.size === 0) {
            this.set(DataKey.IS_PAUSED, false);
        }
    }

    public hasPauseLock(lockName: string): boolean {
        return this._pauseLocks.has(lockName);
    }

    public clearAllPauseLocks() {
        this._pauseLocks.clear();
        this.set(DataKey.IS_PAUSED, false);
    }

    /**
     * 🌟 核心基建：查重并解锁图鉴 (高度泛用化)
     * @param tags 待检验的扁平化标签数组，例如 ["orb_1_2", "boss_5001"]
     * @returns 返回本次真正【新解锁】的标签数组。
     */
    public unlockCodexTags(tags: string[]): string[] {
        if (!tags || tags.length === 0) return [];

        const newlyUnlocked: string[] = [];

        for (const tag of tags) {
            if (!this._codexSet.has(tag)) {
                this._codexSet.add(tag);
                newlyUnlocked.push(tag);
            }
        }

        // 如果有任何实质性的新图鉴点亮，立刻同步回底层触发节流存盘
        if (newlyUnlocked.length > 0) {
            this.set(DataKey.UNLOCKED_CODEX, Array.from(this._codexSet));
            Logger.info("DataCenter", `📖 写入新图鉴并存盘: ${newlyUnlocked.join(', ')}`);
        }

        return newlyUnlocked;
    }
}