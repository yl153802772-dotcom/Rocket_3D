/**
 * GameConst.ts
 * 作用：全局强类型字典（消灭魔法字符串）
 */
import { Vec2,Vec3 } from 'cc';
export enum EventName {
    GAME_START = "GAME_START",
    UI_OPENED = "UI_OPENED",
    UI_CLOSED = "UI_CLOSED",
    GOLD_CHANGED = "GOLD_CHANGED",

    // ✅ 新增：红点刷新事件
    RED_DOT_UPDATE = "RED_DOT_UPDATE",
    
    SHOW_TOAST = "SHOW_TOAST",
    SHOW_BROADCAST = "SHOW_BROADCAST", // 🌟 新增：全局滚动广播
    
    LANGUAGE_CHANGED = "LANGUAGE_CHANGED",
    MAIN_MENU_CLICK = "MAIN_MENU_CLICK",
    MAIN_MENU_UPDATE = "MAIN_MENU_UPDATE",
    
    //商店
    OPEN_SHOP = "OPEN_SHOP",
    OPEN_SANDBOX = "OPEN_SANDBOX",
    
    OPEN_BAG = "OPEN_BAG",

    LEVEL_WIN = "LEVEL_WIN",
    LEVEL_DEFEAT = "LEVEL_DEFEAT", // 🌟 新增失败事件

    TRIGGER_SKILL_EFFECT = "TRIGGER_SKILL_EFFECT", // 🌟 新增：触发主动技能事件
    SPAWN_DAMAGE_TEXT = "SPAWN_DAMAGE_TEXT", // 🌟 新增：飘字事件

    MONSTER_DEAD_DROP = "MONSTER_DEAD_DROP", // 怪物掉落事件
    LEVEL_STARTED = "LEVEL_STARTED", // 🌟 新增：关卡启动事件

    MERGE_DATA_CHANGED = "MERGE_DATA_CHANGED", // (保留这个，BattleUI 还在用它刷塔)

    TOWER_FIRE = "TOWER_FIRE",
    PLAY_MERGE_EFFECT = "PLAY_MERGE_EFFECT",
    
    SHOW_WAVE_BANNER = "SHOW_WAVE_BANNER", // 🌟 显示波次横幅警告

    UPDATE_WAVE_PROGRESS = "UPDATE_WAVE_PROGRESS", // 更新波次进度 (1/4)

    SHOW_ATTACK_RANGE = "SHOW_ATTACK_RANGE", // 显示射程圆圈
    HIDE_ATTACK_RANGE = "HIDE_ATTACK_RANGE", // 隐藏射程圆圈

    //局外科技树
    BASE_HP_EMPTY = "BASE_HP_EMPTY", // 🌟 新增：基地空血警告，呼叫急救！
    META_UPGRADED = "META_UPGRADED", //科技树对应的科技能力升级
    OPEN_META = "OPEN_META",  // 🌟 新增：科技树界面打开事件
    
    //**************网络事件
    TOKEN_EXPIRED = "TOKEN_EXPIRED", // 🌟 新增：网络请求失败，提示重新登录
    NETWORK_ERROR = "NETWORK_ERROR", // 网络错误
    
    
    //*****资源加载
    /** 战斗资源预加载进度 */
    BATTLE_PRELOAD_PROGRESS = "BATTLE_PRELOAD_PROGRESS",
    /** 战斗资源预加载完成 */
    BATTLE_PRELOAD_COMPLETE = "BATTLE_PRELOAD_COMPLETE",

    BUNDLE_RELEASED = "BUNDLE_RELEASED",


    //----重构合成区
    TEST_SPAWN_NEW_ORB = "TEST_SPAWN_NEW_ORB",
    COMBO_TRIGGERED = "COMBO_TRIGGERED", // 🌟 新增：连击爆发事件

    // 🌟 新增：合成区专属拖拽事件
    ORB_DRAG_START = "ORB_DRAG_START",
    ORB_DRAG_MOVE = "ORB_DRAG_MOVE",
    ORB_DRAG_END = "ORB_DRAG_END",

