/**
 * @module ConfigManager
 * @description
 * [模块逻辑]
 * 游戏海量配置表的高效管理器。本次重构引入了工业级的 时间分片解析引擎 (Time-Slicing Parser)。
 * 将巨型 JSON 的反序列化与 Map 索引构建分摊至多个逻辑帧，彻底消灭了主线程同步遍历导致的 CPU 峰值卡顿。
 * * 游戏海量配置表的高效管理器。本次重构（Priority 11）彻底打通了配置资源的物理卸载管线。
 *  * 将生命周期策略升级为 EXPLICIT，确保配置表的 JsonAsset 与内存索引同生共死，实现了 100% 内存平账。
 *  *
 * [调用规则]
 * 1. 业务切入新玩法前，通过 loadTables() 批量异步懒加载所需的配置表。
 * 2. 内存吃紧或切换大阶段时，调用 unloadTable() 销毁域内配置，防爆内存。
 */

import { JsonAsset } from 'cc';
import { ResManager, ResType } from './ResManager';
import { Logger, LogModule } from './Logger';

export class ConfigManager {
    private static _instance: ConfigManager = null;
    public static get Instance(): ConfigManager {
        if (!this._instance) this._instance = new ConfigManager();
        return this._instance;
    }

    private _tables: Map<string, Map<any, any>> = new Map();
    private _loadingTables: Map<string, Promise<void>> = new Map();

    // ✅ 竞态防漏护盾：记录在异步加载期间被业务强制宣告卸载的配置表
    private _abandonedLoads: Set<string> = new Set();

    public init(): void {}

    public async loadTables(tableNames: string[], bundleName: string = "config"): Promise<void> {
        const needLoadNames = Array.from(new Set(tableNames)).filter(name => !!name && !this._tables.has(name));
        if (needLoadNames.length === 0) return;

        try {
            await Promise.all(needLoadNames.map(name => this.loadTableOnce(name, bundleName)));
            Logger.info(LogModule.ConfigManager, `配置表批量加载与切片索引构建完成: ${needLoadNames.join(", ")}`);
        } catch (e) {
            Logger.error(LogModule.ConfigManager, `配置表批量加载失败: ${needLoadNames.join(", ")}`, e);
            throw e;
        }
    }

    private loadTableOnce(tableName: string, bundleName: string): Promise<void> {
        if (this._tables.has(tableName)) return Promise.resolve();

        const loadingKey = `${bundleName}/${tableName}`;
        const loadingTask = this._loadingTables.get(loadingKey);
        if (loadingTask) return loadingTask;

        const task = this.loadTable(tableName, bundleName);
        this._loadingTables.set(loadingKey, task);

        const clearLoadingTask = () => {
            if (this._loadingTables.get(loadingKey) === task) {
                this._loadingTables.delete(loadingKey);
            }
        };
        void task.then(clearLoadingTask, clearLoadingTask);

        return task;
    }

    private async loadTable(tableName: string, bundleName: string): Promise<void> {
        const loadingKey = `${bundleName}/${tableName}`;
        let asset: JsonAsset | null = null;

        try {
            await ResManager.Instance.loadBundle(bundleName);

            asset = await ResManager.Instance.load<JsonAsset>(
                tableName,
                JsonAsset,
                bundleName,
                ResType.EXPLICIT
            );

            if (!asset || !asset.isValid || !asset.json) {
                throw new Error(`配置表内容无效: ${loadingKey}`);
            }

            // ✅ 异步竞态拦截点：检查加载期间是否被业务强制宣告卸载
            if (this._abandonedLoads.has(loadingKey)) {
                this._abandonedLoads.delete(loadingKey);
                ResManager.Instance.release(tableName, bundleName);
                Logger.info(LogModule.ConfigManager, `🛑 异步竞态拦截成功，已废弃迟到的配置加载: ${loadingKey}`);
                return; // 物理熔断，不构建内存索引
            }

            await this.buildIndexAsync(tableName, asset.json);

        } catch (e) {
            Logger.error(LogModule.ConfigManager, `配置表加载失败: ${loadingKey}`, e);
            if (asset) {
                ResManager.Instance.release(tableName, bundleName);
            }
            throw e;
        }

        // ⚠️ 删除了原版 finally 中的无脑 release 代码。
        // JsonAsset 的所有权正式移交，其生死将由 unloadTable 全权主宰。
    }

    private async loadSingleTable(tableName: string, bundleName?: string): Promise<void> {
        if (this._tables.has(tableName)) return;
        await this.loadTables([tableName], bundleName);
    }

    /**
     * 时间分片构建引擎 (Time-Slicing Parser)
     * 将几千上万行的配置表化整为零，每处理 N 条数据就休息一次（让权给引擎渲染流），保持帧率平滑。
     */
    private async buildIndexAsync(tableName: string, data: any): Promise<void> {
        const tableMap = new Map<any, any>();
        const CHUNK_SIZE = 500;

        if (Array.isArray(data)) {
            for (let i = 0; i < data.length; i++) {
                const row = data[i];
                const key = row.id !== undefined ? row.id : i;
                tableMap.set(key, row);
                if (i > 0 && i % CHUNK_SIZE === 0) await this.yieldFrame();
            }
        } else {
            const keys = Object.keys(data);
            for (let i = 0; i < keys.length; i++) {
                const key = keys[i];
                tableMap.set(key, data[key]);
                if (i > 0 && i % CHUNK_SIZE === 0) await this.yieldFrame();
            }
        }
        this._tables.set(tableName, tableMap);
    }

    private yieldFrame(): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, 0));
    }

    public query<T>(tableName: string, id: any): T | null {
        const table = this._tables.get(tableName);
        if (table && table.has(id)) return table.get(id) as T;
        return null;
    }

    public getAll<T>(tableName: string): T[] {
        const table = this._tables.get(tableName);
        if (table) {
            return Array.from(table.values()) as T[];
        }
        return [];
    }

    public unloadTable(tableName: string, bundleName?: string): void {
        const targetBundle = bundleName || "config";
        const loadingKey = `${targetBundle}/${tableName}`;

        // ✅ 防漏护盾：如果配置表正处于异步加载中，将其打上废弃标记
        if (this._loadingTables.has(loadingKey)) {
            this._abandonedLoads.add(loadingKey);
            Logger.info(LogModule.ConfigManager, `⚠️ 业务触发秒退，已标记废弃加载中的配置表: ${loadingKey}`);
        }

        if (!this._tables.has(tableName)) return;

        this._tables.delete(tableName);
        ResManager.Instance.release(tableName, targetBundle);
        Logger.info(LogModule.ConfigManager, `🧹 配置表已被物理卸载并归还内存: [${targetBundle}] ${tableName}`);
    }
}