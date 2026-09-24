/**
 * @module GameObjectPool
 * @description
 * [模块逻辑]
 * 游戏通用实体池。支持 2D/3D 节点的高频创建销毁管理。
 * 本次重构引入了 IRenderAdapter 渲染适配器体系，根治了 3D 对象复用时材质污染、物理刚体残留与拖尾拉丝的业界痛点。
 *
 * [调用规则]
 * 1. 3D 复杂对象在注册时，应注入对应的 IRenderAdapter 处理底层渲染状态重置。
 * 2. 节点回收（recycle）时，本模块会严格按照：停 Tween/动画 -> 触发业务 onRecycle -> 触发适配器 onRecycle -> 剥离父节点的安全时序执行。
 */

import { _decorator, Node, Prefab, instantiate, Vec3, Tween } from 'cc';
import { Logger, LogModule } from '../../../Framework/Core/Logger';
import { AnimationHelper } from '../AnimationHelper';
import { IRenderAdapter } from './IRenderAdapter';

export class GameObjectPool {
    private static _instance: GameObjectPool;
    public static get Instance(): GameObjectPool {
        if (!this._instance) this._instance = new GameObjectPool();
        return this._instance;
    }

    private _pools: Map<string, Node[]> = new Map();
    private _prefabs: Map<string, Prefab> = new Map();
    private _poolLimits: Map<string, number> = new Map();

    // ✅ 核心进化：引入渲染与物理适配器字典
    private _adapters: Map<string, IRenderAdapter> = new Map();

    private readonly DEFAULT_POOL_LIMIT: number = 100;

    /**
     * 预分配对象池
     * @param adapter 可选的 3D 渲染/物理重置适配器
     */
    public preAllocate(name: string, prefab: Prefab, initialCount: number = 10, adapter?: IRenderAdapter): void {
        if (!this.registerPrefab(name, prefab, initialCount, adapter)) return;

        if (!this._pools.has(name)) this._pools.set(name, []);
        const pool = this._pools.get(name)!;

        const needCount = initialCount - pool.length;
        for (let i = 0; i < needCount; i++) {
            const node = instantiate(prefab);
            node.active = false;
            pool.push(node);
        }
        Logger.info(LogModule.POOL, `对象池预分配完成: [${name}], 当前池内可用数量: ${pool.length}`);
    }

    /**
     * 注册预制体并绑定对应适配器
     */
    public registerPrefab(name: string, prefab: Prefab, poolLimit?: number, adapter?: IRenderAdapter): boolean {
        if (!prefab || !prefab.isValid) {
            Logger.error(LogModule.POOL, `对象池预分配拒绝无效预制体: ${name}`);
            this._prefabs.delete(name);
            return false;
        }

        this._prefabs.set(name, prefab);
        if (poolLimit !== undefined && poolLimit > 0) this._poolLimits.set(name, poolLimit);
        if (adapter) this._adapters.set(name, adapter); // 记录适配器

        if (!this._pools.has(name)) this._pools.set(name, []);
        return true;
    }

    public spawn(name: string, parent: Node, pos: Vec3, data?: any): Node {
        if (!parent || !parent.isValid || !parent.scene) {
            Logger.error(LogModule.POOL, `对象池 Spawn 父节点无效: [${name}]`);
            return null;
        }

        let pool = this._pools.get(name);
        let node: Node = null;

        if (pool && pool.length > 0) {
            while (pool.length > 0) {
                const candidate = pool.pop()!;
                if (candidate && candidate.isValid) {
                    node = candidate;
                    break;
                }
            }
        }

        if (!node) {
            const prefab = this._prefabs.get(name);
            if (!prefab || !prefab.isValid) {
                Logger.error(LogModule.POOL, `试图 Spawn 未注册或无效预制体的对象: ${name}`);
                this._prefabs.delete(name);
                return null;
            }
            node = instantiate(prefab);
        }

        node.setParent(parent);
        node.setPosition(pos);
        node.active = true;

        // ✅ 时序护航 1：先执行底层适配器重置 (例如清除刚体残留速度，复原材质)
        const adapter = this._adapters.get(name);
        if (adapter && adapter.onSpawn) {
            adapter.onSpawn(node);
        }

        // ✅ 时序护航 2：再执行业务逻辑重置 (业务可以安全地修改材质和施加新力)
        const components = node.components;
        for (let i = 0; i < components.length; i++) {
            const comp = components[i] as any;
            if (comp.onSpawn) comp.onSpawn(data);
        }

        return node;
    }

    public recycle(name: string, node: Node): void {
        if (!node || !node.isValid) return;

        // 1. 打断所有表现层补间与图集动画
        Tween.stopAllByTarget(node);
        AnimationHelper.stopAnimation(node);

        // 2. 触发业务生命周期销毁 (解除锁定目标、清空引用等)
        const components = node.components;
        for (let i = 0; i < components.length; i++) {
            const comp = components[i] as any;
            if (comp.onRecycle) comp.onRecycle();
        }

        // ✅ 3. 触发底层适配器清理 (如：掐断 TrailRenderer 拖尾渲染，防止复用时拉丝)
        const adapter = this._adapters.get(name);
        if (adapter && adapter.onRecycle) {
            adapter.onRecycle(node);
        }

        // 4. 剥离显示层级
        if (node.parent) node.removeFromParent();
        node.active = false;

        // 5. 压入对象池或走销毁
        if (!this._pools.has(name)) this._pools.set(name, []);
        const pool = this._pools.get(name)!;
        const limit = this._poolLimits.get(name) ?? this.DEFAULT_POOL_LIMIT;

        if (pool.length >= limit) {
            node.destroy();
            return;
        }
        pool.push(node);
    }

    public clearPool(name: string): void {
        const pool = this._pools.get(name);
        if (pool) {
            pool.forEach(node => {
                if (node && node.isValid) {
                    this._notifyRecycle(node);
                    node.destroy();
                }
            });
            this._pools.set(name, []);
        }
        this._prefabs.delete(name);
        this._poolLimits.delete(name);
        this._adapters.delete(name); // 清理适配器缓存
    }

    public resetPool(name: string): void {
        const pool = this._pools.get(name);
        if (!pool) return;
        for (const node of pool) {
            if (node && node.isValid) {
                this._notifyRecycle(node);
                node.active = false;
            }
        }
    }

    public clearAll(): void {
        this._pools.forEach((pool, name) => {
            pool.forEach(node => {
                if (node && node.isValid) {
                    this._notifyRecycle(node);
                    node.destroy();
                }
            });
        });
        this._pools.clear();
        this._prefabs.clear();
        this._poolLimits.clear();
        this._adapters.clear(); // 清理全部适配器
        Logger.info(LogModule.POOL, "已清空所有 GameObject 对象池与适配器");
    }

    private _notifyRecycle(node: Node): void {
        const components = node.components;
        for (let i = 0; i < components.length; i++) {
            const comp = components[i] as any;
            if (comp && typeof comp.onRecycle === "function") {
                comp.onRecycle();
            }
        }
    }

    public getDebugInfo(): any {
        let total = 0;
        this._pools.forEach((arr) => { total += arr.length; });
        return { total: total, poolCount: this._pools.size };
    }
}