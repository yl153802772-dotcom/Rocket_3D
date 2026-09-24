// Framework/Core/Effect/DragFXHelper.ts
import { Node, Vec3, UIOpacity, Sprite, Material, SpriteFrame } from 'cc';
import { GameObjectPool } from '../Pool/GameObjectPool';
import {TweenGroup, TweenUtil} from '../../Utils/TweenUtil';
import { MathUtil } from '../../Utils/MathUtil';
import { SpriteMaterialHelper } from '../../Utils/SpriteMaterialHelper';

export class DragFXHelper {
    private static _tempVec = new Vec3();

    /**
     * 🌟 高级流体力学拖尾：淡淡拖痕 + 反向溅射尘埃 (0GC版)
     */
    public static spawnDragEffect(
        parent: Node,
        startPos: Vec3,
        endPos: Vec3,
        sf: SpriteFrame,
        mat: Material
    ) {
        const dx = endPos.x - startPos.x;
        const dy = endPos.y - startPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // 防抖：移动过短不生成
        if (dist < 3) return;

        // 运动方向弧度
        const radian = Math.atan2(dy, dx);
        const degree = radian * (180 / Math.PI);

        // ==========================================
        // 1. 生成极淡的流线光痕 (主拖尾)
        // ==========================================
        const trailNode = GameObjectPool.Instance.spawn("prefab_orb_trail", parent, endPos);
        if (trailNode) {
            const tSprite = trailNode.getComponent(Sprite);
            if (tSprite && sf && mat) SpriteMaterialHelper.onEntityInit(tSprite, mat, sf);

            trailNode.setRotationFromEuler(0, 0, degree);

            // X轴随速度拉长，Y轴极限压扁，形成光丝
            const stretchX = 1.0 + (dist * 0.05);
            const squashY = 0.3;
            trailNode.setScale(this._tempVec.set(stretchX, squashY, 1));

            let uiOp = trailNode.getComponent(UIOpacity) || trailNode.addComponent(UIOpacity);
            uiOp.opacity = 80; // 非常淡

            TweenUtil.safeCustom(trailNode, 0.2, (ratio) => {
                if (!trailNode.isValid) return;
                uiOp.opacity = 80 * (1 - ratio);
                const sX = stretchX * (1 - ratio * 0.5);
                const sY = squashY * (1 - ratio);
                trailNode.setScale(this._tempVec.set(sX, sY, 1));
            }, () => {
                if (trailNode.isValid) GameObjectPool.Instance.recycle("prefab_orb_trail", trailNode);
            }, 0, undefined, TweenGroup.UI)
        }

        // ==========================================
        // 2. 生成反向空气摩擦尘埃 (复用 orb_trail 极度缩小充当粒子)
        // ==========================================
        // 速度越快（dist越大），爆出的粒子概率和数量越多，最多2颗
        const dustCount = dist > 15 ? 2 : (Math.random() > 0.4 ? 1 : 0);

        for (let i = 0; i < dustCount; i++) {
            const dustNode = GameObjectPool.Instance.spawn("prefab_orb_trail", parent, startPos);
            if (!dustNode) continue;

            const dSprite = dustNode.getComponent(Sprite);
            if (dSprite && sf && mat) SpriteMaterialHelper.onEntityInit(dSprite, mat, sf);

            // 🌟 反方向扇形散射角：运动反方向 + 正负45度的随机偏移
            const reverseRadian = radian + Math.PI + MathUtil.randomRange(-0.8, 0.8);
            // 抛射力度随滑动速度正相关
            const driftDist = dist * MathUtil.randomRange(0.6, 1.2);

            const targetX = startPos.x + Math.cos(reverseRadian) * driftDist;
            const targetY = startPos.y + Math.sin(reverseRadian) * driftDist;

            // 极度缩小充当尘埃粒子 (0.1 ~ 0.25)
            const initScale = MathUtil.randomRange(0.1, 0.25);
            dustNode.setScale(this._tempVec.set(initScale, initScale, 1));
            dustNode.setRotationFromEuler(0, 0, MathUtil.randomRange(0, 360));

            let dOp = dustNode.getComponent(UIOpacity) || dustNode.addComponent(UIOpacity);
            dOp.opacity = 150;

            const driftDuration = MathUtil.randomRange(0.2, 0.4);
            const rotSpeed = MathUtil.randomRange(-180, 180);
            const startRot = dustNode.eulerAngles.z;

            TweenUtil.safeCustom(dustNode, driftDuration, (ratio) => {
                if (!dustNode.isValid) return;
                // easeOut 让抛射有空气阻力感
                const easeOut = ratio * (2 - ratio);
                const currX = startPos.x + (targetX - startPos.x) * easeOut;
                const currY = startPos.y + (targetY - startPos.y) * easeOut;
                dustNode.setPosition(currX, currY, 0);

                dustNode.setRotationFromEuler(0, 0, startRot + rotSpeed * ratio);

                const currScale = initScale * (1 - ratio);
                dustNode.setScale(this._tempVec.set(currScale, currScale, 1));
                dOp.opacity = 150 * (1 - ratio);
            }, () => {
                if (dustNode.isValid) GameObjectPool.Instance.recycle("prefab_orb_trail", dustNode);
            }, 0, undefined, TweenGroup.UI)
        }
    }
}