import { RuntimeDataCenter, ArchiveDataCenter } from 'db://assets/Framework/Data/DataCenter';
import { DataKey } from 'db://assets/Framework/Core/GameConst';
import { RocketDataKey } from '../../GameConst';

/**
 * 局内只读上下文门面：RunDirector 专用局势评估探针，零 GC，禁止写。
 */
export class RunContextFacade {
    public get currentTension(): number {
        const hp = RuntimeDataCenter.Instance.get(RocketDataKey.PLAYER_HP) || 0;
        const max = RuntimeDataCenter.Instance.get(RocketDataKey.PLAYER_MAX_HP) || 1;
        return 1.0 - Math.min(1, Math.max(0, hp / max));
    }

    public get currentProgress(): number {
        return RuntimeDataCenter.Instance.get(RocketDataKey.DISTANCE) || 0;
    }

    public get currentEconomy(): number {
        return ArchiveDataCenter.Instance.get(DataKey.GOLD) || 0;
    }

    public getRuntimeState<K extends keyof any>(key: K): any {
        return RuntimeDataCenter.Instance.get(key as any);
    }
}
