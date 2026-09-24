/**
 * @module EffectManager
 * @description
 * [模块逻辑]
 * 核心层特效调度器。负责接管所有独立特效表现状态机及简单的“射后不理”粒子实例化操作。
 * 在多阶段动画完成或被取消时，会统一下达指令清空所有的表现层替身，避免产生游离节点导致渲染和内存泄漏。
 *
 * [调用规则]
 * 1. 禁止使用任何指定游戏项目的硬编码（如回收特定的"DummySphere"）。
 * 2. 所有的替身 dummyNode 必须约定其 `name` 即为对象池中的 Prefab Key，以供本模块跨项目通用回收。
 */

import { Node, Vec3 } from 'cc';
import { GameObjectPool } from '../Pool/GameObjectPool';
import { EffectPlayer } from './EffectPlayer';
import { ISequenceNode } from '../VisualSequence/ISequenceNode';
import { SequenceContext } from '../VisualSequence/SequenceContext';
import { Logger, LogModule } from '../Logger';

export class EffectManager {
    private static _instance: EffectManager;
    public static get Instance(): EffectManager {
        if (!this._instance) this._instance = new EffectManager();
        return this._instance;
    }

    /**
     * 播放单次通用特效 (射后不理)
     */
    public play(prefabKey: string, parent: Node, worldPos: Vec3, duration?: number): Node | null {
        const effectNode = GameObjectPool.Instance.spawn(prefabKey, parent, worldPos);

        if (!effectNode) {
            Logger.warn(LogModule.FRAMEWORK, `[EffectManager] 无法生成特效: ${prefabKey}`);
            return null;
        }

        effectNode.setWorldPosition(worldPos);

        const player = effectNode.getComponent(EffectPlayer);
        if (player) {
            player.play(prefabKey, duration);
        }
        return effectNode;
    }

    /**
     * 调度复杂表现状态机 (并提供多阶段强回收保证防泄漏)
     */
    public playSequence(
        sequence: ISequenceNode,
        dummyNodes: Node[],
        ctx: SequenceContext,
        onComplete?: () => void
    ) {
        if (!sequence) {
            if (onComplete) onComplete();
            SequenceContext.recycle(ctx);
            return;
        }

        sequence.playPhase1(dummyNodes, ctx, () => {
            // ✅ 防泄漏：Context 取消时清退资源
            if (ctx.isCanceled) {
                if(sequence.cancel) sequence.cancel(dummyNodes);
                SequenceContext.recycle(ctx);
                return;
            }

            // ✅ 架构净化防泄漏绞肉机：
            // 第一阶段演完后，立刻把所有的替身送回对象池！绝不留活口！
            // 剥离了 "DummySphere" 这个只存在于合并项目里的硬编码！
            // 要求传入的 dummyNode 自身的 name 与对象池中的 Key 保持一致。
            if (dummyNodes && dummyNodes.length > 0) {
                dummyNodes.forEach(n => {
                    if (n && n.isValid) {
                        GameObjectPool.Instance.recycle(n.name, n);
                    }
                });
            }

            sequence.playPhase2(ctx, () => {
                if (onComplete) onComplete();
                SequenceContext.recycle(ctx);
            });
        });
    }
}