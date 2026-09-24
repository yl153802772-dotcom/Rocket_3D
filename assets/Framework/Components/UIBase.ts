/**
 * @module UIBase
 * @description
 * [模块逻辑]
 * 核心 UI 基类。本次重构（Priority 5）全面升级了【零泄漏生命周期沙箱 (Lifecycle Scope)】。
 * 废弃了手动追踪数组的旧做法，引入了原生的 Set 沙箱机制。UI 销毁时，所有资源请求、事件监听、数据订阅和定时器将被沙箱一键物理熔断。
 *
 * [调用规则]
 * 1. 业务端在 onShow 中无脑调用 listenEvent 和 watchData 即可，绝对不需要手动 off/unwatch。
 * 2. 动态加载内部资源必须使用 this.loadAsset()，不要直接调 ResManager，以保证作用域安全。
 */

import { _decorator, Component, Node, tween, Vec3, UIOpacity, Tween, Asset } from 'cc';
import { EventCenter } from '../Data/EventCenter';
import { DataCenter } from '../Data/DataCenter';
import { ResManager, ResourceLoadScope, ResType } from '../Core/ResManager';
import { Logger, LogModule } from '../Core/Logger';
import { EventPayloadMap, DataPayloadMap } from "../Core/GameConst";
import { TimerGroup, TimerManager } from '../Core/TimerTool/TimerManager';

const { ccclass } = _decorator;

@ccclass('UIBase')
export class UIBase extends Component {

    public _inited: boolean = false;
    protected _opacity: UIOpacity = null;

    protected _closeResolve: (value: any) => void = null;

    // ✅ 重构：废除易错的 Array 追踪，改用大厂沙箱集 (Sandbox Sets) 确保引用唯一且极速擦除
    private _trackedAssets: { path: string, bundleName?: string }[] = [];
    private _eventSandbox: Set<{ eventName: string, callback: any }> = new Set();
    private _dataSandbox: Set<{ key: string, callback: any }> = new Set();

    private _assetRevision: number = 0;
    private _uiScope: ResourceLoadScope = null;

    private _onCloseSelfCallback: ((resultData?: any) => void) | null = null;

    public setCloseSelfCallback(callback: (resultData?: any) => void): void {
        this._onCloseSelfCallback = callback;
    }

    public onInit(): void {
        this._opacity = this.getComponent(UIOpacity) || this.addComponent(UIOpacity);
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
            Logger.warn(LogModule.UIBase, `[UIBase] ${this.node.name} 已有 closeResolve，新的会被忽略`);
            return;
        }
        this._closeResolve = resolve;
    }

    public async loadAsset<T extends Asset>(path: string, type: any, bundleName?: string): Promise<T> {
        if (!this._uiScope) {
            this._uiScope = new ResourceLoadScope(`UI_${this.node.name}_${this._assetRevision}`);
        }

        const requestRevision = this._assetRevision;
        const asset = await ResManager.Instance.load<T>(
            path, type, bundleName, ResType.NORMAL, undefined, this._uiScope
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

    public releaseTrackedAssets(): void {
        this._assetRevision++;

        if (this._uiScope) {
            this._uiScope.invalidate();
            this._uiScope = new ResourceLoadScope(`UI_${this.node.name}_${this._assetRevision}`);
        }

        const assets = this._trackedAssets;
        this._trackedAssets = [];
        assets.forEach(item => ResManager.Instance.release(item.path, item.bundleName));
    }

    // ✅ 沙箱级追踪：事件注册
    public listenEvent<K extends keyof EventPayloadMap>(eventName: K, callback: (data: EventPayloadMap[K]) => void): void {
        EventCenter.on(eventName, callback);
        this._eventSandbox.add({ eventName: eventName as string, callback });
    }

    // ✅ 沙箱级追踪：数据注册
    public watchData<K extends keyof DataPayloadMap>(key: K, callback: (newValue: DataPayloadMap[K], oldValue: DataPayloadMap[K]) => void): void {
        DataCenter.Instance.watch(key, callback);
        this._dataSandbox.add({ key: key as string, callback });
    }

    /**
     * ✅ 沙箱销毁中枢 (Sandbox Dispose)
     */
    public onDestroyUI(): void {
        Logger.info(LogModule.UIBase, `[Sandbox] 熔断 UI 生命周期沙箱: ${this.node.name}`);

        // 1. 物理熔断所有 EventCenter 订阅
        this._eventSandbox.forEach(item => {
            EventCenter.off(item.eventName as any, item.callback);
        });
        this._eventSandbox.clear();

        // 2. 物理熔断所有 DataCenter 订阅
        this._dataSandbox.forEach(item => {
            DataCenter.Instance.unwatch(item.key as keyof DataPayloadMap, item.callback);
        });
        this._dataSandbox.clear();

        // 3. 熔断异步网络加载护盾并归还显存
        this.releaseTrackedAssets();

        // 4. 熔断表现层心跳
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