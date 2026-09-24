/**
 * @module GameEntry
 * @description
 * [模块逻辑]
 * 游戏业务层的总启动节点。本次重构实施了严格的启动域隔离 (Boot Domain Isolation)。
 * 将首屏核心表控制在最少数量，保障 3 秒大厅极速准入；繁重的系统表全部延后至 background 无感加载。
 *
 * [调用规则]
 * 1. 禁止向 loadCoreConfigsWithTimeout 添加任何非首屏严格依赖的配置文件。
 * 2. 任何需要等待网络的预加载任务，不得阻塞 UIManager 的层级创建和首图呈现。
 */
import { _decorator, Component, game, Game } from 'cc';
import { App } from '../Framework/Core/App';
import { ConfigManager } from "../Framework/Core/ConfigManager";
import { TimerManager } from '../Framework/Core/TimerTool/TimerManager';
import { UIManager, UILayer } from '../Framework/Core/UIManager';
import { EventCenter } from "../Framework/Data/EventCenter";
import { DataKey, EventName, ToastType } from "../Framework/Core/GameConst";
import { DataCenter } from "../Framework/Data/DataCenter";
import { ResManager } from "db://assets/Framework/Core/ResManager";
import { Logger, LogModule } from "db://assets/Framework/Core/Logger";
import { PreloadManager } from "db://assets/Framework/Core/PreloadManager";
import { TweenGroup, TweenUtil } from "db://assets/Framework/Utils/TweenUtil";
import { IModule } from '../Framework/Core/ModuleSystem';

const { ccclass } = _decorator;

// ✅ 首屏极简域：仅保留进入大厅/拉取用户基础数据必需的表
const BOOT_CONFIGS = [
    'game', 'player', 'codex_view_config'
];

// ✅ 后台全局与战斗域：推迟至大厅渲染后、玩家无感知的静默阶段下载和构建
const GLOBAL_AND_BATTLE_CONFIGS = [
    'shop', 'civ_config', 'element', 'stage_growth', 'MonsterCombat', 'wave_dynamic',
    'level', 'skill', 'path', 'merge', 'fx_presets', 'MonsterVisual', 'guide',
    'merge_probability', "summon_weight", 'element_skills', 'energy_config',
    'summon_config', 'combat_config', 'monster_affix', 'epoch_config'
];

@ccclass('GameEntry')
export class GameEntry extends Component {

    async start() {
        Logger.info("游戏启动");
        await App.Instance.init();

        TimerManager.Instance.doLoop(60, 0, () => {
            ResManager.Instance.clearExpiredLRU();
        }, this);

        // 瞬间弹起护盾掩护黑屏，大厅 Loading 秒出
        await UIManager.Instance.openUI("LoadingUI", "LoadingUI", UILayer.Top, null, "");

        let coreReady = false;
        while (!coreReady) {
            try {
                // ✅ 仅加载极简 Boot 域，砍掉所有重度并发，保障 3 秒大厅畅通
                await this.loadCoreConfigsWithTimeout();
                coreReady = true;
            } catch (e) {
                Logger.error("核心资源加载失败，触发原生重试机制", e);
                await this.showNativeRetryDialog();
            }
        }

        this.registerModules();
        this.listenGlobalEvents();
        this.listenEngineLifecycle();

        let appStarted = false;
        while (!appStarted) {
            try {
                // 启动基础设施大厅，瞬间上屏
                await App.Instance.start();
                appStarted = true;
            } catch (e) {
                Logger.error("大厅启动失败，触发原生重试机制", e);
                await this.showNativeRetryDialog();
            }
        }

        // 大厅渲染完毕，玩家可以交互时，释放后台静默预加载
        this.preloadBattleInBackground();
    }

    private async loadCoreConfigsWithTimeout(): Promise<void> {
        const timeoutPromise = new Promise<void>((_, reject) => {
            setTimeout(() => reject(new Error("核心配置表加载超时(8s)")), 8000);
        });

        const loadTask = (async () => {
            // 只加载大厅骨架必须依赖的表，其余全踢到后台
            await ConfigManager.Instance.loadTables(BOOT_CONFIGS, 'config');
            // 预加载配置计划书
            await PreloadManager.loadConfig('battle_preload_config', 'config');
        })();

        await Promise.race([loadTask, timeoutPromise]);
    }

    private async preloadBattleInBackground(): Promise<void> {
        try {
            Logger.info(LogModule.FRAMEWORK, "▶️ 开始静默加载重度配置表与战斗资源...");

            // 将原先阻碍大厅出来的重度表，全部在这里依靠时间分片机制静默加载
            await ConfigManager.Instance.loadTables(GLOBAL_AND_BATTLE_CONFIGS, 'config');

            // 触发 2D/3D 资源的后台静默预热
            await PreloadManager.preloadGroup();

        } catch (e) {
            Logger.warn("后台战斗资源预热失败（可在点击战斗时重试）", e);
        }
    }

    private showNativeRetryDialog(): Promise<void> {
        return new Promise(resolve => {
            // @ts-ignore
            if (typeof wx !== 'undefined' && wx.showModal) {
                // @ts-ignore
                wx.showModal({
                    title: '网络连接波动',
                    content: '法阵连接超时，请检查网络环境后重试',
                    confirmText: '重新连接',
                    showCancel: false,
                    success: () => resolve()
                });
            } else {
                setTimeout(() => resolve(), 3000);
            }
        });
    }

    private listenEngineLifecycle() {}

    private registerModules(): void {
        const moduleSystem = App.Instance.moduleSystem;
        moduleSystem.register("BattleLoop", new BattleLoopModule());
    }

    private listenGlobalEvents() {
        DataCenter.Instance.watch(DataKey.IS_PAUSED, (paused: boolean) => {
            if (paused) {
                TweenUtil.pauseGroup(TweenGroup.BATTLE);
            } else {
                TweenUtil.resumeGroup(TweenGroup.BATTLE);
            }
        });

        DataCenter.Instance.watch(DataKey.TIME_SCALE as any, (scale: number) => {
            let s = Number(scale);
            if (isNaN(s) || s <= 0) s = 1.0;
            TweenUtil.setGroupTimeScale(TweenGroup.BATTLE, s);
        });

        EventCenter.off(EventName.SHOW_TOAST, this.handleShowToast.bind(this));
        EventCenter.on(EventName.SHOW_TOAST, this.handleShowToast.bind(this));

        EventCenter.off(EventName.SHOW_BROADCAST, this._onShowBroadcast);
        EventCenter.on(EventName.SHOW_BROADCAST, this._onShowBroadcast);
    }

    private _onShowBroadcast = (msg: any) => {
        UIManager.Instance.openUI("BroadcastUI", "prefab/BroadcastUI", UILayer.Top, msg, "ui");
    }

    private handleShowToast(msg: string) {
        UIManager.Instance.openUI("ToastUI", "prefab/Show_Toast", UILayer.Top, msg, "ui");
    }
}

class BattleLoopModule implements IModule {
    private readonly MAX_FRAME_DT: number = 0.05;

    public init(): void {}
    public start(): void {}
    public destroy(): void {}

    public update(dt: number): void {
        const safeDt = Math.min(dt, this.MAX_FRAME_DT);
        TimerManager.Instance.update(safeDt);
        if (DataCenter.Instance.get(DataKey.IS_PAUSED)) return;

        let timeScale = Number(DataCenter.Instance.get(DataKey.TIME_SCALE));
        if (isNaN(timeScale) || timeScale <= 0) timeScale = 1.0;
        const battleDt = safeDt * timeScale;
        // ... (原战斗系统调度将在此接管)
    }
}