/**
 * @module ShareManager
 * @description
 * [模块逻辑]
 * 业务层分享管理器。专注于处理每日分享次数限制、存盘记录及 Toast 提示。
 * 底层 API 调用已全部委托给 PlatformManager，彻底剥离微信依赖。
 */

import { Logger, LogModule } from './Logger';
import { DataKey, EventName } from './GameConst';
import { EventCenter } from '../Data/EventCenter';
import { SaveManager } from './SaveManager';
import { PlatformManager } from './Platform/PlatformManager';

export interface ShareOptions {
    title?: string;
    imageUrl?: string;
    imageUrlId?: string;
    query?: string;
    successDelaySec?: number;
}

export class ShareManager {
    private static _instance: ShareManager = null;
    public static get Instance(): ShareManager {
        if (!this._instance) this._instance = new ShareManager();
        return this._instance;
    }

    private _defaultTitle: string = "元素合成，法阵克敌！快来和我一起守卫文明！";
    private readonly MAX_DAILY_SHARE_REWARD: number = 2;

    public init(): void {
        PlatformManager.Instance.adapter.init();
    }

    public getTodayShareRewardCount(): number {
        const lastDate = SaveManager.Instance.get(DataKey.LAST_SHARE_DATE, "");
        const todayStr = new Date().toDateString();

        if (lastDate !== todayStr) {
            SaveManager.Instance.set(DataKey.LAST_SHARE_DATE, todayStr);
            SaveManager.Instance.set(DataKey.DAILY_SHARE_COUNT, 0);
            return 0;
        }
        return SaveManager.Instance.get(DataKey.DAILY_SHARE_COUNT, 0);
    }

    public canClaimShareReward(): boolean {
        return this.getTodayShareRewardCount() < this.MAX_DAILY_SHARE_REWARD;
    }

    private recordShareRewardClaimed(): void {
        const count = this.getTodayShareRewardCount();
        SaveManager.Instance.set(DataKey.DAILY_SHARE_COUNT, count + 1);
        Logger.info(LogModule.APP, `📝 今日已领分享奖励次数: ${count + 1}/${this.MAX_DAILY_SHARE_REWARD}`);
    }

    public share(options?: ShareOptions): void {
        PlatformManager.Instance.adapter.share({
            title: options?.title || this._defaultTitle,
            ...options
        });
    }

    public async tryShareForReward(options: ShareOptions, callback: (success: boolean, reason?: string) => void): Promise<void> {
        if (!this.canClaimShareReward()) {
            EventCenter.emit(EventName.SHOW_TOAST as any, "今日分享领奖次数已达上限");
            callback(false, "LIMIT_REACHED");
            return;
        }

        const success = await PlatformManager.Instance.adapter.tryShareForReward({
            title: options.title || this._defaultTitle,
            ...options
        });

        if (success) {
            this.recordShareRewardClaimed();
            callback(true);
        } else {
            callback(false);
        }
    }
}