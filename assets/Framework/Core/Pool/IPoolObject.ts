/**
 * IPoolObject.ts
 * 作用：游戏实体对象池生命周期接口
 */
export interface IPoolObject {
    /**
     * 当从对象池中取出（或新实例化）时调用
     * @param data 外部传入的初始化数据（如：子弹的伤害值、发射方向）
     */
    onSpawn?(data?: any): void;

    /**
     * 当被回收到对象池时调用
     * 用于重置自身状态（如：清空引用、停止特效、重置血量），防止脏数据污染
     */
    onRecycle?(): void;
}