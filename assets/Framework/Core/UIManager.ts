/**
 * @module UIManager
 * @description
 * [模块逻辑]
 * 游戏唯一的 UI 管线编排者。本次重构（Priority 7）移除了野蛮的 Canvas 搜索。
 * UIManager 现直接挂靠至 CameraManager 统筹的 uiCanvasNode 下，彻底完成渲染分层解耦。
 */

import { _decorator, Node, Prefab, instantiate, find, UITransform, UIOpacity, BlockInputEvents, Tween, Layers, Widget } from 'cc';
import { UIBase } from "../Components/UIBase";
import { ResManager, ResType } from "./ResManager";
import { UIPool } from "../Components/UIPool";
import { Logger, LogModule } from "./Logger";
import { CameraManager } from "./CameraManager"; // ✅ 导入相机管家

const { ccclass } = _decorator;

export enum UILayer {
    Scene = "Scene",
    Window = "Window",
    Popup = "Popup",
    Top = "Top",
    Guide = "Guide"
}

@ccclass('UIManager')
export class UIManager {
    private static _instance: UIManager = null;
    public static get Instance(): UIManager {
        if (!this._instance) this._instance = new UIManager();
        return this._instance;
    }

    private _root: Node = null;
    private _layers: Map<UILayer, Node> = new Map();
    private _uiMap: Map<string, UIBase> = new Map();
    public _uiStack: string[] = [];
    private _loadingUI: Set<string> = new Set();
    private _maskNode: Node = null;
    private _uiLock: boolean = false;
    private _uiPathMap: Map<string, { path: string, bundleName?: string }> = new Map();

    private _popupQueue: Array<{
        uiName: string, path: string, layer: UILayer, data?: any, bundleName?: string, resolve: (ui: UIBase) => void
    }> = [];

    private _isShowingPopup: boolean = false;
    private _isOpeningPopup: boolean = false;

    private _uiCacheConfig: Map<string, { keepAlive?: boolean }> = new Map([
        ["MainMenuView", { keepAlive: true }],
        ["HUDUI", { keepAlive: true }],
        ["ShopUI", { keepAlive: true }],
        ["BagUI", { keepAlive: true }],
        ["BroadcastUI", { keepAlive: true }]
    ]);

    public init(): void {
        Logger.info(LogModule.UI_MANAGER, "UIManager 初始化 (通过 CameraManager 接管渲染根节点)");

        // ✅ 架构解耦：不再硬编码寻找 Canvas，直接读取 CameraSystem 隔离好的 UI 画布
        this._root = CameraManager.Instance.uiCanvasNode;
        if (!this._root) {
            Logger.error(LogModule.UI_MANAGER, "致命错误：未能从 CameraManager 获取到 2D 画布！");
            return;
        }

        this.createLayer(UILayer.Scene);
        this.createLayer(UILayer.Window);
        this.createLayer(UILayer.Popup);
        this.createLayer(UILayer.Top);
        this.createLayer(UILayer.Guide);
    }

    public openDialog<T = any>(uiName: string, path: string, data?: any, bundleName?: string): Promise<T> {
        return new Promise<T>((resolve) => {
            this.openUI(uiName, path, UILayer.Popup, data, bundleName).then((uiBase: UIBase) => {
                if (uiBase) uiBase.setCloseResolve(resolve);
                else resolve(null);
            });
        });
    }

    public openUI(uiName: string, path: string, layer: UILayer, data?: any, bundleName?: string): Promise<UIBase> {
        if (layer === UILayer.Popup) {
            const isInQueue = this._popupQueue.some(p => p.uiName === uiName);
            const isShowing = this._uiStack.indexOf(uiName) !== -1;
            const isLoading = this._loadingUI.has(uiName);

            if (isInQueue || isShowing || isLoading) return Promise.resolve(null);

            return new Promise((resolve) => {
                this._popupQueue.push({ uiName, path, layer, data, bundleName, resolve });
                this._tryShowNextPopup();
            });
        }

        if (this._uiLock) return Promise.resolve(null);
        return this._openUIInternalAsync(uiName, path, layer, data, bundleName);
    }

