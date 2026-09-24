/**
 * UIPool.ts
 * 作用：UI复用池（减少实例化）
 */

import { Component, Node } from 'cc';

export class UIPool {

    private static _instance: UIPool;

    /** 每个UI最大缓存数量 */
    private _maxCount: number = 3;
    
    public static get Instance(): UIPool {
        if (!this._instance) {
            this._instance = new UIPool();
        }
        return this._instance;
    }

    /** UI池 */
    private _pool: Map<string, Node[]> = new Map();

    /**
     * 获取UI
     */
    public get(uiName: string): Node | null {

        const list = this._pool.get(uiName);

        if (list && list.length > 0) {

            const node = list.pop()!;
            node.active = true;

            //console.log("♻️ 复用UI:", uiName);

            return node;
        }

        return null;
    }

    /**
     * 回收UI
     */
    public recycle(uiName: string, node: Node): void {

        if (!this._pool.has(uiName)) {
            this._pool.set(uiName, []);
        }

        const list = this._pool.get(uiName)!;

        // ✅ 超出上限 → 直接销毁
        if (list.length >= this._maxCount) {

            //console.warn("超过缓存上限，销毁:", uiName);
            this._destroyNode(node);
            return;
        }

        node.removeFromParent();
        node.active = false;

        list.push(node);

        //console.log("♻️ 回收UI:", uiName, "当前数量:", list.length);
    }

    /**
     * 清空
     */
    public clear(uiName?: string): void {

        if (uiName) {
            const list = this._pool.get(uiName);
            if (list) {
                for (const node of list) {
                    this._destroyNode(node);
                }
                this._pool.delete(uiName);
            }
        } else {
            this._pool.forEach(list => {
                for (const node of list) {
                    this._destroyNode(node);
                }
            });
            this._pool.clear();
        }
    }

    private _destroyNode(node: Node): void {
        if (!node || !node.isValid) return;

        const components = node.getComponentsInChildren(Component);

        for (let i = 0; i < components.length; i++) {
            const comp = components[i] as any;
            if (comp && typeof comp.onRecycle === "function") {
                comp.onRecycle();
            }
        }

        for (let i = 0; i < components.length; i++) {
            const comp = components[i] as any;
            if (comp && typeof comp.onDestroyUI === "function") {
                comp.onDestroyUI();
            }
        }
        node.destroy();
    }
}
