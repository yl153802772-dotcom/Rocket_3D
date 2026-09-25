import { Sprite, Material, SpriteFrame, Vec4 } from 'cc';
import { Logger, LogModule } from '../Core/Logger';

/**
 * 🌟 材质管理助手 (0GC 合批优化版)
 * 已移除对业务事件的监听耦合。场景卸载时需由业务层主动调用 clearCache。
 */
export class SpriteMaterialHelper {
    private static _materialCache: Map<string, Material> = new Map();

    static onEntityInit(sprite: Sprite, baseMaterial: Material, sf?: SpriteFrame): void {
        if (!sprite || !sprite.isValid || !baseMaterial) return;

        if (sf) sprite.spriteFrame = sf;
        const currentSF = sprite.spriteFrame;

        if (!currentSF) {
            if (sprite.customMaterial !== baseMaterial) sprite.customMaterial = baseMaterial;
            return;
        }

        const cacheKey = `${baseMaterial._uuid}_${currentSF._uuid}`;
        let targetMat = this._materialCache.get(cacheKey);

        if (!targetMat) {
            targetMat = new Material();
            targetMat.copy(baseMaterial);

            const originalSpeed = baseMaterial.getProperty('flowSpeed', 0) as any;
            if (originalSpeed) {
                let sx = originalSpeed.x !== undefined ? originalSpeed.x : (originalSpeed[0] || 0);
                let sy = originalSpeed.y !== undefined ? originalSpeed.y : (originalSpeed[1] || 0);
                targetMat.setProperty('flowSpeed', new Vec4(sx, sy, 0, 0));
            }

            let u_min = 0, u_max = 1, v_min = 0, v_max = 1;
            const uv = currentSF.uv;
            if (uv && uv.length >= 8) {
                u_min = Math.min(uv[0], uv[2], uv[4], uv[6]);
                u_max = Math.max(uv[0], uv[2], uv[4], uv[6]);
                v_min = Math.min(uv[1], uv[3], uv[5], uv[7]);
                v_max = Math.max(uv[1], uv[3], uv[5], uv[7]);
            }
            const margin = 0.001;
            const rect = new Vec4(
                u_min + margin,
                v_min + margin,
                Math.max((u_max - u_min) - margin * 2, 0.0001),
                Math.max((v_max - v_min) - margin * 2, 0.0001)
            );

            targetMat.setProperty('uvRect', rect);
            this._materialCache.set(cacheKey, targetMat);
        }

        if (sprite.customMaterial !== targetMat) {
            sprite.customMaterial = targetMat;
        }
    }

    static onEntityRecycle(sprite: Sprite): void {
        if (!sprite || !sprite.isValid) return;
        sprite.customMaterial = null;
    }

    static clearCache(): void {
        this._materialCache.clear();
        Logger.info(LogModule.FRAMEWORK, `[MaterialHelper] 🧹 材质缓存已清空`);
    }
}