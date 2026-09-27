/**
 * 单局战斗配置（Step A 先以 TS 对象承载，Step E 迁移为 ConfigManager 读取的 JSON）。
 */
export interface BattleConfig {
    playerMaxHp: number;
    playerHp: number;
    forwardSpeed: number;
    initialScore: number;
    initialDistance: number;
}

export const DEFAULT_BATTLE_CONFIG: BattleConfig = {
    playerMaxHp: 100,
    playerHp: 100,
    forwardSpeed: 8,
    initialScore: 0,
    initialDistance: 0,
};