    //----重构合成区商业化
    BOARD_IS_FULL = "BOARD_IS_FULL",       // 🌟 槽位满了，呼叫 UI 弹广告
    ADD_TEMP_SLOT = "ADD_TEMP_SLOT",       // 🌟 广告看完了，通知系统加槽位

    // 🌟 新增：特效预览器专用事件
    DEBUG_PLAY_FX = "DEBUG_PLAY_FX",
    DEBUG_STOP_FX = "DEBUG_STOP_FX",
    PREVIEW_EFFECT = "PREVIEW_EFFECT",
    
    //清理战斗材质
    CLEANUP_BATTLE_MATERIALS = "CLEANUP_BATTLE_MATERIALS",

    // 🌟 新增：波次 FSM 状态切换事件
    WAVE_PREP_START = "WAVE_PREP_START",     // 进入备战阶段 (UI 监听弹倒计时，Tower 监听停火)
    WAVE_COMBAT_START = "WAVE_COMBAT_START", // 进入战斗阶段 (Tower 监听开火)
    WAVE_PAUSED_START = "WAVE_PAUSED_START", // 进入挂起阶段 (用于广告等)

    MERCHANT_GIFT_ORB = "MERCHANT_GIFT_ORB", // 拉起商人广告面板

    ORB_MOUNT_SUCCESS = "ORB_MOUNT_SUCCESS", // 🌟 玩家行为事件：球成功安放在塔座上

    WAVE_CLEAR_SETTLEMENT = "WAVE_CLEAR_SETTLEMENT", // 🌟 波次绝对清场结算

    SACRIFICE_ALL_ENERGY = "SACRIFICE_ALL_ENERGY", // 🌟 新增：破釜沉舟！全场法球强制力竭指令
    SPAWN_FREE_ADVANCED_ORB= "SPAWN_FREE_ADVANCED_ORB", // 🌟 新增：免费高级球

    // 🌟 战役A新增：文明系统事件
    CIVILIZATION_EXP_ADD = "CIVILIZATION_EXP_ADD",     // 获得文明经验
    CIVILIZATION_LEVEL_UP = "CIVILIZATION_LEVEL_UP",   // 文明等级提升
    CIVILIZATION_TECH_UPGRADED = "CIVILIZATION_TECH_UPGRADED", // 科技升级完成


    // 🌟 纪元更替与内存管理事件--针对怪物
    EPOCH_PRELOAD_START = "EPOCH_PRELOAD_START", // 嗅探预热下一纪元
    EPOCH_SAFE_RELEASE = "EPOCH_SAFE_RELEASE",   // 嗅探释放上一纪元


    OPEN_OFFLINE_REWARD = "OPEN_OFFLINE_REWARD", // 🌟 新增：主动打开离线收益
    OPEN_CODEX = "OPEN_CODEX",                   // 🌟 新增：打开图鉴系统
    OPEN_SETTING = "OPEN_SETTING",               // 🌟 新增：打开设置界面

    // 🌟 图鉴与里程碑弹窗事件
    SHOW_UNLOCK_UI = "SHOW_UNLOCK_UI",         // 触发解锁弹窗
    RESUME_MERGE_DROP = "RESUME_MERGE_DROP",   // 弹窗关闭，唤醒球继续落位
    TRIGGER_BULLET_TIME = "TRIGGER_BULLET_TIME", // 🌟 预留给实战的子弹时间事件
    SHOW_AOE_UNLOCK_UI = "SHOW_AOE_UNLOCK_UI", // 🌟 实战首次触发AOE的子弹时间

    // 🌟 [新增] 局内仙灵与 Boss 结晶结算事件
    SPAWN_FAIRY_EVENT = "SPAWN_FAIRY_EVENT",
    DESPAWN_FAIRY_EVENT = "DESPAWN_FAIRY_EVENT",
    BOSS_KILL_SETTLEMENT = "BOSS_KILL_SETTLEMENT",

