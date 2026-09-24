// Framework/Core/Effect/UniversalFXBuilder.ts
import { Node, Vec3, UIOpacity } from 'cc';
import { SequenceContext } from '../VisualSequence/SequenceContext';
import { GameObjectPool } from '../Pool/GameObjectPool';
import {TweenGroup, TweenUtil} from '../../Utils/TweenUtil';
import { MathUtil } from '../../Utils/MathUtil';
import { UniversalFXConfig, DEFAULT_UNIVERSAL_FX_CONFIG } from './UniversalFXConfig';

export class UniversalFXBuilder {
    private static _tempScale = new Vec3();
    private static _tempPos = new Vec3();

    public static play(ctx: SequenceContext) {
        const parent = ctx.parentLayer;
        const center = ctx.center;
        if (!parent || !center) return;

        const fx = ctx.getPayload<UniversalFXConfig>() || DEFAULT_UNIVERSAL_FX_CONFIG;

        // 🌟 核心链路对齐：判断业务图纸是否开启极简，掐断冗余工序
        if (!fx.isMinimal) {
            this.playEnergy(parent, center, fx);
        }

        this.playBurst(parent, center, fx);

        if (!fx.isMinimal) {
            this.playAftermath(parent, center, fx);
        }
    }

    private static playEnergy(parent: Node, center: Vec3, fx: UniversalFXConfig) {
        for (let i = 0; i < 4; i++) {
            const node = GameObjectPool.Instance.spawn("fx_glow_soft", parent, center);
            if (!node) continue;

            const angle = Math.random() * Math.PI * 2;
            const r = 80 * fx.scaleMul + Math.random() * 40;
            node.setRotationFromEuler(0, 0, MathUtil.randomRange(-180, 180));

            let uiOp = node.getComponent(UIOpacity) || node.addComponent(UIOpacity);
            uiOp.opacity = 120;
            const duration = 0.2 / fx.speedMul;

            TweenUtil.safeCustom(node, duration, (t) => {
                const ease = t * t;
                this._tempPos.set(
                    center.x + Math.cos(angle) * r * (1 - ease),
                    center.y + Math.sin(angle) * r * (1 - ease),
                    0
                );
                node.setPosition(this._tempPos);
                const s = (0.5 + t) * fx.scaleMul;
                node.setScale(this._tempScale.set(s, s, 1));
                uiOp.opacity = 120 * (1 - t);
            }, () => {
                GameObjectPool.Instance.recycle("fx_glow_soft", node);
            }, 0, undefined, TweenGroup.UI);
        }
    }

