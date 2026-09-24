/**
 * @module ConfigManager
 * @description
 * [模块逻辑]
 * 游戏海量配置表的高效管理器。负责异步按需加载 JSON 配置，构建 O(1) 的 Map 索引供业务极速查询。
 *
 * [调用规则]
 * 1. 业务切入新玩法前，通过 loadTables() 批量懒加载所需的配置表。
 * 2. 数据查询严格调用 query() 或 getAll()，禁止修改返回的对象导致脏数据。
 * 3. 内存吃紧或切换大阶段时，调用 unloadTable()，不仅清空索引，还会通知底层的 ResManager 物理释放 JsonAsset。
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

    public init(): void {}

    public async loadTables(tableNames: string[], bundleName: string = "config"): Promise<void> {
        const needLoadNames = Array.from(new Set(tableNames)).filter(name => !!name && !this._tables.has(name));
        if (needLoadNames.length === 0) return;

        try {
            await Promise.all(needLoadNames.map(name => this.loadTableOnce(name, bundleName)));
            Logger.info(LogModule.ConfigManager, `配置表批量加载与索引构建完成: ${needLoadNames.join(", ")}`);
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
                ResType.TEMP
            );

            if (!asset || !asset.isValid || !asset.json) {
                throw new Error(`配置表内容无效: ${loadingKey}`);
            }

            this.buildIndex(tableName, asset.json);
        } catch (e) {
            Logger.error(LogModule.ConfigManager, `配置表加载失败: ${loadingKey}`, e);
            throw e;
        } finally {
            if (asset) {
                ResManager.Instance.release(tableName, bundleName);
            }
        }
    }

    private async loadSingleTable(tableName: string, bundleName?: string): Promise<void> {
        if (this._tables.has(tableName)) return;
        await this.loadTables([tableName], bundleName);
    }

    private buildIndex(tableName: string, data: any): void {
        const tableMap = new Map<any, any>();
        if (Array.isArray(data)) {
            for (let i = 0; i < data.length; i++) {
                const row = data[i];
                const key = row.id !== undefined ? row.id : i;
                tableMap.set(key, row);
            }
        } else {
            for (const key in data) {
                tableMap.set(key, data[key]);
            }
        }
        this._tables.set(tableName, tableMap);
    }

    public query<T>(tableName: string, id: any): T | null {
        const table = this._tables.get(tableName);
        if (table && table.has(id)) {
            return table.get(id) as T;
        }
        Logger.warn(`配置查询失败: 表[${tableName}]中找不到ID[${id}]`);
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
        this._tables.delete(tableName);
        // ✅ 核心闭环修复：通知底层的资源管理器释放该 JSON 的物理缓存引用
        const targetBundle = bundleName || "config";
        ResManager.Instance.release(tableName, targetBundle);
        Logger.info(LogModule.ConfigManager, `配置表物理引用被卸载: [${targetBundle}] ${tableName}`);
    }
}