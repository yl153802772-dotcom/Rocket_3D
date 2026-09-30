import { RuntimeDataCenter } from '../../Framework/Data/DataCenter';
import { ILifecycleModule } from '../../Framework/Core/ModuleSystem';
import { ConfigManager } from '../../Framework/Core/ConfigManager';
import { ConfigKey, RocketDataKey } from '../GameConst';
import { BattleConfig, DEFAULT_BATTLE_CONFIG } from './BattleConfig';

/**
 * 最小切片流程：初始化单局运行时状态并推进距离。
 */
export class BattleFlow implements ILifecycleModule {
    public readonly priority = 950;

    public init(): void {
        const cfg = ConfigManager.Instance.query<BattleConfig>(ConfigKey.BATTLE, 'default') || DEFAULT_BATTLE_CONFIG;
        RuntimeDataCenter.Instance.set(RocketDataKey.PLAYER_MAX_HP, cfg.playerMaxHp);
        RuntimeDataCenter.Instance.set(RocketDataKey.PLAYER_HP, cfg.playerHp);
        RuntimeDataCenter.Instance.set(RocketDataKey.FORWARD_SPEED, cfg.forwardSpeed);
        RuntimeDataCenter.Instance.set(RocketDataKey.SCORE, cfg.initialScore);
        RuntimeDataCenter.Instance.set(RocketDataKey.DISTANCE, cfg.initialDistance);
    }

    public update(dt: number): void {
        const dist = RuntimeDataCenter.Instance.get(RocketDataKey.DISTANCE) || 0;
        const speed = RuntimeDataCenter.Instance.get(RocketDataKey.FORWARD_SPEED) || 0;
        const nextDist = dist + speed * dt;
        RuntimeDataCenter.Instance.set(RocketDataKey.DISTANCE, nextDist);

        // 占位区域划分：每 100 距离一个区域，后续改为配置驱动
        const zone = nextDist < 100 ? 1 : nextDist < 200 ? 2 : nextDist < 300 ? 3 : 4;
        RuntimeDataCenter.Instance.set(RocketDataKey.CURRENT_ZONE, zone);
    }

    public dispose(): void {}
}