    private static playBurst(parent: Node, center: Vec3, fx: UniversalFXConfig) {
        if (fx.shakeStrength > 0) {
            this.shakeNode(parent, fx.shakeStrength, 0.08 / fx.speedMul);
        }

        const burstCenter = center.clone();
        burstCenter.y -= fx.downOffset;

        const randAngleBase = MathUtil.randomRange(-30, 30);
        const randScaleMul = MathUtil.randomRange(0.8, 1.2);

        // 🌟 读取透视修饰器，安全兜底为 1.0
        const pr = fx.perspectiveRatio !== undefined ? fx.perspectiveRatio : 1.0;

        // 冲击环 (极速扩大)
        const ring = GameObjectPool.Instance.spawn("fx_ring_expand", parent, burstCenter);
        if (ring) {
            ring.setRotationFromEuler(0, 0, randAngleBase + MathUtil.randomRange(-15, 15));
            let uiOp = ring.getComponent(UIOpacity) || ring.addComponent(UIOpacity);
            TweenUtil.safeCustom(ring, 0.2 / fx.speedMul, (t) => {
                const s = (0.3 + 3.7 * t) * fx.burstScale * fx.scaleMul * randScaleMul;
                // 🌟 核心视觉修正：强制压扁 Y 轴，完美咬合 2.5D 法阵地板！
                ring.setScale(this._tempScale.set(s, s * pr, 1));
                uiOp.opacity = 255 * (1 - t);
            }, () => {
                GameObjectPool.Instance.recycle("fx_ring_expand", ring);
            }, 0, undefined, TweenGroup.UI);
        }

        // 主元素表现层
        if (fx.mainPrefab !== "") {
            const elNode = GameObjectPool.Instance.spawn(fx.mainPrefab, parent, burstCenter);
            if (elNode) {
                let uiOp = elNode.getComponent(UIOpacity) || elNode.addComponent(UIOpacity);
                const totalRotation = Math.PI * 2 * fx.rotateSpeed;
                const spiralRot = Math.PI * 4 * fx.spiralStrength;
                const mainStartAngle = MathUtil.randomRange(-30, 30);

                TweenUtil.safeCustom(elNode, fx.mainDuration / fx.speedMul, (t) => {
                    let currentAngle = mainStartAngle;
                    if (fx.rotateSpeed > 0 || fx.spiralStrength > 0) {
                        currentAngle += (totalRotation + spiralRot) * t * (180 / Math.PI);
                    }
                    elNode.setRotationFromEuler(0, 0, currentAngle);
                    const s = (fx.mainScaleStart + (fx.mainScaleEnd - fx.mainScaleStart) * t) * fx.burstScale * fx.scaleMul * randScaleMul;
                    elNode.setScale(this._tempScale.set(s, s, 1));
                    uiOp.opacity = 255 * (1 - Math.pow(t, 2));
                }, () => {
                    GameObjectPool.Instance.recycle(fx.mainPrefab, elNode);
                }, 0, undefined, TweenGroup.UI);
            }
        }

        // 核心光 (瞬间极白遮蔽)
        const core = GameObjectPool.Instance.spawn("fx_core_white", parent, burstCenter);
        if (core) {
            core.setRotationFromEuler(0, 0, randAngleBase);
            TweenUtil.safeCustom(core, 0.05 / fx.speedMul, (t) => {
                const s = (1 - 0.3 * t) * fx.burstScale * fx.scaleMul * randScaleMul;
                core.setScale(this._tempScale.set(s, s, 1));
            }, () => {
                TweenUtil.safeCustom(core, 0.1 / fx.speedMul, (t) => {
                    const s = (0.7 + 2.0 * t) * fx.burstScale * fx.scaleMul * randScaleMul;
                    core.setScale(this._tempScale.set(s, s, 1));
                }, () => {
                    GameObjectPool.Instance.recycle("fx_core_white", core);
                }, 0, undefined, TweenGroup.UI);
            }, 0, undefined, TweenGroup.UI);
        }
    }

    private static playAftermath(parent: Node, center: Vec3, fx: UniversalFXConfig) {
        for (let i = 0; i < 4; i++) {
            const spark = GameObjectPool.Instance.spawn("fx_spark_small", parent, center);
            if (!spark) continue;
            const angle = Math.random() * Math.PI * 2;
            const dist = (30 + Math.random() * 30) * fx.scaleMul;
            spark.setRotationFromEuler(0, 0, angle * (180 / Math.PI));
            TweenUtil.safeCustom(spark, 0.4 / fx.speedMul, (t) => {
                const easeOut = t * (2 - t);
                this._tempPos.set(center.x + Math.cos(angle) * dist * easeOut, center.y + Math.sin(angle) * dist * easeOut, 0);
                spark.setPosition(this._tempPos);
                spark.setScale(this._tempScale.set((1 - t) * fx.scaleMul, (1 - t) * fx.scaleMul, 1));
            }, () => {
                GameObjectPool.Instance.recycle("fx_spark_small", spark);
            }, 0, undefined, TweenGroup.UI);
        }
    }

    private static shakeNode(node: Node, strength: number, duration: number) {
        if (!node.isValid) return;
        const originalPos = node.position.clone();
        TweenUtil.safeCustom(node, duration, (t) => {
            const s = strength * (1 - t);
            this._tempPos.set(originalPos.x + MathUtil.randomRange(-s, s), originalPos.y + MathUtil.randomRange(-s, s), originalPos.z);
            node.setPosition(this._tempPos);
        }, () => {
            if (node.isValid) node.setPosition(originalPos);
        }, 0, undefined, TweenGroup.UI);
    }
}