    private _tryShowNextPopup(): void {
        if (this._isShowingPopup || this._isOpeningPopup) return;
        if (this._popupQueue.length === 0) return;

        const next = this._popupQueue.shift();
        if (!next) return;

        this._isOpeningPopup = true;
        Logger.info(LogModule.UI_MANAGER, "📤 显示 Popup:", next.uiName);

        this._openUIInternalAsync(
            next.uiName, next.path, next.layer, next.data, next.bundleName,
            () => { this._tryShowNextPopup(); }
        ).then(next.resolve);
    }

    private _openUIInternalAsync(
        uiName: string, path: string, layer: UILayer, data?: any, bundleName?: string, onFullyOpened?: () => void
    ): Promise<UIBase> {
        return new Promise((resolve) => {
            if (this._uiMap.has(uiName)) {
                const ui = this._uiMap.get(uiName);
                if (ui && ui.node && ui.node.isValid) {
                    const parent = this._layers.get(layer);
                    if (parent) {
                        if (ui.node.parent !== parent) ui.node.setParent(parent);
                        ui.node.setSiblingIndex(parent.children.length - 1);
                    }
                    this._resetNodeSafely(ui.node);
                    this._handlePopupStack(layer, uiName, ui.node);
                    ui.onShow(data);
                    if (layer === UILayer.Popup) {
                        this._isOpeningPopup = false;
                        if (onFullyOpened) onFullyOpened();
                    }
                    resolve(ui);
                    return;
                }
                this._uiMap.delete(uiName);
            }

            if (this._loadingUI.has(uiName)) { resolve(null); return; }
            this._loadingUI.add(uiName);
            this.lockUI();

            this._loadPrefab(uiName, path, bundleName).then((prefab) => {
                let node = UIPool.Instance.get(uiName);
                if (!node) node = instantiate(prefab);

                const parent = this._layers.get(layer);
                if (parent) {
                    if (node.parent !== parent) node.setParent(parent);
                    node.setSiblingIndex(parent.children.length - 1);
                }

                this._resetNodeSafely(node);
                this._handlePopupStack(layer, uiName, node);

                const ui = node.getComponent(UIBase);
                if (ui) {
                    ui.setCloseSelfCallback((resultData) => { this.closeUI(uiName); });
                    if (!ui._inited) { ui.onInit(); ui._inited = true; }
                    ui.onShow(data);
                    this._uiMap.set(uiName, ui);
                    this._uiPathMap.set(uiName, { path, bundleName });

                    this._loadingUI.delete(uiName);
                    this.unlockUI();

                    if (layer === UILayer.Popup) {
                        this._isOpeningPopup = false;
                        if (onFullyOpened) onFullyOpened();
                    }
                    resolve(ui);
                } else {
                    if (layer === UILayer.Popup) {
                        this._isOpeningPopup = false;
                        if (onFullyOpened) onFullyOpened();
                    }
                    this._loadingUI.delete(uiName);
                    this.unlockUI();
                    resolve(null);
                }
            }).catch(err => {
                if (layer === UILayer.Popup) {
                    this._isOpeningPopup = false;
                    if (onFullyOpened) onFullyOpened();
                }
                this._loadingUI.delete(uiName);
                this.unlockUI();
                resolve(null);
            });
        });
    }

    private _resetNodeSafely(node: Node) {
        node.active = true;
        Tween.stopAllByTarget(node);
        let opacityComp = node.getComponent(UIOpacity);
        if (opacityComp) opacityComp.opacity = 255;
        const widget = node.getComponent(Widget);
        if (widget) widget.updateAlignment();
    }

    private _handlePopupStack(layer: UILayer, uiName: string, node: Node) {
        if (layer === UILayer.Popup) {
            const mask = this._getOrCreateMask();
            mask.active = true;
            mask.setSiblingIndex(0);
            const parent = this._layers.get(layer);
            node.setSiblingIndex(parent.children.length);
            this._isOpeningPopup = false;
            this._isShowingPopup = true;
            if (this._uiStack.indexOf(uiName) === -1) this._uiStack.push(uiName);
        }
    }

