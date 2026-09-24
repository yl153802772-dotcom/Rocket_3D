/**
 * @module IRenderAdapter
 * @description
 * [模块逻辑]
 * 游戏对象池的渲染与物理适配层接口。
 * 用于隔离 2D/3D 渲染差异。解决 3D 节点在复用时，因 TrailRenderer（拖尾）、
 * ParticleSystem3D（粒子）、RigidBody（物理刚体）或材质实例未重置而导致的视觉和物理脏数据问题。
 *
 * [调用规则]
 * 1. 业务层在调用 GameObjectPool.registerPrefab 时，可根据预制体类型按需注入对应实现的 Adapter。
 * 2. 严禁在 Adapter 中编写任何游戏业务逻辑（如重置血量），此处仅限处理纯粹的底层组件状态恢复。
 */

import { Node } from 'cc';

export interface IRenderAdapter {
    /**
     * 当节点从对象池被取出，且已挂载到父节点、激活 active 后调用。
     * 推荐操作：清零刚体速度、还原材质实例默认参数、重启粒子系统。
     */
    onSpawn?(node: Node): void;

    /**
     * 当节点准备被回收到对象池，在从父节点移除前调用。
     * 推荐操作：强制清空 TrailRenderer 历史轨迹，停止粒子发射。
     */
    onRecycle?(node: Node): void;
}