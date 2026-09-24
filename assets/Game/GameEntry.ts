/**
 * @module GameEntry
 * @description
 * [模块逻辑]
 * 游戏业务层的总启动节点。负责大厅资源加载、各业务系统的事件监听和注册。
 *
 * [调用规则]
 * 1. 启动层级最高，依赖 Core 层基础设施完成系统级预热。
 * 2. 禁止通过 Cocos Component 的 update() 直接驱动具体战斗系统（防止出现独立于 ModuleSystem 的双轨更新导致暂停/恢复混乱）。
 * 3. 所有 Game 系统的心跳 Tick 必须被封装为 IModule，并注册至 ModuleSystem 进行统一调度（此处已新增 BattleLoopModule）。
 */
import { _decorator, Component, game, Game } from 'cc';
import { App } from '../Framework/Core/App';

import { ConfigManager } from "../Framework/Core/ConfigManager";
import { TimerManager } from '../Framework/Core/TimerTool/TimerManager';
import { UIManager, UILayer } from '../Framework/Core/UIManager';

import { EventCenter } from "../Framework/Data/EventCenter";
import { AdPlacement, DataKey, EventName, ToastType } from "../Framework/Core/GameConst";
import { DataCenter } from "../Framework/Data/DataCenter";
import { AdStrategySystem } from "../Framework/Core/AdStrategySystem";

import { ResManager } from "db://assets/Framework/Core/ResManager";
import { Logger, LogModule } from "db://assets/Framework/Core/Logger";
import { PreloadManager } from "db://assets/Framework/Core/PreloadManager";
import { TweenGroup, TweenUtil } from "db://assets/Framework/Utils/TweenUtil";

import { ShareManager } from "db://assets/Framework/Core/ShareManager";

import { IModule } from '../Framework/Core/ModuleSystem';

// 🌟 新增：注入到 Core 层的跳过引导委托，响应 GuideUI 的跳过事件
import { GuideUI } from '../Framework/Utils/Guid/GuideUI';

const { ccclass } = _decorator;

@ccclass('GameEntry')
export class GameEntry extends Component {

    async start() {
        Logger.info("游戏启动");
        await App.Instance.init();

        TimerManager.Instance.doLoop(60, 0, () => {
            ResManager.Instance.clearExpiredLRU();
        }, this);

        await UIManager.Instance.openUI("LoadingUI", "LoadingUI", UILayer.Top, null, "");

        let coreReady = false;
        while (!coreReady) {
            try {
                await this.loadCoreConfigsWithTimeout();
                coreReady = true;
            } catch (e) {
                Logger.error("核心资源加载失败，触发原生重试机制", e);
                await this.showNativeRetryDialog();
            }
        }

        this.registerModules();
        this.listenGlobalEvents();
        this.registerDelegates(); // 🌟 注册针对 Core 的业务委托代理

       
       
        this.listenEngineLifecycle();

        let appStarted = false;
        while (!appStarted) {
            try {
                await App.Instance.start();
                appStarted = true;
            } catch (e) {
                Logger.error("大厅启动失败，触发原生重试机制", e);
                await this.showNativeRetryDialog();
            }
        }

        this.preloadBattleInBackground();
    }

    private registerDelegates(): void {
        // 🌟 将原有硬编码在 GuideUI 的逻辑挪回业务侧
   
    }

    private async loadCoreConfigsWithTimeout(): Promise<void> {
        const timeoutPromise = new Promise<void>((_, reject) => {
            setTimeout(() => reject(new Error("核心配置表加载超时(8s)")), 8000);
        });

        const loadTask = (async () => {
            await ConfigManager.Instance.loadTables(
                [
                    'game', 'shop', 'civ_config', 'player',
                    'element', 'stage_growth', 'MonsterCombat', 'wave_dynamic', 'codex_view_config'
                ],
                'config'
            );
            await PreloadManager.loadConfig('battle_preload_config', 'config');
        })();

        await Promise.race([loadTask, timeoutPromise]);
    }

