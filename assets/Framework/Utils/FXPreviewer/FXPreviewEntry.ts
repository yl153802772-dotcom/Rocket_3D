// Framework/Tools/FXPreviewer/FXPreviewEntry.ts
import { _decorator, Component, Prefab, Node, Label } from 'cc';
import { ConfigManager } from '../../Core/ConfigManager';
import { ResManager, ResType } from '../../Core/ResManager';
import { GameObjectPool } from '../../Core/Pool/GameObjectPool';

const { ccclass, property } = _decorator;

@ccclass('FXPreviewEntry')
export class FXPreviewEntry extends Component {

    @property(Node)
    loadingTips: Node = null; // 可选：屏幕中间挂个 "Loading..." 提示

    async start() {
        if (this.loadingTips) this.loadingTips.active = true;

        try {
            // 1. 加载特效配置 JSON
            await ConfigManager.Instance.loadTables(['fx_presets'], 'config');
            console.log("✅ [FXPreviewEntry] 特效配置表加载成功");

            // 2. 加载特效分包 (假设您的 bundle 叫 'effect')
            await ResManager.Instance.loadBundle('effect');

            // 3. 预加载所有必须的原子粒子和假球
            const effectPaths = [
                "prefab/dummy/DummySphere",
                "prefab/common/fx_core_white",
                "prefab/common/fx_glow_soft",
                "prefab/common/fx_ring_expand",
                "prefab/common/fx_spark_small",
                "prefab/elements/fx_fire_main",
                "prefab/elements/fx_water_ripple",
                "prefab/elements/fx_wind_trail",
                "prefab/elements/fx_earth_dust"
            ];

            for (const path of effectPaths) {
                const prefab = await ResManager.Instance.load<Prefab>(path, Prefab, 'effect', ResType.NORMAL);

                // 提取池子 Key
                const key = path.substring(path.lastIndexOf('/') + 1);
                const count = key === "fx_spark_small" ? 30 : 15; // 火花多分配点

                // 注入对象池
                GameObjectPool.Instance.preAllocate(key, prefab, count);
            }
            console.log("✅ [FXPreviewEntry] 特效预制体预加载与对象池初始化完成");

            if (this.loadingTips) this.loadingTips.active = false;

        } catch (err) {
            console.error("❌ [FXPreviewEntry] 预览场景初始化失败:", err);
        }
    }
}