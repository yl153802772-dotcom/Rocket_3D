/**
 * RedDotManager.ts
 * 作用：全局红点树管理器（支持路径回溯、自动计算父节点、标准强类型事件派发、本地持久化防丢失）
 */
import { EventName } from './GameConst';
import { Logger, LogModule } from './Logger';
import { EventCenter } from "../Data/EventCenter";
import { SaveManager } from './SaveManager'; // 🌟 新增：引入存档系统

export class RedDotManager {
    private static _instance: RedDotManager = null;
    public static get Instance(): RedDotManager {
        if (!this._instance) this._instance = new RedDotManager();
        return this._instance;
    }

    private _dotData: Map<string, number> = new Map();
    private readonly SAVE_KEY = "SYS_RED_DOT_DATA";

    public init(): void {
        // 🌟 核心修复 1：冷启动时，从本地磁盘读取遗留的未读红点记录！
        const savedDots = SaveManager.Instance.get(this.SAVE_KEY, {});
        for (const key in savedDots) {
            this._dotData.set(key, savedDots[key]);
        }
        Logger.info(LogModule.APP, `🔴 RedDotManager 初始化完成，已恢复 ${this._dotData.size} 条历史红点记录`);
    }

    public getValue(path: string): number {
        return this._dotData.get(path) || 0;
    }

    public setValue(path: string, value: number): void {
        if (this.getValue(path) === value) return;

        // 1. 设置当前节点值
        this._dotData.set(path, value);
        this.dispatch(path, value);

        // 2. 递归更新父节点
        this.updateParent(path);

        // 🌟 核心修复 2：任何红点状态改变，立即将快照拍入本地磁盘！
        this.saveToDisk();
    }

    private saveToDisk(): void {
        const plainObj: any = {};
        this._dotData.forEach((val, key) => plainObj[key] = val);
        SaveManager.Instance.set(this.SAVE_KEY, plainObj);
    }

    private updateParent(path: string, depth: number = 0): void {
        const MAX_DEPTH = 10;
        if (depth > MAX_DEPTH) {
            Logger.error(`[RedDotManager] updateParent 递归深度异常: ${path}`);
            return;
        }

        const lastSlashIndex = path.lastIndexOf('/');
        if (lastSlashIndex === -1) return;

        const parentPath = path.substring(0, lastSlashIndex);
        const parentLevel = parentPath.split('/').length;
        let childrenSum = 0;

        this._dotData.forEach((val, key) => {
            if (key.startsWith(parentPath + "/") && key.split('/').length === parentLevel + 1) {
                childrenSum += val;
            }
        });

        const finalValue = childrenSum;

        if (this.getValue(parentPath) !== finalValue) {
            this._dotData.set(parentPath, finalValue);
            this.dispatch(parentPath, finalValue);
            this.updateParent(parentPath, depth + 1);
        }
    }

    private dispatch(path: string, value: number): void {
        EventCenter.emit(EventName.RED_DOT_UPDATE, { path: path, value: value } as any);
    }
}