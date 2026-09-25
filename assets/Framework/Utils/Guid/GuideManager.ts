import { Node, find } from 'cc';
import { EventCenter } from '../../Data/EventCenter';
import { DataKey, EventPayloadMap } from '../../Core/GameConst';
import { ConfigManager } from '../../Core/ConfigManager';
import { UIManager, UILayer } from '../../Core/UIManager';
import { Logger, LogModule } from '../../Core/Logger';
// ✅ 同步更新：引入拆分后的双数据中心
import { RuntimeDataCenter, ArchiveDataCenter } from '../../Data/DataCenter';

export class GuideManager {
    private static _instance: GuideManager = null;
    public static get Instance(): GuideManager {
        if (!this._instance) this._instance = new GuideManager();
        return this._instance;
    }

    private _dynamicFinders: Map<string, () => Node> = new Map();
    private _currentGroupId: number = 0;
    private _currentStepId: number = 0;
    private _isGuiding: boolean = false;
    private _delayTimer: any = null;

    public init(): void { }

    public registerDynamicFinder(key: string, finder: () => Node): void {
        this._dynamicFinders.set(key, finder);
    }

    public startGuideGroup(groupId: number): void {
        if (this._isGuiding) return;
        this._isGuiding = true;
        this._currentGroupId = groupId;
        this._currentStepId = 1;
        this.executeStep();
    }

    private executeStep(): void {
        const allGuides = ConfigManager.Instance.getAll<any>("guide");
        if (!allGuides) { this.finishGuideGroup(); return; }

        const config = allGuides.find(g => g.groupId === this._currentGroupId && g.stepId === this._currentStepId);
        if (!config) { this.finishGuideGroup(); return; }

        if (config.delay && config.delay > 0) {
            this._delayTimer = setTimeout(async () => {
                this._delayTimer = null;
                // ✅ 暂停态属于运行时状态，调用 RuntimeDataCenter
                while (RuntimeDataCenter.Instance.get(DataKey.IS_PAUSED)) {
                    await new Promise(res => setTimeout(res, 200));
                    if (!this._isGuiding) return;
                }
                this._performStep(config);
            }, config.delay * 1000);
        } else {
            this._performStep(config);
        }
    }

    private async _performStep(config: any): Promise<void> {
        while (UIManager.Instance.isLocked()) {
            await new Promise(res => setTimeout(res, 100));
        }

        let targetNodes: Node[] = [];
        let retryCount = 0;
        const paths = config.targetPath.split(',').map((s: string) => s.trim());

        while (targetNodes.length < paths.length && retryCount < 20) {
            targetNodes = [];
            for (const path of paths) {
                let node: Node = null;
                if (config.targetType === "dynamic") {
                    const finder = this._dynamicFinders.get(path);
                    node = finder ? finder() : null;
                } else {
                    node = find(path);
                }
                if (node && node.isValid) targetNodes.push(node);
            }
            if (targetNodes.length < paths.length) {
                retryCount++;
                await new Promise(res => setTimeout(res, 100));
            }
        }

        if (targetNodes.length === 0) {
            this.finishGuideGroup();
            return;
        }

        const guideUI = await UIManager.Instance.openUI("GuideUI", "prefab/GuideUI", UILayer.Guide, {
            targetNodes: targetNodes,
            config: config
        }, "ui");

        if (!guideUI) return;

        const shouldPause = config.isPause !== false;
        if (shouldPause) {
            // ✅ 添加暂停锁，调用 RuntimeDataCenter
            RuntimeDataCenter.Instance.addPauseLock("GUIDE_PAUSE");
        }

        const finishEventName = config.finishEvent as keyof EventPayloadMap;
        EventCenter.once(finishEventName, () => {
            if (shouldPause) {
                // ✅ 移除暂停锁，调用 RuntimeDataCenter
                RuntimeDataCenter.Instance.removePauseLock("GUIDE_PAUSE");
            }
            UIManager.Instance.closeUI("GuideUI");
            this._currentStepId++;
            setTimeout(() => { this.executeStep(); }, 100);
        });
    }

    public finishGuideGroup(): void {
        this._isGuiding = false;
        if (this._delayTimer) {
            clearTimeout(this._delayTimer);
            this._delayTimer = null;
        }
        // ✅ 移除暂停锁，调用 RuntimeDataCenter
        RuntimeDataCenter.Instance.removePauseLock("GUIDE_PAUSE");
        UIManager.Instance.closeUI("GuideUI");

        if (this._currentGroupId === 1) {
            // ✅ 图鉴/引导完成属于需要持久化的资产，严格调用 ArchiveDataCenter
            ArchiveDataCenter.Instance.set(DataKey.IS_GUIDE_COMPLETED, true);
            Logger.info(LogModule.UIBase, "🎉 新手引导组 1 全部完成，永久解除按键限制！");
        }
    }

    public stopAll(): void {
        this._isGuiding = false;
        if (this._delayTimer) {
            clearTimeout(this._delayTimer);
            this._delayTimer = null;
        }
        // ✅ 移除暂停锁，调用 RuntimeDataCenter
        RuntimeDataCenter.Instance.removePauseLock("GUIDE_PAUSE");
        this._dynamicFinders.clear();
        UIManager.Instance.closeUI("GuideUI");
    }
}