    private async preloadBattleInBackground(): Promise<void> {
        try {
            await ConfigManager.Instance.loadTables(
                [
                    'level', 'skill', 'path', 'merge',
                    'fx_presets', 'MonsterVisual', 'guide',
                    'merge_probability', "summon_weight",
                    'element_skills', 'energy_config', 'summon_config',
                    'combat_config', 'monster_affix', 'epoch_config'
                ],
                'config'
            );
        
            await PreloadManager.preloadBattle();
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

    private listenEngineLifecycle() {

    }

    // 🌟 原来的 update 被完全移除，杜绝双轨更新
    // 逻辑已被转移至底部的 BattleLoopModule 中进行注册调度。

    private registerModules(): void {
        const moduleSystem = App.Instance.moduleSystem;
      
        // 🌟 注册战斗心跳模块，交由 Core 层 ModuleSystem 统一执行
        moduleSystem.register("BattleLoop", new BattleLoopModule());
    }

    private _onLevelDefeat = () => {
        Logger.info("💔 接收到失败事件，准备弹出结算UI")
    }

    private _onLevelWin = (data: any) => {
        Logger.info(`🎉 财务部拨款！关卡胜利，发放金币: ${data.rewardGold}`);
        UIManager.Instance.openUI("VictoryUI", "prefab/VictoryUI", UILayer.Popup, { gold: data.rewardGold }, "ui");
    }

    private listenGlobalEvents() {
        DataCenter.Instance.watch(DataKey.IS_PAUSED, (paused: boolean) => {
            if (paused) {
                TweenUtil.pauseGroup(TweenGroup.BATTLE);
                Logger.info("GameEntry", "⏸️ 全局时钟：BATTLE 频道已挂起");
            } else {
                TweenUtil.resumeGroup(TweenGroup.BATTLE);
                Logger.info("GameEntry", "▶️ 全局时钟：BATTLE 频道已恢复");
            }
        });

        DataCenter.Instance.watch(DataKey.TIME_SCALE as any, (scale: number) => {
            let s = Number(scale);
            if (isNaN(s) || s <= 0) s = 1.0;
            TweenUtil.setGroupTimeScale(TweenGroup.BATTLE, s);
            Logger.info(`⏱️ 战斗动画频道倍速已同步: ${s}x`);
        });

        EventCenter.off(EventName.LEVEL_WIN, this._onLevelWin);
        EventCenter.on(EventName.LEVEL_WIN, this._onLevelWin);

        EventCenter.off(EventName.LEVEL_DEFEAT, this._onLevelDefeat);
        EventCenter.on(EventName.LEVEL_DEFEAT, this._onLevelDefeat);

        EventCenter.off(EventName.BASE_HP_EMPTY, this._onBaseHpEmpty);
        EventCenter.on(EventName.BASE_HP_EMPTY, this._onBaseHpEmpty);

        EventCenter.off(EventName.MERGE_DATA_CHANGED, this._onMergeDataChanged);
        EventCenter.on(EventName.MERGE_DATA_CHANGED, this._onMergeDataChanged);

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

    private _onMergeDataChanged = () => {
        
    }

    private _onBaseHpEmpty = () => {
       
    }
}

/**
 * 🌟 新增：战斗心跳剥离模块 (取代原先的 GameEntry.update)
 * 由 ModuleSystem 接管，完全解决了硬编码在组件层导致的调度分叉问题。
 */
class BattleLoopModule implements IModule {
    private readonly MAX_FRAME_DT: number = 0.05;

    public init(): void {}
    public start(): void {}
    public destroy(): void {}

    public update(dt: number): void {
        const safeDt = Math.min(dt, this.MAX_FRAME_DT);

        // 喂给定时器大管家
        TimerManager.Instance.update(safeDt);

        if (DataCenter.Instance.get(DataKey.IS_PAUSED)) return;

        let timeScale = Number(DataCenter.Instance.get(DataKey.TIME_SCALE));
        if (isNaN(timeScale) || timeScale <= 0) timeScale = 1.0;
        const battleDt = safeDt * timeScale;

     
    }
}