import { RuntimeDataCenter } from '../../Framework/Data/DataCenter';
import { DataPayloadMap } from 'db://assets/Framework/Core/GameConst';
import { IEncounterContext } from '../Encounter/IEncounterContext';
import { IAnomalyActions } from '../Encounter/IAnomalyActions';
import { EncounterResultPayload } from '../Encounter/EncounterResultPayload';

/**
 * 结果型事件上下文：只读探针 + finishEncounter 回调系统。
 */
export class EncounterContext implements IEncounterContext {
    public readonly configId: string | number;
    public readonly intensity: number;
    public encounterTime = 0;
    public deltaTime = 0;

    private _onFinish: (result: EncounterResultPayload) => void;

    constructor(configId: string | number, intensity: number, onFinish: (result: EncounterResultPayload) => void) {
        this.configId = configId;
        this.intensity = intensity;
        this._onFinish = onFinish;
    }

    public getRuntimeState<K extends keyof DataPayloadMap>(key: K): DataPayloadMap[K] {
        return RuntimeDataCenter.Instance.get(key);
    }

    public finishEncounter(result: EncounterResultPayload): void {
        this._onFinish(result);
    }
}

/**
 * 连续型异常上下文：在结果型上下文基础上挂载命名动作白名单。
 */
export class AnomalyContext extends EncounterContext {
    public readonly actions: IAnomalyActions;

    constructor(
        configId: string | number,
        intensity: number,
        onFinish: (result: EncounterResultPayload) => void,
        actions: IAnomalyActions,
    ) {
        super(configId, intensity, onFinish);
        this.actions = actions;
    }
}
