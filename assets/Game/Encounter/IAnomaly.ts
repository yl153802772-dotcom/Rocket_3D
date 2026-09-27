import { IEncounterContext } from './IEncounterContext';
import { IAnomalyActions } from './IAnomalyActions';

export interface IAnomalyContext extends IEncounterContext {
    readonly actions: IAnomalyActions;
}

/**
 * 连续型异常生命周期（星云/方向反转/加减速/黑洞/陨石风暴）。
 */
export interface IAnomaly {
    init(context: IAnomalyContext): void;
    start(): void;
    update(): void;
    dispose(): void;
}
