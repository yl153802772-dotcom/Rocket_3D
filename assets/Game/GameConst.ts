/**
 * @module GameConst
 * @description
 * 深空火箭游戏层强类型字典。
 * 通过 TypeScript Module Augmentation 扩展 Core 框架的 EventPayloadMap 与 DataPayloadMap，
 * 保持 Core -> Game 的单向依赖，业务事件/数据键只在本层定义。
 */

// 1. 深空火箭专属事件枚举
export enum RocketEventName {
    ROCKET_HIT = "ROCKET_HIT",
    PICKUP_GOT = "PICKUP_GOT",
    COIN_GAINED = "COIN_GAINED",
    GAME_OVER = "GAME_OVER",
}
// 2. 深空火箭专属数据键枚举
// 单局运行时状态：写入 RuntimeDataCenter。
// 跨局持久化数据（如金币）使用框架 DataKey.GOLD，写入 ArchiveDataCenter。
export enum RocketDataKey {
    PLAYER_HP = "PLAYER_HP",
    PLAYER_MAX_HP = "PLAYER_MAX_HP",
    FORWARD_SPEED = "FORWARD_SPEED",
    SCORE = "SCORE",
    DISTANCE = "DISTANCE",
    CURRENT_ZONE = "CURRENT_ZONE",
    ROCKET_TARGET_X = "ROCKET_TARGET_X",
    ROCKET_TARGET_Y = "ROCKET_TARGET_Y",
}
// 3. 深空火箭配置表主键
export enum ConfigKey {
    GAME = "game",
    PLAYER = "player",
    ROCKET = "rocket",
    METEOR = "meteor",
    PICKUP = "pickup",
}

// =========================================================================
// 🌟 核心：模块增强 (向 Core 框架的类型字典注入深空火箭的强类型)
// 路径必须与 Core 框架中 GameConst.ts 的实际物理路径完全一致
// =========================================================================

declare module '../Framework/Core/GameConst' {
    interface EventPayloadMap {
        "ROCKET_HIT": { damage: number };
        "PICKUP_GOT": { kind: string };
        "COIN_GAINED": { amount: number };
        "GAME_OVER": { score: number; distance: number };
    }

    interface DataPayloadMap {
        "PLAYER_HP": number;
        "PLAYER_MAX_HP": number;
        "FORWARD_SPEED": number;
        "SCORE": number;
        "DISTANCE": number;
        "CURRENT_ZONE": number;
        "ROCKET_TARGET_X": number;
        "ROCKET_TARGET_Y": number;
    }
}
