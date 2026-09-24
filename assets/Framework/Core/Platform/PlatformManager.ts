/**
 * @module PlatformManager
 * @description
 * [模块逻辑]
 * 平台抽象层 (Platform Abstraction Layer)。提供广告、分享、HTTP请求和存储的标准接口。
 * 核心管线不再直接调用 wx.xxx，而是通过本管理器的适配器执行，确保框架能在 Web 或其他小游戏平台零报错运行。
 */

import { sys, game, Game } from 'cc';
import { Logger, LogModule } from '../Logger';

export interface IPlatformService {
    init(): void;
    share(options: any): void;
    tryShareForReward(options: any): Promise<boolean>;
    preloadRewardAd(adUnitId: string): void;
    showRewardAd(adUnitId: string): Promise<boolean>;
    request<T>(method: string, url: string, data: any, headers: any, timeout: number): Promise<T>;
}

declare const wx: any;

class WechatPlatformAdapter implements IPlatformService {
    private _videoAds: Map<string, any> = new Map();
    private _isWaitingShare: boolean = false;
    private _shareStartTime: number = 0;
    private _shareResolve: ((success: boolean) => void) | null = null;
    private _shareDelaySec: number = 2.5;

    public init(): void {
        wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] });
        wx.onShareAppMessage(() => ({
            title: "元素合成，法阵克敌！快来和我一起守卫文明！",
            query: `shareTime=${Date.now()}`
        }));

        // 平台层内部处理分享的时间嗅探逻辑
        game.on(Game.EVENT_HIDE, () => {
            if (this._isWaitingShare) this._shareStartTime = Date.now();
        });
        game.on(Game.EVENT_SHOW, () => {
            if (this._isWaitingShare && this._shareResolve) {
                const stayDuration = (Date.now() - this._shareStartTime) / 1000;
                this._isWaitingShare = false;
                const resolve = this._shareResolve;
                this._shareResolve = null;
                resolve(stayDuration >= this._shareDelaySec);
            }
        });
    }

    public share(options: any): void {
        wx.shareAppMessage({
            title: options?.title,
            imageUrl: options?.imageUrl,
            imageUrlId: options?.imageUrlId,
            query: options?.query || `shareTime=${Date.now()}`
        });
    }

    public tryShareForReward(options: any): Promise<boolean> {
        return new Promise((resolve) => {
            this._isWaitingShare = true;
            this._shareStartTime = Date.now();
            this._shareDelaySec = options.successDelaySec || 2.5;
            this._shareResolve = resolve;

            wx.shareAppMessage({
                title: options.title,
                imageUrl: options.imageUrl,
                imageUrlId: options.imageUrlId,
                query: options.query || `shareTime=${Date.now()}`
            });
        });
    }

    public preloadRewardAd(adUnitId: string): void {
        if (!wx.createRewardedVideoAd) return;
        if (!this._videoAds.has(adUnitId)) {
            const ad = wx.createRewardedVideoAd({ adUnitId, multimedia: true });
            this._videoAds.set(adUnitId, ad);
        }
        this._videoAds.get(adUnitId).load().catch(() => {});
    }

    public showRewardAd(adUnitId: string): Promise<boolean> {
        return new Promise((resolve) => {
            if (!wx.createRewardedVideoAd) { resolve(false); return; }

            let videoAd = this._videoAds.get(adUnitId);
            if (!videoAd) {
                videoAd = wx.createRewardedVideoAd({ adUnitId, multimedia: true });
                this._videoAds.set(adUnitId, videoAd);
            }

            const closeHandler = (res: any) => {
                videoAd.offClose(closeHandler);
                videoAd.offError(errorHandler);
                const isEnded = (res === undefined || (res && res.isEnded !== false));
                resolve(isEnded);
            };

            const errorHandler = (err: any) => {
                videoAd.offClose(closeHandler);
                videoAd.offError(errorHandler);
                Logger.error(LogModule.APP, "[WechatAdapter] 广告异常", err);
                resolve(false);
            };

            videoAd.onClose(closeHandler);
            videoAd.onError(errorHandler);

            videoAd.show().catch(() => {
                videoAd.load().then(() => videoAd.show()).catch((err: any) => errorHandler(err));
            });
        });
    }

    public request<T>(method: string, url: string, data: any, headers: any, timeout: number): Promise<T> {
        return new Promise((resolve, reject) => {
            wx.request({
                url, method, data, header: headers, timeout,
                success: (res: any) => {
                    if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data as T);
                    else reject({ statusCode: res.statusCode, data: res.data });
                },
                fail: (err: any) => reject(err)
            });
        });
    }
}

class WebPlatformAdapter implements IPlatformService {
    public init(): void { Logger.info(LogModule.APP, "[WebAdapter] 初始化浏览器测试平台"); }
    public share(options: any): void { Logger.info(LogModule.APP, "[WebAdapter] 模拟分享:", options); }
    public tryShareForReward(options: any): Promise<boolean> {
        Logger.info(LogModule.APP, "[WebAdapter] 模拟分享领奖");
        return new Promise(resolve => setTimeout(() => resolve(true), 500));
    }
    public preloadRewardAd(adUnitId: string): void {}
    public showRewardAd(adUnitId: string): Promise<boolean> {
        Logger.info(LogModule.APP, "[WebAdapter] 模拟观看广告:", adUnitId);
        return new Promise(resolve => setTimeout(() => resolve(true), 1000));
    }
    public request<T>(method: string, url: string, data: any, headers: any, timeout: number): Promise<T> {
        return fetch(url, { method, headers, body: data ? JSON.stringify(data) : undefined })
            .then(async res => {
                if (res.ok) return await res.json() as T;
                throw { statusCode: res.status, data: await res.json().catch(() => ({})) };
            });
    }
}

export class PlatformManager {
    private static _instance: PlatformManager = null;
    public static get Instance(): PlatformManager {
        if (!this._instance) this._instance = new PlatformManager();
        return this._instance;
    }

    public adapter: IPlatformService;

    constructor() {
        if (sys.platform === sys.Platform.WECHAT_GAME && typeof wx !== "undefined") {
            this.adapter = new WechatPlatformAdapter();
        } else {
            this.adapter = new WebPlatformAdapter();
        }
    }
}