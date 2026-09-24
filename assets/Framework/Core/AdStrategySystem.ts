// assets/Framework/Core/AdStrategySystem.ts

import { AdManager } from "../../Framework/Core/AdManager";
import { SaveManager } from "../../Framework/Core/SaveManager";
import { DataKey, AdPlacement, AD_UNIT_MAP } from "../../Framework/Core/GameConst";
import { Logger, LogModule } from "../../Framework/Core/Logger";
import { DataCenter } from "db://assets/Framework/Data/DataCenter";

export class AdStrategySystem {
    private static _instance: AdStrategySystem | null = null;
    public static get Instance(): AdStrategySystem {
        if (!this._instance) this._instance = new AdStrategySystem();
        return this._instance;
    }

    private static _gameStartTime: number = 0;
    private readonly _maxPerDay: number = 9999;

    public init() {
        AdStrategySystem._gameStartTime = Date.now();
    }

    public getTodayAdCount(): number {
        const lastAdDate = SaveManager.Instance.get<string>(DataKey.LAST_AD_DATE, "");
        const todayStr = new Date().toDateString();

        if (lastAdDate !== todayStr) {
            SaveManager.Instance.set(DataKey.LAST_AD_DATE, todayStr);
            SaveManager.Instance.set(DataKey.DAILY_AD_COUNT, 0);
            return 0;
        }

        return SaveManager.Instance.get<number>(DataKey.DAILY_AD_COUNT, 0);
    }

    public canShowRewardAd(): boolean {
        return this.getTodayAdCount() < this._maxPerDay;
    }

    private recordAdShown(placement: AdPlacement | string): void {
        const count = this.getTodayAdCount();
        SaveManager.Instance.set(DataKey.DAILY_AD_COUNT, count + 1);
        Logger.info(LogModule.AdManager, `📝 广告播放成功入账 [${placement}]，今日累计: ${count + 1}/${this._maxPerDay}`);
    }

    /**
     * 🌟 业务点位播放主入口
     */
    public async tryShowRewardAdAsync(placement: AdPlacement = AdPlacement.BATTLE_REVIVE): Promise<boolean> {
       /* if (!this.canShowRewardAd()) {
            Logger.warn(LogModule.AdManager, "今日观看广告次数已达上限");
            return false;
        }*/

        // 🌟 1. 防御：检查点位配置
        const adUnitId = AD_UNIT_MAP[placement] || placement;
        Logger.info(LogModule.AdManager, `🎬 正在唤起点位 [${placement}], adUnitId: ${adUnitId}`);

        // 🌟 2. 调起底层广告
        const success = await AdManager.Instance.showRewardAdAsync(adUnitId);

        Logger.info(LogModule.AdManager, `🎬 点位 [${placement}] 广告播放返回结果: ${success}`);

        if (success) {
            this.recordAdShown(placement);
        }
        return success;
    }

    public static isUnderProtection(): boolean {
        const isTimeProtected = (Date.now() - this._gameStartTime) < 60000;
        const currentWave = DataCenter.Instance.get(DataKey.CUR_WAVE_INDEX) as number || 0;
        const isWaveProtected = currentWave < 1;

        return isTimeProtected || isWaveProtected;
    }
}