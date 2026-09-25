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
    
    
    //**************网络事件
    TOKEN_EXPIRED = "TOKEN_EXPIRED", // 🌟 新增：网络请求失败，提示重新登录
    NETWORK_ERROR = "NETWORK_ERROR", // 网络错误
    
    
    //*****资源加载
  

    //----重构合成区
  
}

// ✅ 定义数据键值枚举
export enum DataKey {
    GOLD = "GOLD",             // 金币
  
    PLAYER_LEVEL = "PLAYER_LEVEL", // 玩家等级
    IS_MUSIC_ON = "IS_MUSIC_ON",   // 音乐开关
    SETTING_BGM = "SETTING_BGM",
    LAST_AD_DATE = "LAST_AD_DATE", // 今日广告日期
    DAILY_AD_COUNT = "DAILY_AD_COUNT", // 今日广告次数
    BAG_DATA = "BAG_DATA", // ✅ 新增：用于存储背包字典

    

    // 🌟 新增：关卡数据
    CUR_LEVEL = "CUR_LEVEL",   // 当前正在打的关卡 ID
    MAX_LEVEL = "MAX_LEVEL",   // 玩家解锁到的最大关卡 ID
    UI_GOLD_WORLD_POS = "UI_GOLD_WORLD_POS", // 顶部金币UI的靶心坐标

    IS_PAUSED = "IS_PAUSED",   // 画面暂停状态

    IS_GUIDE_COMPLETED = "IS_GUIDE_COMPLETED", // 🌟 专属新手引导标记
    TIME_SCALE  = "TIME_SCALE", // 时间缩放

    // 🌟 新增：独立 UI 交互音效开关
    IS_UI_SOUND_ON = "IS_UI_SOUND_ON",
    // 🌟 新增：大厅背景音乐偏好 (0: MAIN_MENU, 1: DATING_1)
    SELECTED_BGM_INDEX = "SELECTED_BGM_INDEX",
    

    ACCEL_EXPIRE_TIMESTAMP = "ACCEL_EXPIRE_TIMESTAMP", // 🌟 新增：加速到期绝对时间戳 (毫秒)

    LAST_SHARE_DATE = "LAST_SHARE_DATE",       // 🌟 记录上次分享领奖的日期
    DAILY_SHARE_COUNT = "DAILY_SHARE_COUNT",   // 🌟 今日已通过分享领奖的次数
    
    

    // 🌟 [新增] 复活分享相关持久化键值
    LAST_REVIVE_SHARE_DATE = "LAST_REVIVE_SHARE_DATE",   // 最后一次复活分享的日期
    DAILY_REVIVE_SHARE_COUNT = "DAILY_REVIVE_SHARE_COUNT", // 今日复活分享次数

    LAST_ONLINE_TIMESTAMP = "LAST_ONLINE_TIMESTAMP", // 🌟 记录玩家最后一次在线的绝对时间戳

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
   
    
    //*****网络
    [EventName.TOKEN_EXPIRED]: void;
    [EventName.NETWORK_ERROR]: { url: string, err: any };
    
    
}

// ✅ 定义每个数据键值对应的真实类型
export interface DataPayloadMap {
    [DataKey.GOLD]: number;
  
    [DataKey.PLAYER_LEVEL]: number;
    [DataKey.IS_MUSIC_ON]: boolean;
    [DataKey.SETTING_BGM]: boolean;
    [DataKey.LAST_AD_DATE]: string;
    [DataKey.DAILY_AD_COUNT]: number;
    [DataKey.BAG_DATA]: { [key: string]: number };
  

    [DataKey.CUR_LEVEL]: number;
    [DataKey.MAX_LEVEL]: number;

    [DataKey.UI_GOLD_WORLD_POS]: any;
   
    [DataKey.IS_PAUSED]: boolean;
  

    [DataKey.IS_GUIDE_COMPLETED]: boolean;
    
    [DataKey.TIME_SCALE]: number;

    [DataKey.IS_UI_SOUND_ON]: boolean;   
    [DataKey.SELECTED_BGM_INDEX]: number; 


    [DataKey.ACCEL_EXPIRE_TIMESTAMP]: number;

    [DataKey.LAST_SHARE_DATE]: string;
    [DataKey.DAILY_SHARE_COUNT]: number;
    
    [DataKey.LAST_REVIVE_SHARE_DATE]: string;
    [DataKey.DAILY_REVIVE_SHARE_COUNT]: number;
    
    [DataKey.LAST_ONLINE_TIMESTAMP]: number;
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