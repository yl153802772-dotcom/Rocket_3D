/**
 * @module IPoolObject
 * @description
 * [模块逻辑]
 * 游戏业务层实体生命周期接口。
 * 与 Core 层的 IRenderAdapter 不同，本接口专用于游戏业务逻辑的状态洗爆。
 *
 * [调用规则]
 * 1. 任何需要被频繁复用的业务组件（如 BulletCmp, MonsterCmp）均需实现此接口。
 * 2. 禁止在此接口中处理纯渲染层面的清理（如材质、拖尾重置），这应交由 IRenderAdapter 统一处理，保持逻辑与表现的解耦。
 */
export interface IPoolObject {
    /**
     * 当从对象池中取出（或新实例化），并且完成渲染层重置后调用
     * @param data 外部传入的初始化数据（如：子弹的伤害值、发射方向）
     */
    onSpawn?(data?: any): void;

    /**
     * 当准备被回收到对象池，在断开渲染与物理状态前调用
     * 用于重置自身状态（如：清空锁定的目标引用、重置血量变量），防止脏数据引发下一次内存泄漏
     */
    onRecycle?(): void;
}