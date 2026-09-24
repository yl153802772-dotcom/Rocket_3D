/**
 * AudioConst.ts
 * 作用：全局音频资源路径枚举（数据字典）
 * 规范：所有路径必须相对于 audio 分包的根目录
 */

export const AUDIO_BUNDLE = "audio";
/**
 * 🌟 新增：音效功能模块分类枚举
 */
export enum AudioCategory {
    UI = "UI",                 // 通用界面交互点击、按钮
    MERGE = "MERGE",           // 法阵合成、球体抓取、高抛落位
    TOWER = "TOWER",           // 防御塔充能、开火、灌注
    BATTLE = "BATTLE",         // 怪物受击、死亡、基地受损
    EPIC = "EPIC"              // 全屏大招与觉醒技能
}

// 1. 背景音乐 (BGM)
export enum BGM_PATH {
    MAIN_MENU = "sfx/ui/dating2",   // 主界面/大厅
    BATTLE_1 = "sfx/ui/BattleBGM1",    // 战斗场景1
    BATTLE_2 = "sfx/ui/BattleBGM2",    // 战斗场景2
    BATTLE_3 = "sfx/ui/BattleBGM3",    // 战斗场景3
    BATTLE_BOSS = "sfx/ui/bgm_boss",      // Boss战
    DATING_1 = "sfx/ui/dating1",          //大厅1
    DATING_2 = "sfx/ui/dating2",          //大厅1
}

// 2. UI 交互音效 (不受战术暂停影响)
export enum SFX_UI_PATH {
    BTN_CLICK = "sfx/ui/btn3",             // 普通按钮点击
    BTN_CANCEL = "sfx/ui/CommonBtn",           // 取消/关闭界面
    MERGE_SUCCESS = "sfx/ui/ui_merge_success", // 元素合成成功 (极其重要，需要爽感)
    MERGE_FAIL = "sfx/ui/ui_merge_fail",       // 合成失败/槽位满
    ORB_PICKUP = "sfx/ui/ui_orb_pickup",       // 拖拽拿起元素球
    ORB_DROP = "sfx/ui/ui_orb_drop",           // 飞回槽位
    UPGRADE = "sfx/ui/ui_upgrade",             // 塔防升级/飞升
    GOLD_DROP = "sfx/ui/ui_gold_drop",         // 金币掉落入袋
    STYCAL_DROP = "sfx/ui/WMJJget",         // 文明水晶入袋

    MERGE_UP_NEXT_LEVEL = "sfx/ui/ui_merge_up_next_level", // 合成升级到下一阶段 t1-t6
    
    AOE_TIPS = "sfx/ui/aoeTip",         // aoe激活提示
    ELEMENT_UPDATE = "sfx/ui/HightBallMergeAudio",         // 元素升级高阶提示音
    
    CAMP_DESTROY = "sfx/ui/campDestroy",         // 营地被毁
    DATING_SELECTED = "sfx/ui/datingSelect",     //大厅选择按钮
    
    GG_WATCH = "sfx/ui/GuanggaoWatch",     //广告完成回调
    
    HIGHT_BALL_MERGE = "sfx/ui/HightBallMergeAudio",     //高级球合并成功提示UI音
    OFFLINE_UI = "sfx/ui/offelineUI",     //离线收益弹框UI
    
    RECYLE_BALL  = "sfx/ui/RecrleAudio",     //回收元素球声音
    SKILL_UP_BTN  = "sfx/ui/SkillUpBtn",     // 科技树技能升级按钮音
    
    WM_UPDATE  = "sfx/ui/WMUpdate",     //文明升级音效
    NEW_WAVE_TIPS = "sfx/ui/NewWaveTips",     //新波次提示音
    
}

// 3. 战斗音效 (受战术暂停与倍速控制)
export enum SFX_BATTLE_PATH {
    // 元素攻击声 5 /10 /15 级声音
    ATK_FIRE = "sfx/battle/fire1",          // 火系：爆裂/轰鸣
    ATK_FIRE_5 = "sfx/battle/fire1",          // 火系：爆裂/轰鸣
    ATK_FIRE_10 = "sfx/battle/fire1",          // 火系：爆裂/轰鸣
    ATK_FIRE_15 = "sfx/battle/fire1",          // 火系：爆裂/轰鸣
    
    ATK_WATER = "sfx/battle/water1",        // 水系：水流/冰冻结晶
    ATK_WATER_5 = "sfx/battle/water1",        // 水系：水流/冰冻结晶
    ATK_WATER_10 = "sfx/battle/water1",        // 水系：水流/冰冻结晶
    ATK_WATER_15 = "sfx/battle/water1",        // 水系：水流/冰冻结晶
    
    ATK_WIND = "sfx/battle/wind1",          // 风系：风刃/气流切割
    ATK_WIND_5 = "sfx/battle/wind1",          // 风系：风刃/气流切割
    ATK_WIND_10 = "sfx/battle/wind1",          // 风系：风刃/气流切割
    ATK_WIND_15 = "sfx/battle/wind1",          // 风系：风刃/气流切割
    
    ATK_EARTH = "sfx/battle/earth1",        // 土系：岩石震击/沉闷撞击
    ATK_EARTH_5 = "sfx/battle/earth1",        // 土系：岩石震击/沉闷撞击
    ATK_EARTH_10 = "sfx/battle/earth1",        // 土系：岩石震击/沉闷撞击
    ATK_EARTH_15 = "sfx/battle/earth1",        // 土系：岩石震击/沉闷撞击

    // 受击与怪物
    HIT_COMMON = "sfx/battle/hit_common",      // 普通受击反馈
    MONSTER_DIE = "sfx/battle/monster_die",    // 怪物死亡消散
    BASE_HURT = "sfx/battle/atk_water",        // 玩家老家被攻击警告

    // 塔防状态
    TOWER_EXHAUST = "sfx/battle/tower_exhaust",// 塔防力竭熄灭的提示音

    // 🌟 追加上塔反馈音效
    TOWER_INFUSE = "sfx/battle/tower_infuse",               // 满血/有精力时，上塔的能量灌注声
    TOWER_MOUNT_EXHAUSTED = "sfx/battle/tower_mount_exhausted", // 精力耗尽时，上塔的死寂/沉闷声
    
    
}
//大招音乐
export enum SFX_BATTLE_EPIC {
    EPIC_WATER = "sfx/battle/waterBig", // 水系大招
    EPIC_FIRE = "sfx/battle/fireBig", // 火系大招
    EPIC_EARTH = "sfx/battle/earthBig", // 土系大招
    EPIC_WIND = "sfx/battle/wind_Big", // 风系大招
}