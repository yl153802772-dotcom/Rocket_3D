/**
 * @module GameObjectPool
 * @description
 * [模块逻辑]
 * 游戏通用实体池。通过预分配和循环复用 Node，根治高频 Instantiate 和 Destroy 引发的 GC 内存卡顿。
 *
 * [调用规则]
 * 1. 需要高频生成的表现物（特效、子弹、怪物）必须通过 spawn() 与 recycle() 获取和归还。
 * 2. 回收（recycle）时，本模块强制切断该节点的所有 Tween 与 2D 帧动画，避免幽灵状态污染下一次 Spawn。
 */

import { _decorator, Node, Prefab, instantiate, Vec3, Tween } from 'cc';
import { Logger } from '../../../Framework/Core/Logger';
import { AnimationHelper } from '../AnimationHelper'; // ✅ 新增：导入动画重置助手

export class GameObjectPool {
    private static _instance: GameObjectPool;
    public static get Instance(): GameObjectPool {
        if (!this._instance) this._instance = new GameObjectPool();
        return this._instance;
    }

    private _pools: Map<string, Node[]> = new Map();
    private _prefabs: Map<string, Prefab> = new Map();
    private _poolLimits: Map<string, number> = new Map();
    private readonly DEFAULT_POOL_LIMIT: number = 100;

    public preAllocate(name: string, prefab: Prefab, initialCount: number = 10): void {
        if (!this.registerPrefab(name, prefab, initialCount)) return;
        if (!this._pools.has(name)) this._pools.set(name, []);
        const pool = this._pools.get(name)!;

        const needCount = initialCount - pool.length;
        for (let i = 0; i < needCount; i++) {
            const node = instantiate(prefab);
            node.active = false;
            pool.push(node);
        }
        Logger.info(`对象池预分配完成: [${name}], 当前池内可用数量: ${pool.length}`);
    }

    public registerPrefab(name: string, prefab: Prefab, poolLimit?: number): boolean {
        if (!prefab || !prefab.isValid) {
            Logger.error(`对象池预分配拒绝无效预制体: ${name}`);
            this._prefabs.delete(name);
            return false;
        }
        this._prefabs.set(name, prefab);
        if (poolLimit !== undefined && poolLimit > 0) this._poolLimits.set(name, poolLimit);
        if (!this._pools.has(name)) this._pools.set(name, []);
        return true;
    }

    public spawn(name: string, parent: Node, pos: Vec3, data?: any): Node {
        if (!parent || !parent.isValid || !parent.scene) {
            Logger.error(`对象池 Spawn 父节点无效: [${name}]`);
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
                Logger.error(`试图 Spawn 未注册或无效预制体的对象: ${name}`);
                this._prefabs.delete(name);
                return null;
            }
            node = instantiate(prefab);
        }

        node.setParent(parent);
        node.setPosition(pos);
        node.active = true;

        const components = node.components;
        for (let i = 0; i < components.length; i++) {
            const comp = components[i] as any;
            if (comp.onSpawn) comp.onSpawn(data);
        }

        return node;
    }

    public recycle(name: string, node: Node): void {
        if (!node || !node.isValid) return;

        // ✅ 核心闭环修复：强制打断并清理节点身上可能残留的一切异步业务表现状态！
        // 彻底根治下一次从池中取出时，“上辈子的动画还在播放”的幽灵现象。
        Tween.stopAllByTarget(node);
        AnimationHelper.stopAnimation(node);

        const components = node.components;
        for (let i = 0; i < components.length; i++) {
            const comp = components[i] as any;
            if (comp.onRecycle) comp.onRecycle();
        }

        if (node.parent) node.removeFromParent();
        node.active = false;

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
        Logger.info("已清空所有 GameObject 对象池");
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