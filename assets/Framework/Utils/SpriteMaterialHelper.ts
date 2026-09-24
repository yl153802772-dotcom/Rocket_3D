import { Sprite, Material, SpriteFrame, Vec4 } from 'cc';
import { EventCenter } from '../Data/EventCenter';
import { EventName } from '../Core/GameConst';
import { Logger, LogModule } from '../Core/Logger';

/**
 * 🌟 材质管理助手 (0GC 合批优化版)
 */
export class SpriteMaterialHelper {
    // 缓存池：UUID 复合键 -> 材质实例
    private static _materialCache: Map<string, Material> = new Map();
    private static _isEventRegistered: boolean = false;

    // 🌟 准则对齐：使用函数对象指针绑定，严禁匿名函数
    private static _onCleanupBound = () => SpriteMaterialHelper.clearCache();

    static onEntityInit(sprite: Sprite, baseMaterial: Material, sf?: SpriteFrame): void {
        if (!sprite || !sprite.isValid || !baseMaterial) return;

        this.registerEventOnce();

        if (sf) sprite.spriteFrame = sf;
        const currentSF = sprite.spriteFrame;

        // 无贴图材质处理
        if (!currentSF) {
            if (sprite.customMaterial !== baseMaterial) sprite.customMaterial = baseMaterial;
            return;
        }

        const cacheKey = `${baseMaterial._uuid}_${currentSF._uuid}`;
        let targetMat = this._materialCache.get(cacheKey);

        if (!targetMat) {
            targetMat = new Material();
            targetMat.copy(baseMaterial);

            // 属性拷贝与对齐
            const originalSpeed = baseMaterial.getProperty('flowSpeed', 0) as any;
            if (originalSpeed) {
                let sx = originalSpeed.x !== undefined ? originalSpeed.x : (originalSpeed[0] || 0);
                let sy = originalSpeed.y !== undefined ? originalSpeed.y : (originalSpeed[1] || 0);
                targetMat.setProperty('flowSpeed', new Vec4(sx, sy, 0, 0));
            }

            // 计算 uvRect
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

    private static registerEventOnce() {
        if (this._isEventRegistered) return;
        // 🌟 使用指针绑定
        EventCenter.on(EventName.CLEANUP_BATTLE_MATERIALS, this._onCleanupBound);
        this._isEventRegistered = true;
    }

    static clearCache(): void {
        this._materialCache.clear();
        Logger.info(LogModule.BATTLE, `[MaterialHelper] 🧹 材质缓存已清空`);
    }

    // 场景切换卸载
    static onSceneUnload(): void {
        EventCenter.off(EventName.CLEANUP_BATTLE_MATERIALS, this._onCleanupBound);
        this.clearCache();
        this._isEventRegistered = false;
    }
}