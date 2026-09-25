/**
 * @module App
 * @description
 * [模块逻辑]
 * 游戏全局唯一入口与总调度中心。
 * 本次重构在启动管线中注入了 CameraManager，确保在 UI 与 游戏模块加载前，3D/2D 相机系统已完成绝对层级隔离。
 */

import { ModuleSystem } from "./ModuleSystem";
import { EventCenter } from "../Data/EventCenter";
import {ArchiveDataCenter, DataCenter, RuntimeDataCenter} from "../Data/DataCenter";
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
import { director, input, Input, EventKeyboard, KeyCode } from "cc";
import { TweenUtil } from "db://assets/Framework/Utils/TweenUtil";
import { AnimationHelper } from "db://assets/Framework/Core/AnimationHelper";
import { DataKey } from "db://assets/Framework/Core/GameConst";
import { ShareManager } from "db://assets/Framework/Core/ShareManager";
import { GameObjectPool } from "./Pool/GameObjectPool";
import { CameraManager } from "./CameraManager"; // ✅ 引入相机管家

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

        // ✅ 核心依赖修复：顺位调整，必须在 UIManager 初始化前启动相机的物理隔离
        CameraManager.Instance.init();
        UIManager.Instance.init();

        AudioSystem.Instance.init();

        // ✅ 清理架构债务：移除了之前在该处重复调用 ShareManager.Instance.init() 的历史遗留 Bug
        // (在 01_CoreFramework_Overview.md 中指出的风险已闭环修复)

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

        // ✅ 同步重构：分别初始化持久化中心与运行时中心
        ArchiveDataCenter.Instance.init();
        RuntimeDataCenter.Instance.init();
        
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
            // ✅ 同步重构：在线时间等需跨档位保存的数据，调用 ArchiveDataCenter
            ArchiveDataCenter.Instance.set(DataKey.LAST_ONLINE_TIMESTAMP as any, Date.now());
            SaveManager.Instance.saveToDisk(true);
        });
        wx.onShow(() => { Logger.info(LogModule.APP, "回到前台"); });
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