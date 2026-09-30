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

/**
 * encounter.json 配置行结构。
 */
export interface EncounterRow {
    id: string;
    type: string;
    configId: string | number;
    intensity: number;
}

/**
 * weapon.json / skill.json 配置行结构。
 */
export interface WeaponRow {
    id: string;
    zone: number;
    damage?: number;
    cooldown?: number;
    pattern?: string;
    count?: number;
    projectile?: string;
}

export interface SkillRow {
    id: string;
    zone: number;
    duration?: number;
    cooldown?: number;
    timeScale?: number;
}
