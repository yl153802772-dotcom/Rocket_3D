import { DataPayloadMap } from 'db://assets/Framework/Core/GameConst';
import { EncounterResultPayload } from './EncounterResultPayload';

/**
 * 结果型事件的最小权限上下文：只读探针 + 唯一结果出口，禁止 set / 禁止暴露 DataCenter。
 */
export interface IEncounterContext {
    readonly configId: string | number;
    readonly intensity: number;
    readonly encounterTime: number;
    readonly deltaTime: number;
    getRuntimeState<K extends keyof DataPayloadMap>(key: K): DataPayloadMap[K];
    finishEncounter(result: EncounterResultPayload): void;
}
