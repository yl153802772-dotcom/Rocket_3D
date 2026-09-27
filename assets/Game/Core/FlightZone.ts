import { RuntimeDataCenter } from '../../Framework/Data/DataCenter';
import { RocketDataKey } from '../GameConst';
import { DEFAULT_BATTLE_CONFIG } from './BattleConfig';

/**
 * 前进感逻辑标量：火箭不移动 Z，世界/危险物相对流动的速度源。
 */
export class FlightZone {
    private static _instance: FlightZone = null;

    public static get Instance(): FlightZone {
        if (!this._instance) this._instance = new FlightZone();
        return this._instance;
    }

    public get forwardSpeed(): number {
        return RuntimeDataCenter.Instance.get(RocketDataKey.FORWARD_SPEED) || DEFAULT_BATTLE_CONFIG.forwardSpeed;
    }

    public set forwardSpeed(v: number) {
        RuntimeDataCenter.Instance.set(RocketDataKey.FORWARD_SPEED, v);
    }
}