    GUIDE_SKILL_CLICKED = "GUIDE_SKILL_CLICKED",
    ORB_RECYCLED = "ORB_RECYCLED", // 🌟 新增：法球被成功回收事件
    // 🌟 新增：仙灵精力回满特效事件
    FAIRY_ENERGY_REFILL = "FAIRY_ENERGY_REFILL",
    GRANT_FAIRY_REWARD = "GRANT_FAIRY_REWARD", // 🌟 新增：由 UI 触发的仙灵发奖事件

    SHOW_UPGRADE_EFFECT = "SHOW_UPGRADE_EFFECT", // 🌟 新增：触发元素升级特效
    /** 元素第一次上塔提示事件 */
    SHOW_FIRST_MOUNT_TIP = "SHOW_FIRST_MOUNT_TIP",
}

// ✅ 定义数据键值枚举
export enum DataKey {
    GOLD = "GOLD",             // 金币
    IN_MATCH_COIN = "IN_MATCH_COIN", // 🌟 新增：局内造塔银币 (单局重置)
    
    
    DIAMOND = "DIAMOND",       // 钻石
    PLAYER_LEVEL = "PLAYER_LEVEL", // 玩家等级
    IS_MUSIC_ON = "IS_MUSIC_ON",   // 音乐开关
    SETTING_BGM = "SETTING_BGM",
    LAST_AD_DATE = "LAST_AD_DATE", // 今日广告日期
    DAILY_AD_COUNT = "DAILY_AD_COUNT", // 今日广告次数
    BAG_DATA = "BAG_DATA", // ✅ 新增：用于存储背包字典

    
    BASE_HP = "BASE_HP",// 👇 新增：基地血量

    // 🌟 新增：关卡数据
    CUR_LEVEL = "CUR_LEVEL",   // 当前正在打的关卡 ID
    MAX_LEVEL = "MAX_LEVEL",   // 玩家解锁到的最大关卡 ID
    UI_GOLD_WORLD_POS = "UI_GOLD_WORLD_POS", // 顶部金币UI的靶心坐标

    BASE_HP_LV = "BASE_HP_LV",  // 👇 新增：基地血量等级
    IS_PAUSED = "IS_PAUSED",   // 画面暂停状态

    IS_GUIDE_COMPLETED = "IS_GUIDE_COMPLETED", // 🌟 专属新手引导标记
    TIME_SCALE  = "TIME_SCALE", // 时间缩放

    // 🌟 新增：独立 UI 交互音效开关
    IS_UI_SOUND_ON = "IS_UI_SOUND_ON",
    // 🌟 新增：大厅背景音乐偏好 (0: MAIN_MENU, 1: DATING_1)
    SELECTED_BGM_INDEX = "SELECTED_BGM_INDEX",

    // 🌟 [新增] 模块一：记录玩家历史合成达到的最高法球等级 (用于动态召唤抽卡)
    MAX_UNLOCKED_LEVEL = "MAX_UNLOCKED_LEVEL",

    // 🌟 [新增] 严格声明：合成保护符的持久化键值
    MERGE_PROTECT_TICKET = "MERGE_PROTECT_TICKET",

    CIV_CRYSTAL = "CIV_CRYSTAL", // 文明结晶 (Boss掉落)
    CIV_TOTAL_EXP = "CIV_TOTAL_EXP", // 🌟 新增：文明总经验
    CIV_LEVEL = "CIV_LEVEL",         // 🌟 新增：当前文明等级

    MATCH_SURVIVED_WAVE = "MATCH_SURVIVED_WAVE",   // 单局生存波次
    MATCH_KILL_COUNT = "MATCH_KILL_COUNT",         // 单局击杀数
    MATCH_EXP_EARNED = "MATCH_EXP_EARNED",         // 单局文明经验累计
    MATCH_CRYSTAL_EARNED = "MATCH_CRYSTAL_EARNED", // 单局文明结晶累计

    LAST_ONLINE_TIMESTAMP = "LAST_ONLINE_TIMESTAMP", // 玩家上次切入后台的绝对毫秒时间戳

    // 🌟 图鉴持久化存储键值 (存储为 string 数组)
    UNLOCKED_CODEX = "UNLOCKED_CODEX",

