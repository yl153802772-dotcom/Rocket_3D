// assets/Framework/Core/AdManager.ts

import { Logger, LogModule } from "./Logger";
import { DataCenter } from "../Data/DataCenter";
import { AD_UNIT_MAP, AdPlacement } from "./GameConst";

declare const wx: any;

interface WechatVideoAd {
    show(): Promise<void>;
    load(): Promise<void>;
    onLoad(callback: (res?: any) => void): void;
    onError(callback: (err: any) => void): void;
    onClose(callback: (res: { isEnded: boolean } | undefined) => void): void;
}

export class AdManager {
    private static _instance: AdManager | null = null;
    public static get Instance(): AdManager {
        if (!this._instance) {
            this._instance = new AdManager();
        }
        return this._instance;
    }

    private _videoAd: WechatVideoAd | null = null;
    private _isAdReady: boolean = false;
    private _isShowing: boolean = false;
    private _currentResolve: ((success: boolean) => void) | null = null;
    private _activeAdUnitId: string = "";
    private _deadlockTimer: any = null;

    /**
     * 🌟 遵循架构契约：启动时预热广告单例
     */
    public init(): void {
        Logger.info(LogModule.APP, "[AdManager] 初始化启动，预拉取默认广告...");
        if (typeof wx === "undefined" || !wx.createRewardedVideoAd) {
            Logger.info(LogModule.APP, "[AdManager] 非微信小游戏环境，跳过原生创建");
            return;
        }

        const defaultId = AD_UNIT_MAP[AdPlacement.BATTLE_REVIVE] || "adunit-d48f2315e7f47193";
        this.ensureRewardedVideoAd(defaultId);
        this.preload(defaultId);
    }

    public preload(adUnitId: string): void {
        const videoAd = this.ensureRewardedVideoAd(adUnitId);
        if (videoAd && !this._isAdReady) {
            videoAd.load()
                .then(() => {
                    this._isAdReady = true;
                    Logger.info(LogModule.APP, `[AdManager] 预热拉取广告就绪: ${adUnitId}`);
                })
                .catch(err => {
                    this._isAdReady = false;
                    Logger.warn(LogModule.APP, `[AdManager] 预热拉取未成功（不影响后续播放）: ${adUnitId}`, err);
                });
        }
    }

    private ensureRewardedVideoAd(adUnitId: string): WechatVideoAd | null {
        if (typeof wx === "undefined" || !wx.createRewardedVideoAd) return null;

        if (!this._videoAd || this._activeAdUnitId !== adUnitId) {
            this._activeAdUnitId = adUnitId;
            this._videoAd = wx.createRewardedVideoAd({
                adUnitId: adUnitId,
                multimedia: true
            });

            this._videoAd.onLoad(() => {
                this._isAdReady = true;
                Logger.info(LogModule.APP, `[AdManager] onLoad 资源加载成功: ${adUnitId}`);
            });

            this._videoAd.onError((err: any) => {
                this._isAdReady = false;
                Logger.error(LogModule.APP, `[AdManager] onError 发生异常: ${adUnitId}`, err);
                if (this._isShowing) {
                    this.completeAdFlow(false, "微信原生 onError");
                }
            });

            this._videoAd.onClose((res: any) => {
                const isEnded = (res === undefined || (res && res.isEnded !== false));
                Logger.info(LogModule.APP, `[AdManager] onClose 触发关闭: isEnded=${isEnded}`);
                if (this._isShowing) {
                    this.completeAdFlow(isEnded, isEnded ? "完整观看完毕" : "中途放弃");
                }
                this._isAdReady = false;
            });
        }
        return this._videoAd;
    }

    public showRewardAdAsync(adUnitId: string): Promise<boolean> {
        return new Promise<boolean>((resolve) => {
            if (typeof wx === "undefined" || !wx.createRewardedVideoAd) {
                Logger.info(LogModule.APP, "[AdManager] 浏览器/非微信环境，直接返回 true 模拟下发奖励");
                resolve(true);
                return;
            }

            if (this._isShowing) {
                Logger.warn(LogModule.APP, "[AdManager] 已经有广告正在展示，拒绝并发请求");
                resolve(false);
                return;
            }

            const videoAd = this.ensureRewardedVideoAd(adUnitId);
            if (!videoAd) {
                Logger.error(LogModule.APP, "[AdManager] 无法获取广告单例，播放失败");
                resolve(false);
                return;
            }

            this._isShowing = true;
            this._currentResolve = resolve;

            // 1. 锁住游戏时钟
            DataCenter.Instance.addPauseLock("WX_REWARD_AD_LOCK");

            // 2. 🌟 防悬挂硬保险：防止微信极罕见情况下完全吞掉 onClose 导致游戏永久卡死
            // 给 60 秒绝对超时兜底（广告最长不超过 45 秒）
            if (this._deadlockTimer) clearTimeout(this._deadlockTimer);
            this._deadlockTimer = setTimeout(() => {
                if (this._isShowing) {
                    Logger.warn(LogModule.APP, "[AdManager] 触发 60 秒极端未响应兜底，强制释放协程");
                    this.completeAdFlow(false, "超时强制兜底");
                }
            }, 60000);

            // 3. 按照官方规范拉起展示
            videoAd.show()
                .then(() => {
                    Logger.info(LogModule.APP, "[AdManager] show() 成功，广告已在手机全屏展开");
                })
                .catch((err: any) => {
                    Logger.warn(LogModule.APP, "[AdManager] 直接 show() 失败，执行 load() 兜底重试", err);
                    videoAd.load()
                        .then(() => videoAd.show())
                        .catch((loadErr: any) => {
                            Logger.error(LogModule.APP, "[AdManager] 重试 load() 后 show() 依旧失败", loadErr);
                            this.completeAdFlow(false, "拉取广告失败");
                        });
                });
        });
    }

    private completeAdFlow(success: boolean, reason: string): void {
        Logger.info(LogModule.APP, `[AdManager] completeAdFlow 结算: success=${success}, 原因=${reason}`);

        if (this._deadlockTimer) {
            clearTimeout(this._deadlockTimer);
            this._deadlockTimer = null;
        }

        const resolve = this._currentResolve;
        this._currentResolve = null;
        this._isShowing = false;

        // 解开时钟暂停锁
        try {
            DataCenter.Instance.removePauseLock("WX_REWARD_AD_LOCK");
        } catch (e) {
            Logger.warn(LogModule.APP, "解开暂停锁异常", e);
        }

        // 🌟 立即唤醒业务层 Promise，绝对不要延时！
        if (resolve) {
            resolve(success);
        } else {
            Logger.warn(LogModule.APP, "[AdManager] 警告：没有找到等待中的 Promise resolve");
        }
    }

    public destroy(): void {
        if (this._deadlockTimer) clearTimeout(this._deadlockTimer);
        this._videoAd = null;
        this._currentResolve = null;
        this._isShowing = false;
        this._isAdReady = false;
    }
}