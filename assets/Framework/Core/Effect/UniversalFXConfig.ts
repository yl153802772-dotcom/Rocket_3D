// Framework/Core/Effect/UniversalFXConfig.ts

export interface UniversalFXConfig {
    // 基础全局倍率
    speedMul: number;        // 整体播放速度倍率
    scaleMul: number;        // 整体缩放倍率

    // 主元素爆发配置 (对应火、水等)
    mainPrefab: string;      // 元素预制体名 (如 "fx_fire_main")
    mainDuration: number;    // 持续时间
    mainScaleStart: number;  // 起始缩放
    mainScaleEnd: number;    // 结束缩放

    // 行为修饰器
    downOffset: number;      // 下砸偏移量 (产生厚重感)
    rotateSpeed: number;     // 旋转速度 (流体感)
    spiralStrength: number;  // 螺旋强度 (拉丝感)

    // 震动与爆发
    burstScale: number;      // 核心光和冲击环的爆发倍率
    shakeStrength: number;   // 震屏力度 (0 为不震)

    // 🌟 补漏：爆发前的停顿时间 (用于土系厚重感)
    preBurstDelay: number;

    // ==========================================
    // 🌟 架构升维新增：商业化极简与 2.5D 透视修饰器
    // ==========================================
    isMinimal?: boolean;         // 极简装配开关：设为 true 时，剥离前置聚拢与后置火花工序
    perspectiveRatio?: number;   // 2.5D 透视率：用于纠正贴地特效（如冲击环）的Y轴变形
}

// 🌟 0 GC 兜底常量：防止业务层没传配置时报错
export const DEFAULT_UNIVERSAL_FX_CONFIG: Readonly<UniversalFXConfig> = {
    speedMul: 1.0, scaleMul: 1.0,
    mainPrefab: "", mainDuration: 0.2, mainScaleStart: 0.5, mainScaleEnd: 2.5,
    downOffset: 0, rotateSpeed: 0, spiralStrength: 0,
    burstScale: 1.0, shakeStrength: 5.0, preBurstDelay: 0.0,

    // 默认关闭极简，默认透视为 1.0 (纯2D模式)，绝对保证向前兼容！
    isMinimal: false, perspectiveRatio: 1.0
};