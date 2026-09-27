/**
 * 遭遇战结算结果：IEncounter / IAnomaly 结束时的唯一输出，由外部系统统一落盘。
 */
export interface EncounterResultPayload {
    isSuccess: boolean;
    rewards?: Record<string, number>;
    damageTaken?: number;
    nextHint?: string;
}
