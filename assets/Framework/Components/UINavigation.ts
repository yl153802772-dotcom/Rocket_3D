/**
 * UINavigation.ts
 * 作用：UI导航（返回栈）
 */

import { UIManager } from "../Core/UIManager";
import { UILayer } from "../Core/UIManager";
import {Logger} from "db://assets/Framework/Core/Logger";

// UINavigation.ts 完整修复版
export class UINavigation {

    private static _instance: UINavigation;

    public static get Instance(): UINavigation {
        if (!this._instance) {
            this._instance = new UINavigation();
        }
        return this._instance;
    }

    public _pageStack: string[] = [];

    // 🔴 新增：记录每个页面的加载路径
    private _pagePathMap: Map<string, { path: string; bundleName?: string }> = new Map();

    /**
     * 打开页面（Scene/Window）
     */
    public openPage(uiName: string, path: string, data?: any, bundleName?: string) {
        const current = this.getCurrentPage();
        if (current) {
            UIManager.Instance.closeUI(current);
        }

        // 🔴 修复：记录路径信息
        this._pagePathMap.set(uiName, { path, bundleName });

        UIManager.Instance.openUI(uiName, path, UILayer.Window, data, bundleName);
        this._pageStack.push(uiName);
    }

    /**
     * 返回
     */
    public back(): void {
        if (this._pageStack.length <= 1) return;

        const current = this._pageStack.pop();
        UIManager.Instance.closeUI(current);

        const prev = this.getCurrentPage();
        if (prev) {
            // 🔴 修复：从 pathMap 中获取路径
            const pathInfo = this._pagePathMap.get(prev);
            if (pathInfo && pathInfo.path) {
                UIManager.Instance.openUI(prev, pathInfo.path, UILayer.Window, undefined, pathInfo.bundleName);
            } else {
                Logger.warn(`[UINavigation] 无法找到页面 ${prev} 的加载路径`);
            }
        }
    }

    public getCurrentPage(): string {
        return this._pageStack[this._pageStack.length - 1] || "";
    }

    public clear(): void {
        this._pageStack.length = 0;
        this._pagePathMap.clear();
    }
}