    // 🌟 [新增] P0级架构核心：全局主线绝对波次进度（参与 SaveManager 自动持久化）
    CURRENT_WAVE_PROGRESS = "CURRENT_WAVE_PROGRESS",

    CIV_TECH_DATA = "CIV_TECH_DATA", // 🌟 新增：科技树等级数据池

    ACCEL_EXPIRE_TIMESTAMP = "ACCEL_EXPIRE_TIMESTAMP", // 🌟 新增：加速到期绝对时间戳 (毫秒)

    LAST_SHARE_DATE = "LAST_SHARE_DATE",       // 🌟 记录上次分享领奖的日期
    DAILY_SHARE_COUNT = "DAILY_SHARE_COUNT",   // 🌟 今日已通过分享领奖的次数

    // 🌟 [新增] 文明快速冥想相关键值
    LAST_MEDITATION_DATE = "LAST_MEDITATION_DATE",
    DAILY_MEDITATION_COUNT = "DAILY_MEDITATION_COUNT",

    // 👇 新增：用于切断循环依赖的运行时波次探针
    CUR_WAVE_INDEX = "CUR_WAVE_INDEX",
    CUR_MONSTER_STAGE = "CUR_MONSTER_STAGE",

    // 🌟 [新增] 复活分享相关持久化键值
    LAST_REVIVE_SHARE_DATE = "LAST_REVIVE_SHARE_DATE",   // 最后一次复活分享的日期
    DAILY_REVIVE_SHARE_COUNT = "DAILY_REVIVE_SHARE_COUNT", // 今日复活分享次数

    /** 记录已经上过塔的元素等级标记数组 (string[])，如 ["mounted_1_2", "mounted_2_5"] */
    MOUNTED_ELEMENT_TAGS = "MOUNTED_ELEMENT_TAGS",
}

export enum ConfigName {
    SHOP = "shop",
    HERO = "hero",
}

//元素类型
export enum ElementType {
    None = 0,
    Fire = 1,
    Water = 2,
    Wind = 3,
    Earth = 4
}

// 怪物攻击类型
export enum AttackType {
    Melee = 0,   // 近战自爆（走到终点扣血）
    Ranged = 1   // 远程停步攻击（预留）
}

// 1. 新增飘字类型枚举 (放在文件顶部或与其他 enum 在一起)
export enum ToastType {
    DEFAULT = 0, // 默认白色
    WARNING = 1, // 警告红色
    INFO = 2,    // 奖励/提示黄色
    FIRE = 3,    // 火元素红橙色
    WATER = 4,   // 水元素浅蓝色
    WIND = 5,    // 风元素青绿色
    EARTH = 6    // 土元素棕黄色
}

// ✅ 核心：定义每个事件对应的参数类型！
export interface EventPayloadMap {
    [EventName.GAME_START]: void;              // 不需要参数
    [EventName.GOLD_CHANGED]: { old: number, news: number }; // 复杂对象
    [EventName.RED_DOT_UPDATE]: { path: string, value: number };        // 单一数字


    // 兼容旧版传 string，以及新版传带类型的对象
    [EventName.SHOW_TOAST]: string | { msg: string, type: ToastType };
    [EventName.SHOW_BROADCAST]: string | BroadcastPayload;
    
    [EventName.LANGUAGE_CHANGED]: void;
    [EventName.MAIN_MENU_CLICK]: void;
    [EventName.MAIN_MENU_UPDATE]: number; // 比如更新点击次数
    [EventName.OPEN_SHOP]: void;
    [EventName.OPEN_SANDBOX]: void;
    [EventName.OPEN_BAG]: void;
    // 🌟 新增：强制约束 LEVEL_WIN 发送的数据必须包含 levelId 和 rewardGold，且必须为 number
    [EventName.LEVEL_WIN]: { levelId: number, rewardGold: number };
    [EventName.LEVEL_DEFEAT]: void;
    
    [EventName.MERGE_DATA_CHANGED]: void;

