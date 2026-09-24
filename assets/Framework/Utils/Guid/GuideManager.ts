import { Node, find } from 'cc';
import { EventCenter } from '../../Data/EventCenter';
import { DataKey, EventPayloadMap } from '../../Core/GameConst';
import { ConfigManager } from '../../Core/ConfigManager';
import { UIManager, UILayer } from '../../Core/UIManager';
import { Logger, LogModule } from '../../Core/Logger';
import { DataCenter } from '../../Data/DataCenter';

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

    private _delayTimer: any = null; // 记录延迟定时器句柄

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
            Logger.info(LogModule.UIBase, `⏱️ 引导延迟触发，等待 ${config.delay} 秒...`);
            this._delayTimer = setTimeout(async () => {
                this._delayTimer = null;

                // 🌟 架构级防线：如果延迟结束时，玩家处于手动暂停状态（比如打开了设置、暂离），
                // 引导决不能在暂停态强行弹出遮罩制造死锁！必须挂起等待玩家恢复游戏！
                while (DataCenter.Instance.get(DataKey.IS_PAUSED)) {
                    await new Promise(res => setTimeout(res, 200));
                    // 保护机制：如果等待期间引导被强行中止，直接退出
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
            DataCenter.Instance.addPauseLock("GUIDE_PAUSE");
        }

        const finishEventName = config.finishEvent as keyof EventPayloadMap;
        EventCenter.once(finishEventName, () => {
            if (shouldPause) {
                DataCenter.Instance.removePauseLock("GUIDE_PAUSE");
            }

            // 🌟 当前步骤一达成，立刻自毁面罩！屏幕恢复明亮！
            UIManager.Instance.closeUI("GuideUI");

            this._currentStepId++;
            // 延时进入下一步逻辑
            setTimeout(() => { this.executeStep(); }, 100);
        });
    }

    /**
     * 🌟 引导正常结束：永久置位已完成标记，放行所有系统
     */
    public finishGuideGroup(): void {
        this._isGuiding = false;
        if (this._delayTimer) {
            clearTimeout(this._delayTimer);
            this._delayTimer = null;
        }
        DataCenter.Instance.removePauseLock("GUIDE_PAUSE");
        UIManager.Instance.closeUI("GuideUI");

        if (this._currentGroupId === 1) {
            DataCenter.Instance.set(DataKey.IS_GUIDE_COMPLETED, true);
            Logger.info(LogModule.UIBase, "🎉 新手引导组 1 全部完成，永久解除按键限制！");
        }
    }

    /**
     * 🌟 强行中断引导：退关、重载时调用
     */
    public stopAll(): void {
        this._isGuiding = false;
        if (this._delayTimer) {
            clearTimeout(this._delayTimer);
            this._delayTimer = null;
        }
        DataCenter.Instance.removePauseLock("GUIDE_PAUSE");
        this._dynamicFinders.clear();
        UIManager.Instance.closeUI("GuideUI");
    }
}