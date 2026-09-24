/**
 * @module AdManager
 * @description
 * [模块逻辑]
 * 业务层广告管家。负责并发拦截、超时兜底防死锁以及调度全局时钟暂停。
 * 具体的原生广告实例化与 onLoad/onClose 事件监听已下放至 PlatformManager。
 */

import { Logger, LogModule } from "./Logger";
import { DataCenter } from "../Data/DataCenter";
import { AD_UNIT_MAP, AdPlacement } from "./GameConst";
import { PlatformManager } from "./Platform/PlatformManager";

export class AdManager {
    private static _instance: AdManager | null = null;
    public static get Instance(): AdManager {
        if (!this._instance) this._instance = new AdManager();
        return this._instance;
    }

    private _isShowing: boolean = false;
    private _deadlockTimer: any = null;

    public init(): void {
        Logger.info(LogModule.APP, "[AdManager] 初始化启动，预拉取默认广告...");
        const defaultId = AD_UNIT_MAP[AdPlacement.BATTLE_REVIVE] || "adunit-d48f2315e7f47193";
        this.preload(defaultId);
    }

    public preload(adUnitId: string): void {
        PlatformManager.Instance.adapter.preloadRewardAd(adUnitId);
    }

    public showRewardAdAsync(adUnitId: string): Promise<boolean> {
        return new Promise<boolean>((resolve) => {
            if (this._isShowing) {
                Logger.warn(LogModule.APP, "[AdManager] 已经有广告正在展示，拒绝并发请求");
                resolve(false);
                return;
            }

            this._isShowing = true;

            // 1. 锁住游戏时钟
            DataCenter.Instance.addPauseLock("WX_REWARD_AD_LOCK");

            // 2. 60秒极端未响应兜底，防止底层组件崩溃导致游戏永久卡死
            if (this._deadlockTimer) clearTimeout(this._deadlockTimer);
            this._deadlockTimer = setTimeout(() => {
                if (this._isShowing) {
                    Logger.warn(LogModule.APP, "[AdManager] 触发 60 秒极端未响应兜底，强制释放协程");
                    this.completeAdFlow(resolve, false, "超时强制兜底");
                }
            }, 60000);

            // 3. 调起平台适配层
            PlatformManager.Instance.adapter.showRewardAd(adUnitId).then((success) => {
                if (this._isShowing) {
                    this.completeAdFlow(resolve, success, success ? "观看完毕" : "中途放弃/失败");
                }
            });
        });
    }

    private completeAdFlow(resolve: (success: boolean) => void, success: boolean, reason: string): void {
        Logger.info(LogModule.APP, `[AdManager] 结算: success=${success}, 原因=${reason}`);

        if (this._deadlockTimer) {
            clearTimeout(this._deadlockTimer);
            this._deadlockTimer = null;
        }

        this._isShowing = false;

        try {
            DataCenter.Instance.removePauseLock("WX_REWARD_AD_LOCK");
        } catch (e) {
            Logger.warn(LogModule.APP, "解开暂停锁异常", e);
        }

        resolve(success);
    }

    public destroy(): void {
        if (this._deadlockTimer) clearTimeout(this._deadlockTimer);
        this._isShowing = false;
    }
}