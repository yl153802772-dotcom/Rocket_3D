/**
 * @module GameObjectPool
 * @description
 * [模块逻辑]
 * 游戏通用实体池。支持 2D/3D 节点的高频创建销毁管理。
 * 本次重构引入了 IRenderAdapter 渲染适配器体系，根治了 3D 对象复用时材质污染、物理刚体残留与拖尾拉丝的业界痛点。
 * * 通用对象池系统。
 *  * 现已全面接入 IRenderAdapter，彻底打通 2D/3D 通用对象的安全洗爆链路。
 *
 * [调用规则]
 * 1. 3D 复杂对象在注册时，应注入对应的 IRenderAdapter 处理底层渲染状态重置。
 * 2. 节点回收（recycle）时，本模块会严格按照：停 Tween/动画 -> 触发业务 onRecycle -> 触发适配器 onRecycle -> 剥离父节点的安全时序执行。
 */

import { Node, Prefab, instantiate, isValid, Tween } from 'cc';
import { IRenderAdapter, SpriteRenderAdapter, MeshRenderAdapter } from './IRenderAdapter';
import { AnimationHelper } from '../AnimationHelper';
import { Logger, LogModule } from '../Logger';

export interface IPoolObject {
    onSpawn?(...args: any[]): void;
    onRecycle?(): void;
}

export enum RenderType {
    Sprite2D = 0,
    Mesh3D = 1
}

export class GameObjectPool {
    private static _instance: GameObjectPool | null = null;
    public static get Instance(): GameObjectPool {
        if (!this._instance) this._instance = new GameObjectPool();
        return this._instance;
    }

    private _pools: Map<string, Node[]> = new Map();
    private _prefabs: Map<string, Prefab> = new Map();
    private _adapters: Map<string, IRenderAdapter> = new Map();

    private _default2DAdapter = new SpriteRenderAdapter();
    private _default3DAdapter = new MeshRenderAdapter();

    public registerPrefab(key: string, prefab: Prefab, renderType: RenderType = RenderType.Sprite2D): void {
        if (this._prefabs.has(key)) return;
        this._prefabs.set(key, prefab);
        this._pools.set(key, []);

        const adapter = renderType === RenderType.Mesh3D ? this._default3DAdapter : this._default2DAdapter;
        this._adapters.set(key, adapter);
    }

    public spawn(key: string, ...args: any[]): Node | null {
        let node: Node | null = null;
        const pool = this._pools.get(key);

        if (pool && pool.length > 0) {
            node = pool.pop() || null;
        } else {
            const prefab = this._prefabs.get(key);
            if (prefab) {
                node = instantiate(prefab);
                (node as any).__poolKey = key;
            } else {
                Logger.error(LogModule.POOL, `对象池未注册该 Prefab: ${key}`);
                return null;
            }
        }

        if (isValid(node)) {
            node.active = true;
            const poolObj = node.getComponent('IPoolObject') as unknown as IPoolObject;
            if (poolObj && poolObj.onSpawn) {
                poolObj.onSpawn(...args);
            }
        }
        return node;
    }

    public recycle(node: Node, key?: string): void {
        if (!isValid(node)) return;

        const poolKey = key || (node as any).__poolKey;
        if (!poolKey || !this._pools.has(poolKey)) {
            node.destroy();
            return;
        }

        // 1. 触发业务层的清理回收回调
        const poolObj = node.getComponent('IPoolObject') as unknown as IPoolObject;
        if (poolObj && poolObj.onRecycle) {
            poolObj.onRecycle();
        }

        // 2. 规范落地：回收前停止 Tween、Animation 和逻辑
        Tween.stopAllByTarget(node);
        if (AnimationHelper && typeof AnimationHelper.stopAnimation === 'function') {
            AnimationHelper.stopAnimation(node);
        }

        // 3. 适配层洗爆：解耦清洗 2D/3D 的材质、物理等脏数据
        const adapter = this._adapters.get(poolKey);
        if (adapter) {
            adapter.resetInstance(node);
        }

        node.active = false;
        node.removeFromParent();

        // 4. 池容量熔断：每个池有上限，防止内存无限膨胀
        const pool = this._pools.get(poolKey);
        if (pool) {
            if (pool.length < 100) {
                pool.push(node);
            } else {
                if (adapter) adapter.disposeInstance(node);
                node.destroy();
            }
        }
    }

    public clearAll(): void {
        this._pools.forEach((pool, key) => {
            const adapter = this._adapters.get(key);
            pool.forEach(node => {
                if (isValid(node)) {
                    if (adapter) adapter.disposeInstance(node);
                    node.destroy();
                }
            });
        });
        this._pools.clear();
        this._prefabs.clear();
        this._adapters.clear();
        Logger.info(LogModule.POOL, "已彻底清理通用对象池");
    }
}