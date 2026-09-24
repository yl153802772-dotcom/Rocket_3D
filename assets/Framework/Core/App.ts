/**
 * @module App
 * @description
 * [模块逻辑]
 * 游戏全局唯一入口与总调度中心。负责初始化所有核心管线（存档、数据、资源、UI、网络等）、绑定微信生命周期，并驱动模块系统心跳。
 *
 * [调用规则]
 * 1. 业务场景的入口脚本（如 GameEntry）必须且只能调用一次 App.Instance.init() 和 start()。
 * 2. 场景切换或玩法完全重置时，必须调用 beforeSceneChange() 闭环清理所有 Tween、动画、临时资源与对象池实体。
 */

import { ModuleSystem } from "./ModuleSystem";
import { EventCenter } from "../Data/EventCenter";
import { DataCenter } from "../Data/DataCenter";
import { SaveManager } from "./SaveManager";
import { AdManager } from "./AdManager";
import { UILayer, UIManager } from "./UIManager";
import { ResManager } from "./ResManager";
import { ConfigManager } from "./ConfigManager";
import { Logger, LogModule } from './Logger';
import { TimerManager } from '../Core/TimerTool/TimerManager';
import { UINavigation } from "../Components/UINavigation";
import { AudioSystem } from './AudioSystem';
import { GMManager } from '../Core/GM/GMManager';
import { director, game, input, Input, EventKeyboard, KeyCode, sys } from "cc";
import { TweenUtil } from "db://assets/Framework/Utils/TweenUtil";
import { AnimationHelper } from "db://assets/Framework/Core/AnimationHelper";
import { DataKey } from "db://assets/Framework/Core/GameConst";
import { ShareManager } from "db://assets/Framework/Core/ShareManager";
import { GameObjectPool } from "./Pool/GameObjectPool";

declare const wx: any;

export class App {
    private static _instance: App = null;

    public static get Instance(): App {
        if (!this._instance) {
            this._instance = new App();
        }
        return this._instance;
    }

    public moduleSystem: ModuleSystem = null;

    private _isInit: boolean = false;
    private _isStarted: boolean = false;

    public async init(): Promise<void> {
        if (this._isInit) return;
        Logger.info(LogModule.APP, LogModule.APP, "App 初始化开始");

        this.checkWeChatUpdate();
        await this.initFramework();

        UIManager.Instance.init();
        AudioSystem.Instance.init();
        ShareManager.Instance.init();

        this.moduleSystem = new ModuleSystem();
        this.moduleSystem.init();

        this.bindLifeCycle();
        this._isInit = true;

        Logger.info(LogModule.APP, "App 初始化完成");
    }

    private checkWeChatUpdate(): void {
        if (typeof wx === "undefined" || !wx.getUpdateManager) return;
        const updateManager = wx.getUpdateManager();
        updateManager.onCheckForUpdate((res: any) => {
            if (res.hasUpdate) Logger.info(LogModule.APP, "💡 嗅探到线上有新版本，开始静默下载...");
        });
        updateManager.onUpdateReady(() => {
            wx.showModal({
                title: '更新提示',
                content: '法阵已注入新纪元能量，请重启游戏获取最新体验！',
                showCancel: false,
                confirmText: '立即重启',
                success: (res: any) => {
                    if (res.confirm) updateManager.applyUpdate();
                }
            });
        });
        updateManager.onUpdateFailed(() => {
            wx.showModal({
                title: '更新失败',
                content: '新版本下载失败，请检查网络后删除当前小程序重新打开。',
                showCancel: false,
                confirmText: '我知道了'
            });
        });
    }

    async initFramework() {
        Logger.info(LogModule.APP, "Framework Starting...");
        await SaveManager.Instance.init();
        DataCenter.Instance.init();
        ResManager.Instance.init();
        ConfigManager.Instance.init();
        TimerManager.Instance.init();
        GMManager.Instance.init();
        AdManager.Instance.init();
        ShareManager.Instance.init();
        Logger.info(LogModule.APP, "Framework Ready!");
    }

    public async start(): Promise<void> {
        if (this._isStarted) return;
        Logger.info(LogModule.APP, "App 启动");
        await this.moduleSystem.start();
        this._isStarted = true;
        director.on("frame-update", this.update, this);
    }

    private update(dt: number): void {
        this.moduleSystem.update(dt);
    }

    private bindLifeCycle(): void {
        if (typeof wx === "undefined") return;
        wx.onHide(() => {
            Logger.info(LogModule.APP, "进入后台，触发强制同步落盘");
            DataCenter.Instance.set(DataKey.LAST_ONLINE_TIMESTAMP, Date.now());
            // ✅ 核心闭环：在系统挂起/杀进程前，绕过异步 I/O 队列，强制主线程阻塞式刷写硬盘
            SaveManager.Instance.saveToDisk(true);
        });
        wx.onShow(() => {
            Logger.info(LogModule.APP, "回到前台");
        });
    }

    private bindGlobalInput(): void {
        input.on(Input.EventType.KEY_UP, this.onKeyUp, this);
    }

    private onKeyUp(event: EventKeyboard): void {
        if (event.keyCode === KeyCode.ESCAPE || event.keyCode === KeyCode.BACKSPACE) {
            const uiManager = UIManager.Instance;
            if (uiManager._uiStack && uiManager._uiStack.length > 0) {
                uiManager.closeTopPopup();
                return;
            }
            const nav = UINavigation.Instance;
            if (nav._pageStack.length > 1) {
                nav.back();
                return;
            }
            Logger.info(LogModule.APP, "已在最底层界面");
        }
    }

    public beforeSceneChange(): void {
        try { TweenUtil.stopAll(); } catch (e) { Logger.warn(LogModule.APP, "TweenUtil.stopAll 异常", e); }
        try { AnimationHelper.clearAll(); } catch (e) { Logger.warn(LogModule.APP, "AnimationHelper.clearAll 异常", e); }
        //ResManager.Instance.clearNonPermanent();
        try { GameObjectPool.Instance.clearAll(); } catch (e) { Logger.warn(LogModule.APP, "GameObjectPool.clearAll 异常", e); }

        Logger.info(LogModule.APP, "场景切换清理完成");
    }
}