    // 🌟 重构：大招机制全面升维，告别魔法字符串
    [EventName.TRIGGER_SKILL_EFFECT]: {
        damage: number,        // 基础爆发伤害
        elementType: number,   // 主导元素 (1:火, 2:水, 3:风, 4:土)
        effectStr: string,     // 传给表现层的 Shader 匹配字符串
        duration: number,      // 控制时长 (减速/眩晕/黑洞维持时间)
        dotValue: number,      // 燃烧 DOT 每秒真实伤害 (仅火系生效)
        radius: number         // 物理影响半径 (黑洞吸引半径)
    };
    [EventName.SPAWN_DAMAGE_TEXT]: { worldPos: Vec3, damage: number, type: number, element: number, depthScale: number };
    

    [EventName.MONSTER_DEAD_DROP]: { worldPos: any, amount: number };
    [EventName.LEVEL_STARTED]: any;  // 🌟 新增：附带关卡 Config 数据
    [EventName.TOWER_FIRE]: number;

    [EventName.SHOW_WAVE_BANNER]: number;
    [EventName.UPDATE_WAVE_PROGRESS]: { current: number, total: number };
    [EventName.SHOW_ATTACK_RANGE]: { pos: Vec3, radius: number };
    [EventName.HIDE_ATTACK_RANGE]: void;
    
    //局外科技树
    [EventName.BASE_HP_EMPTY]: void;
    [EventName.META_UPGRADED]: number;
    [EventName.OPEN_META]: void;
    
    //*****网络
    [EventName.TOKEN_EXPIRED]: void;
    [EventName.NETWORK_ERROR]: { url: string, err: any };
    
    //***资源加载
    [EventName.BATTLE_PRELOAD_PROGRESS]: {
        progress: number;      // 0.0 ~ 1.0
        currentStep: string;   // 当前步骤描述
        finished: number;      // 已完成数量
        total: number;         // 总数量
    };
    [EventName.BATTLE_PRELOAD_COMPLETE]: void;
    
    [EventName.BUNDLE_RELEASED]: string;


    //----重构合成区
    [EventName.TEST_SPAWN_NEW_ORB]: void;
    [EventName.COMBO_TRIGGERED]: number;

    // 🌟 新增：拖拽事件的强类型载荷规范
    [EventName.ORB_DRAG_START]: { ball: any, touch: any };
    [EventName.ORB_DRAG_MOVE]:  { ball: any, touch: any };
    [EventName.ORB_DRAG_END]:   { ball: any, touch: any };

    //----重构合成区商业化
    [EventName.BOARD_IS_FULL]: void;
    [EventName.ADD_TEMP_SLOT]: void;
    
    [EventName.DEBUG_PLAY_FX]: { type: number,
        config: any,
        radius: number,
        count: number,
        loop: boolean };
    [EventName.DEBUG_STOP_FX]: void;
    [EventName.PREVIEW_EFFECT]: { type: number,
        config: any,
        radius: number,
        count: number,
        loop: boolean };
    
    //清理战斗材质
    [EventName.CLEANUP_BATTLE_MATERIALS]: void;

    // 🌟 新增：对应的载荷规范
    [EventName.WAVE_PREP_START]: { waveIndex: number, duration: number }; // 携带第几波、备战秒数
    [EventName.WAVE_COMBAT_START]: { waveIndex: number };
    [EventName.WAVE_PAUSED_START]: void;

    // 🌟 核心修正：严格约束商人发货事件必须携带属性与等级参数
    [EventName.MERCHANT_GIFT_ORB]: { element: number, level: number };
    [EventName.ORB_MOUNT_SUCCESS]: void;   
    [EventName.WAVE_CLEAR_SETTLEMENT]: {waveIndex: number};

    [EventName.SACRIFICE_ALL_ENERGY]: void; // 🌟 新增：无参数载荷
    [EventName.SPAWN_FREE_ADVANCED_ORB]: void; // 🌟 新增：无参数载荷

    // 🌟 战役A新增：文明系统事件
    [EventName.CIVILIZATION_EXP_ADD]:{ added: number, total: number };
    [EventName.CIVILIZATION_LEVEL_UP]: { level: number };
    [EventName.CIVILIZATION_TECH_UPGRADED]: { techType: number, level: number };

