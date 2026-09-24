// assets/Framework/Core/ShareManager.ts
import { sys, game, Game } from 'cc';
import { Logger, LogModule } from './Logger';
import { DataCenter } from '../Data/DataCenter';
import { DataKey, EventName } from './GameConst';
import { EventCenter } from '../Data/EventCenter';
import { SaveManager } from './SaveManager';

declare const wx: any;

export interface ShareOptions {
    title?: string;
    imageUrl?: string;
    imageUrlId?: string;
    query?: string;
    /** 判定为成功的最短离开时间（秒），默认 2.5s */
    successDelaySec?: number;
}

export class ShareManager {
    private static _instance: ShareManager = null;
    public static get Instance(): ShareManager {
        if (!this._instance) this._instance = new ShareManager();
        return this._instance;
    }

    private _defaultTitle: string = "元素合成，法阵克敌！快来和我一起守卫文明！";
    private _defaultImageUrl: string = "";

    private readonly MAX_DAILY_SHARE_REWARD: number = 2; // 每日最多通过分享领奖 2 次

    // 时间嗅探状态
    private _isWaitingShareResult: boolean = false;
    private _shareStartTime: number = 0;
    private _minDelaySec: number = 2.5;
    private _currentCallback: ((success: boolean) => void) | null = null;

    public init(): void {
        if (sys.platform !== sys.Platform.WECHAT_GAME || typeof wx === "undefined") {
            Logger.info(LogModule.APP, "非微信小游戏环境，跳过 ShareManager 初始化");
            return;
        }

        // 1. 开启右上角胶囊转发
        wx.showShareMenu({
            withShareTicket: true,
            menus: ['shareAppMessage', 'shareTimeline']
        });

        // 2. 右上角被动转发配置
        wx.onShareAppMessage(() => {
            return {
                title: this._defaultTitle,
                imageUrl: this._defaultImageUrl,
                query: `shareTime=${Date.now()}`
            };
        });

        // 3. 注册生命周期切出/切回监听
        this.bindShareLifecycle();
    }

    private bindShareLifecycle(): void {
        game.on(Game.EVENT_HIDE, () => {
            if (this._isWaitingShareResult) {
                this._shareStartTime = Date.now();
                Logger.info(LogModule.APP, "📤 玩家切出小游戏进行分享...");
            }
        });

        game.on(Game.EVENT_SHOW, () => {
            if (this._isWaitingShareResult && this._currentCallback) {
                const stayDuration = (Date.now() - this._shareStartTime) / 1000;
                Logger.info(LogModule.APP, `📥 玩家返回小游戏，停留时长: ${stayDuration.toFixed(2)} 秒`);

                const callback = this._currentCallback;
                this._isWaitingShareResult = false;
                this._currentCallback = null;

                // 核心判定：离开游戏超过阈值判定为分享动作完成
                if (stayDuration >= this._minDelaySec) {
                    this.recordShareRewardClaimed();
                    callback(true);
                } else {
                    callback(false);
                }
            }
        });
    }

    /**
     * 获取今天已通过分享领取了几次奖励
     */
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

    /**
     * 是否还有今日分享领奖次数
     */
    public canClaimShareReward(): boolean {
        return this.getTodayShareRewardCount() < this.MAX_DAILY_SHARE_REWARD;
    }

    private recordShareRewardClaimed(): void {
        const count = this.getTodayShareRewardCount();
        SaveManager.Instance.set(DataKey.DAILY_SHARE_COUNT, count + 1);
        Logger.info(LogModule.APP, `📝 今日已领分享奖励次数: ${count + 1}/${this.MAX_DAILY_SHARE_REWARD}`);
    }

    /**
     * 🌟 单独的主动转发接口 (不阻断、不发奖)
     */
    public share(options?: ShareOptions): void {
        if (sys.platform !== sys.Platform.WECHAT_GAME || typeof wx === "undefined") {
            Logger.info(LogModule.APP, "[ShareManager] 【测试环境】触发模拟分享:", options);
            return;
        }

        wx.shareAppMessage({
            title: options?.title || this._defaultTitle,
            imageUrl: options?.imageUrl || this._defaultImageUrl,
            imageUrlId: options?.imageUrlId,
            query: options?.query || `shareTime=${Date.now()}`
        });
    }
    
    

    /**
     * 🌟 发起带奖励的分享
     */
    public tryShareForReward(options: ShareOptions, callback: (success: boolean, reason?: string) => void): void {
        if (!this.canClaimShareReward()) {
            EventCenter.emit(EventName.SHOW_TOAST, "今日分享领奖次数已达上限");
            callback(false, "LIMIT_REACHED");
            return;
        }

        if (sys.platform !== sys.Platform.WECHAT_GAME || typeof wx === "undefined") {
            Logger.info(LogModule.APP, "【测试环境】模拟分享成功并领奖");
            setTimeout(() => {
                this.recordShareRewardClaimed();
                callback(true);
            }, 500);
            return;
        }

        this._isWaitingShareResult = true;
        this._shareStartTime = Date.now();
        this._minDelaySec = options.successDelaySec || 2.5;
        this._currentCallback = callback;

        wx.shareAppMessage({
            title: options.title || this._defaultTitle,
            imageUrl: options.imageUrl || this._defaultImageUrl,
            imageUrlId: options.imageUrlId,
            query: options.query || `shareTime=${Date.now()}`
        });
    }
}
