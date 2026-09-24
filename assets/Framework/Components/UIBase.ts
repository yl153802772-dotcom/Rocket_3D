/**
 * @module UIBase
 * @description
 * [模块逻辑]
 * 核心 UI 基类。封装了 UI 的开关动画、安全回调追踪，以及最核心的 资源/事件/定时器 自动清理机制。
 * 引入 ResourceLoadScope 控制异步资源的声明周期，根治了 UI 关闭后请求才返回导致的内存悬空泄漏。
 *
 * [调用规则]
 * 1. UI 类必须继承此基类。动态加载内部资源必须使用 this.loadAsset()，不要直接调 ResManager，以保证作用域安全。
 * 2. 非常驻 UI 关闭时自动触发 onDestroyUI 释放资源；常驻 UI (KeepAlive) 深度隐藏时可由 UIManager 手动触发 releaseTrackedAssets 剥离显存。
 */

import { _decorator, Component, Node, tween, Vec3, UIOpacity, Tween, Asset } from 'cc';
import { EventCenter } from '../Data/EventCenter';
import { DataCenter } from '../Data/DataCenter';
import { ResManager, ResourceLoadScope, ResType } from '../Core/ResManager'; // ✅ 导入 Scope
import { Logger, LogModule } from '../Core/Logger';
import { EventName, EventPayloadMap, DataKey, DataPayloadMap } from "../Core/GameConst";
import { TimerGroup, TimerManager } from '../Core/TimerTool/TimerManager';

const { ccclass } = _decorator;

@ccclass('UIBase')
export class UIBase extends Component {

    public _inited: boolean = false;
    protected _opacity: UIOpacity = null;

    protected _closeResolve: (value: any) => void = null;

    private _trackedAssets: { path: string, bundleName?: string }[] = [];
    private _trackedEvents: { eventName: string, callback: any }[] = [];
    private _trackedData: { key: string, callback: any }[] = [];
    private _assetRevision: number = 0;

    // ✅ 核心闭环修复：引入 UI 级的请求护盾，自动静默废弃迟到的资源回调
    private _uiScope: ResourceLoadScope = null;

    private _onCloseSelfCallback: ((resultData?: any) => void) | null = null;

    public setCloseSelfCallback(callback: (resultData?: any) => void): void {
        this._onCloseSelfCallback = callback;
    }

    public onInit(): void {
        this._opacity = this.getComponent(UIOpacity) || this.addComponent(UIOpacity);
        // 初始化专属作用域护盾
        this._uiScope = new ResourceLoadScope(`UI_${this.node.name}_${this._assetRevision}`);
    }

    public onShow(data?: any): void {
        this.ensureInit();
        this.resetUIState();
        this.node.active = true;
        this.playOpenAnim();
    }

    public onHide(): void {
        this.playCloseAnim(() => {
            this.node.active = false;
            Tween.stopAllByTarget(this.node);
            if (this._opacity) Tween.stopAllByTarget(this._opacity);
            TimerManager.Instance.removeByTarget(this);
        });
    }

    public setCloseResolve(resolve: (value: any) => void) {
        if (this._closeResolve) {
            Logger.warn(`[UIBase] ${this.node.name} 已有 closeResolve，新的会被忽略`);
            return;
        }
        this._closeResolve = resolve;
    }

    // ✅ 核心闭环修复：基于 Scope 的受控异步加载
    public async loadAsset<T extends Asset>(path: string, type: any, bundleName?: string): Promise<T> {
        if (!this._uiScope) {
            this._uiScope = new ResourceLoadScope(`UI_${this.node.name}_${this._assetRevision}`);
        }

        const requestRevision = this._assetRevision;

        // 把当前 UI 的护盾传递到底层资源管理器
        const asset = await ResManager.Instance.load<T>(
            path,
            type,
            bundleName,
            ResType.NORMAL,
            undefined,
            this._uiScope
        );

        if (asset) {
            if (!this.node || !this.node.isValid || requestRevision !== this._assetRevision) {
                ResManager.Instance.release(path, bundleName);
                return null as T;
            }
            this._trackedAssets.push({ path, bundleName });
        }
        return asset;
    }