    // 🌟 纪元更替与内存管理载荷
    [EventName.EPOCH_PRELOAD_START]: { bundleName: string };
    [EventName.EPOCH_SAFE_RELEASE]: { bundleName: string, maxStage: number };

    [EventName.OPEN_OFFLINE_REWARD]: void;
    [EventName.OPEN_CODEX]: void
    [EventName.OPEN_SETTING]: void; // 🌟 新增：设置界面无参数载荷

    // 强类型约束：解锁弹窗需要知道是什么突破，以及把被定格的球传过去
    [EventName.SHOW_UNLOCK_UI]: {
        element: number,
        level: number,           // ✅ 新增：当前法球的绝对等级 (如 15)
        tier: number,            // 阶级 (如 3)
        isFirstTierBreakthrough: boolean,
        unlockedTags: string[],
        ball: any
    };
    [EventName.RESUME_MERGE_DROP]: { ball: any };
    [EventName.TRIGGER_BULLET_TIME]: { duration: number, msg: string };
    [EventName.SHOW_AOE_UNLOCK_UI]: {
        element: number,
        aoeLevel: number
    };

    // 🌟 [新增] 载荷映射
    [EventName.SPAWN_FAIRY_EVENT]: { fairyType: number, duration: number };
    [EventName.DESPAWN_FAIRY_EVENT]: void;
    [EventName.BOSS_KILL_SETTLEMENT]: { waveIndex: number, baseCrystals: number };

    [EventName.GUIDE_SKILL_CLICKED]: void;
    [EventName.ORB_RECYCLED]: void; // 🌟 新增：无参数载荷

    // 🌟 新增：无载荷参数
    [EventName.FAIRY_ENERGY_REFILL]: void;
    [EventName.GRANT_FAIRY_REWARD]: { fairyType: number };

    // 🌟 严格对齐要求：必须带 元素 + 等级 + 阶段 + 位置
    [EventName.SHOW_UPGRADE_EFFECT]: {
        element: number;  // 元素类型 (ElementType)
        level: number;    // 当前等级 (如 15)
        tier: number;     // 所属阶段 (如 T4)
        worldPos: Vec3;   // 合成触发的世界坐标位置
    };

    [EventName.SHOW_FIRST_MOUNT_TIP]: {
        element: ElementType;
        level: number;
    };
}

// ✅ 定义每个数据键值对应的真实类型
export interface DataPayloadMap {
    [DataKey.GOLD]: number;
    [DataKey.DIAMOND]: number;
    [DataKey.PLAYER_LEVEL]: number;
    [DataKey.IS_MUSIC_ON]: boolean;
    [DataKey.SETTING_BGM]: boolean;
    [DataKey.LAST_AD_DATE]: string;
    [DataKey.DAILY_AD_COUNT]: number;
    [DataKey.BAG_DATA]: { [key: string]: number };
    [DataKey.BASE_HP]: number;

    [DataKey.CUR_LEVEL]: number;
    [DataKey.MAX_LEVEL]: number;

    [DataKey.UI_GOLD_WORLD_POS]: any;
    [DataKey.BASE_HP_LV]: number;
    [DataKey.IS_PAUSED]: boolean;
    [DataKey.IN_MATCH_COIN]: number;

    [DataKey.IS_GUIDE_COMPLETED]: boolean;
    
    [DataKey.TIME_SCALE]: number;

    [DataKey.IS_UI_SOUND_ON]: boolean;   
    [DataKey.SELECTED_BGM_INDEX]: number; 

    // 🌟 [新增] 模块一：规定最高等级必须是数字类型
    [DataKey.MAX_UNLOCKED_LEVEL]: number;
    // 🌟 [新增] 严格类型约束：保护符数量必须是 number 类型
    [DataKey.MERGE_PROTECT_TICKET]: number;
   
    [DataKey.CIV_CRYSTAL]: number;
    [DataKey.CIV_TOTAL_EXP]: number;
    [DataKey.CIV_LEVEL]: number;