    public closeUI(uiName: string): void {
        if (this._isOpeningPopup) return;
        const ui = this._uiMap.get(uiName);
        if (!ui) return;

        ui.onHide();
        ui.releaseTrackedAssets();

        const config = this._uiCacheConfig.get(uiName);

        if (config?.keepAlive) {
            ui.node.active = false;
        } else {
            UIPool.Instance.recycle(uiName, ui.node);
            this._uiMap.delete(uiName);
            const info = this._uiPathMap.get(uiName);
            if (info) {
                ResManager.Instance.release(info.path, info.bundleName);
                this._uiPathMap.delete(uiName);
            }
        }

        const index = this._uiStack.indexOf(uiName);
        if (index !== -1) this._uiStack.splice(index, 1);

        if (this._uiStack.length === 0) {
            this._isShowingPopup = false;
            if (this._maskNode) this._maskNode.active = false;
            setTimeout(() => {
                if (this._popupQueue.length > 0) this._tryShowNextPopup();
            }, 0);
        }
    }

    public destroyUI(uiName: string): void {
        const ui = this._uiMap.get(uiName);
        if (!ui) return;

        ui.onDestroyUI();

        if (ui.node && ui.node.isValid) ui.node.destroy();

        const info = this._uiPathMap.get(uiName);
        if (info) {
            ResManager.Instance.release(info.path, info.bundleName);
            this._uiPathMap.delete(uiName);
        }

        this._uiMap.delete(uiName);

        const index = this._uiStack.indexOf(uiName);
        if (index !== -1) this._uiStack.splice(index, 1);
    }

    public closeTopPopup(): void {
        if (this._uiStack.length === 0) return;
        const topUI = this._uiStack.pop();
        this.closeUI(topUI);
    }

    public getUI<T extends UIBase>(uiName: string): T {
        return this._uiMap.get(uiName) as T;
    }

    public async preloadUI(uiName: string, path: string): Promise<void> {
        try {
            const config = this._uiCacheConfig.get(uiName);
            const resType = config?.keepAlive ? ResType.EXPLICIT : ResType.NORMAL;
            await ResManager.Instance.load<Prefab>(path, Prefab, undefined, resType);
        } catch (err) {
            Logger.error(LogModule.UI_MANAGER, "❌ 预加载失败:", uiName, path, err);
        }
    }

    public async preloadUIBatch(uiList: { uiName: string, path: string }[]): Promise<void> {
        await Promise.all(uiList.map(item => this.preloadUI(item.uiName, item.path)));
    }

    public isLocked(): boolean { return this._uiLock; }
    public lockUI(): void { this._uiLock = true; }
    public unlockUI(): void { this._uiLock = false; }

    private createLayer(layer: UILayer): void {
        const node = new Node(layer);
        node.layer = Layers.Enum.UI_2D;
        const transform = node.addComponent(UITransform);
        const canvasTransform = this._root.getComponent(UITransform);
        if (canvasTransform) transform.setContentSize(canvasTransform.contentSize);
        node.setParent(this._root);
        this._layers.set(layer, node);
    }

    private async _loadPrefab(uiName: string, path: string, bundleName?: string): Promise<Prefab> {
        const config = this._uiCacheConfig.get(uiName);
        const resType = config?.keepAlive ? ResType.EXPLICIT : ResType.NORMAL;
        try {
            const prefab = await ResManager.Instance.load<Prefab>(path, Prefab, bundleName, resType);
            if (!prefab) {
                Logger.error(LogModule.UI_MANAGER, `[UIManager] 无法加载 Prefab: ${path}`);
                return null;
            }
            return prefab;
        } catch (err) {
            Logger.error(LogModule.UI_MANAGER, `[UIManager] 加载 UI Prefab 异常: ${uiName}`, err);
            return null;
        }
    }

    private _getOrCreateMask(): Node {
        if (this._maskNode) return this._maskNode;
        const mask = new Node("UIMask");
        mask.layer = Layers.Enum.UI_2D;
        const trans = mask.addComponent(UITransform);
        trans.setContentSize(750, 1334);
        const opacity = mask.addComponent(UIOpacity);
        opacity.opacity = 120;
        mask.addComponent(BlockInputEvents);
        const popupLayer = this._layers.get(UILayer.Popup);
        mask.setParent(popupLayer);
        mask.setSiblingIndex(0);
        this._maskNode = mask;
        return mask;
    }
}