    /**
     * 归还原 UI 生命周期内通过 loadAsset 获取的引用。
     * 常驻 UI 被隐藏、非常驻 UI 被销毁进入对象池前，必须调用。
     */
    public releaseTrackedAssets(): void {
        this._assetRevision++;

        // 废除当前的加载护盾，任何正在路上还未回来的下载请求都会被无声抛弃！
        if (this._uiScope) {
            this._uiScope.invalidate();
            this._uiScope = new ResourceLoadScope(`UI_${this.node.name}_${this._assetRevision}`);
        }

        const assets = this._trackedAssets;
        this._trackedAssets = [];
        assets.forEach(item => ResManager.Instance.release(item.path, item.bundleName));
    }

    public listenEvent<K extends keyof EventPayloadMap>(eventName: K, callback: (data: EventPayloadMap[K]) => void): void {
        EventCenter.on(eventName, callback);
        this._trackedEvents.push({ eventName: eventName as string, callback });
    }

    public watchData<K extends keyof DataPayloadMap>(key: K, callback: (newValue: DataPayloadMap[K], oldValue: DataPayloadMap[K]) => void): void {
        DataCenter.Instance.watch(key, callback);
        this._trackedData.push({ key: key as string, callback });
    }

    public onDestroyUI(): void {
        Logger.info(LogModule.UIBase, `销毁 UI，执行自动清理: ${this.node.name}`);

        this._trackedEvents.forEach(item => EventCenter.off(item.eventName as any, item.callback));
        this._trackedEvents.length = 0;

        this._trackedData.forEach(item => {
            DataCenter.Instance.unwatch(item.key as keyof DataPayloadMap, item.callback);
        });
        this._trackedData.length = 0;

        this.releaseTrackedAssets();

        Tween.stopAllByTarget(this.node);
        if (this._opacity) Tween.stopAllByTarget(this._opacity);
        TimerManager.Instance.removeByTarget(this);
    }

    protected resetUIState(): void {
        Tween.stopAllByTarget(this.node);
        this.node.setScale(new Vec3(1, 1, 1));
        if (this._opacity) {
            Tween.stopAllByTarget(this._opacity);
            this._opacity.opacity = 255;
        }
    }

    protected playOpenAnim(): void {
        if (!this.node || !this.node.isValid) return;
        if (!this._opacity || !this._opacity.isValid) return;
        this.node.setScale(new Vec3(0.8, 0.8, 1));
        this._opacity.opacity = 0;
        tween(this.node).to(0.2, { scale: new Vec3(1, 1, 1) }).start();
        tween(this._opacity).to(0.2, { opacity: 255 }).start();
    }

    protected playCloseAnim(callback?: Function): void {
        if (!this.node || !this.node.isValid) {
            if (callback) callback();
            return;
        }
        tween(this.node)
            .to(0.15, { scale: new Vec3(0.8, 0.8, 1) })
            .call(() => callback && callback())
            .start();

        if (this._opacity && this._opacity.isValid) {
            tween(this._opacity).to(0.15, { opacity: 0 }).start();
        }
    }

    protected ensureInit(): void {
        if (this._inited) return;
        this.onInit();
        this._inited = true;
    }

    protected doOnce(delaySec: number, callback: Function): number {
        return TimerManager.Instance.doOnce(delaySec, callback, this, TimerGroup.UI);
    }

    protected doLoop(intervalSec: number, repeat: number, callback: Function): number {
        return TimerManager.Instance.doLoop(intervalSec, repeat, callback, this);
    }

    public closeSelf(resultData?: any): void {
        if (!this._onCloseSelfCallback && !this._closeResolve) return;
        const closeCallback = this._onCloseSelfCallback;
        const closeResolve = this._closeResolve;

        this._onCloseSelfCallback = null;
        this._closeResolve = null;

        if (closeCallback) closeCallback(resultData);
        if (closeResolve) closeResolve(resultData);
    }
}