    [DataKey.MATCH_SURVIVED_WAVE]: number;
    [DataKey.MATCH_KILL_COUNT]: number;
    [DataKey.MATCH_EXP_EARNED]: number;
    [DataKey.MATCH_CRYSTAL_EARNED]: number;

    [DataKey.LAST_ONLINE_TIMESTAMP]: number;

    [DataKey.UNLOCKED_CODEX]: string[]; // 严格约束为字符串数组

    // 🌟 [新增] 强制约束绝对波次进度必须为 number 类型
    [DataKey.CURRENT_WAVE_PROGRESS]: number;

    [DataKey.CIV_TECH_DATA]: { [key: number]: number }; // 🌟 强类型：字典结构

    [DataKey.ACCEL_EXPIRE_TIMESTAMP]: number;

    [DataKey.LAST_SHARE_DATE]: string;
    [DataKey.DAILY_SHARE_COUNT]: number;

    // 🌟 [新增] 数据类型约束
    [DataKey.LAST_MEDITATION_DATE]: string;
    [DataKey.DAILY_MEDITATION_COUNT]: number;

    // 👇 新增：强类型声明
    [DataKey.CUR_WAVE_INDEX]: number;
    [DataKey.CUR_MONSTER_STAGE]: number;

    [DataKey.LAST_REVIVE_SHARE_DATE]: string;
    [DataKey.DAILY_REVIVE_SHARE_COUNT]: number;

    [DataKey.MOUNTED_ELEMENT_TAGS]: string[];
}

// 🌟 新增：广告点位枚举
export enum AdPlacement {
    BATTLE_REVIVE = "BATTLE_REVIVE",                         // 战斗类_复活: 基地满血复活
    BATTLE_ULTIMATE_BOOST = "BATTLE_ULTIMATE_BOOST",         // 战斗类_强化: 大招狂暴
    BATTLE_EXPAND_SLOT = "BATTLE_EXPAND_SLOT",               // 战斗类_强化: 法阵槽位扩容
    BATTLE_MERCHANT_GIFT = "BATTLE_MERCHANT_GIFT",           // 战斗类_强化: 神秘商人法球
    BATTLE_FAIRY_SUPPLY = "BATTLE_FAIRY_SUPPLY",             // 战斗类_补给: 仙灵补给
    SETTLEMENT_CRYSTAL_DOUBLE = "SETTLEMENT_CRYSTAL_DOUBLE", // 局外收益: 结晶翻倍
    TECH_MEDITATION = "TECH_MEDITATION",                     // 局外收益: 文明快速冥想
    BATTLE_SPEED_2X = "BATTLE_SPEED_2X",                     // 局外收益: 战斗加速2.0x
    OFFLINE_PROFIT_DOUBLE = "OFFLINE_PROFIT_DOUBLE"          // 离线收益: 离线收益翻倍
}

// 🌟 新增：广告点位与微信 adUnitId 映射表
export const AD_UNIT_MAP: Record<AdPlacement, string> = {
    [AdPlacement.BATTLE_REVIVE]: "adunit-2dfb9b5c3c3b3f34",
    [AdPlacement.BATTLE_ULTIMATE_BOOST]: "adunit-d1aa4d5784e87278",
    [AdPlacement.BATTLE_EXPAND_SLOT]: "adunit-d1aa4d5784e87278",
    [AdPlacement.BATTLE_MERCHANT_GIFT]: "adunit-d1aa4d5784e87278",
    [AdPlacement.BATTLE_FAIRY_SUPPLY]: "adunit-047d4938a09137ec",
    [AdPlacement.SETTLEMENT_CRYSTAL_DOUBLE]: "adunit-d48f2315e7f47193",
    [AdPlacement.TECH_MEDITATION]: "adunit-d48f2315e7f47193",
    [AdPlacement.BATTLE_SPEED_2X]: "adunit-d48f2315e7f47193",
    [AdPlacement.OFFLINE_PROFIT_DOUBLE]: "adunit-607783990555eb63"
};
//跑马灯事件负载
export interface BroadcastPayload {
    msg: string;
    durationSec?: number;    // 显示持续几秒
    interruptEvent?: string; // 监听哪个事件打断
}