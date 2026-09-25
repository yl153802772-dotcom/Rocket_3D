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

/**
 * @module IRenderAdapter
 * @description
 * 2D/3D 通用渲染适配层。
 * 将对象池复用时的表现层清理逻辑（材质、刚体、骨骼动画等）与对象池核心调度逻辑解耦。
 */
import { Node, Sprite, MeshRenderer, RigidBody, SkeletalAnimation } from 'cc';

export interface IRenderAdapter {
    /** 节点复用前，洗去残留的材质变体、物理动量与表现层状态 */
    resetInstance(node: Node): void;
    /** 节点彻底销毁时，清理深层渲染代理与材质引用 */
    disposeInstance(node: Node): void;
}

export class SpriteRenderAdapter implements IRenderAdapter {
    public resetInstance(node: Node): void {
        const sprite = node.getComponent(Sprite);
        if (sprite) {
            sprite.customMaterial = null;
            sprite.color.set(255, 255, 255, 255);
        }
    }

    public disposeInstance(node: Node): void {
        // 2D 节点销毁一般由引擎自动接管底层资源
    }
}

export class MeshRenderAdapter implements IRenderAdapter {
    public resetInstance(node: Node): void {
        // 1. 重置 3D 物理引擎动量残留，防止复用时怪物瞬间飞出地图
        const rigidBody = node.getComponent(RigidBody);
        if (rigidBody) {
            rigidBody.clearState();
            rigidBody.clearForces();
            rigidBody.clearVelocity();
        }

        // 2. 重置骨骼动画状态
        const skeleton = node.getComponent(SkeletalAnimation);
        if (skeleton) {
            skeleton.stop();
        }

        // 3. 剥离动态材质实例引用，防止变色/发光状态残留污染下一个复用对象
        const meshes = node.getComponentsInChildren(MeshRenderer);
        meshes.forEach(mesh => {
            // 在实际高阶 3D 业务中，此处应将申请的 MaterialInstance 交还给资源管理器
            // 此处重置顶点颜色通道作为基础防污染兜底
            mesh.setInstancedAttribute('a_color', [1, 1, 1, 1]);
        });
    }

    public disposeInstance(node: Node): void {
        // 若业务层动态实例化了 Material，此处需通知 ResManager 释放该材质的动态分配内存
    }
}