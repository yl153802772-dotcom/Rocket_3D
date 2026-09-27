import { RuntimeDataCenter } from '../../Framework/Data/DataCenter';
import { ILifecycleModule } from '../../Framework/Core/ModuleSystem';
import { RocketDataKey } from '../GameConst';
import { DEFAULT_BATTLE_CONFIG } from './BattleConfig';

/**
 * 最小切片流程：初始化单局运行时状态并推进距离。
 */
export class BattleFlow implements ILifecycleModule {
    public readonly priority = 950;

    public init(): void {
        RuntimeDataCenter.Instance.set(RocketDataKey.PLAYER_MAX_HP, DEFAULT_BATTLE_CONFIG.playerMaxHp);
        RuntimeDataCenter.Instance.set(RocketDataKey.PLAYER_HP, DEFAULT_BATTLE_CONFIG.playerHp);
        RuntimeDataCenter.Instance.set(RocketDataKey.FORWARD_SPEED, DEFAULT_BATTLE_CONFIG.forwardSpeed);
        RuntimeDataCenter.Instance.set(RocketDataKey.SCORE, DEFAULT_BATTLE_CONFIG.initialScore);
        RuntimeDataCenter.Instance.set(RocketDataKey.DISTANCE, DEFAULT_BATTLE_CONFIG.initialDistance);
    }

    public update(dt: number): void {
        const dist = RuntimeDataCenter.Instance.get(RocketDataKey.DISTANCE) || 0;
        const speed = RuntimeDataCenter.Instance.get(RocketDataKey.FORWARD_SPEED) || 0;
        RuntimeDataCenter.Instance.set(RocketDataKey.DISTANCE, dist + speed * dt);
    }

    public dispose(): void {}
}
