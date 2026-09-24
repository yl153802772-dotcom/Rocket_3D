/**
 * @module EventCenter
 * @description
 * [模块逻辑]
 * 强类型约束的全局事件中心。负责 UI、系统模块、不同平台适配代码之间的解耦通信。
 * 通过延时清理和副本迭代，解决了迭代期间注销或修改监听器的数组越界与污染问题。
 *
 * [调用规则]
 * 1. 业务层监听的所有事件名称必须在 EventPayloadMap 中静态定义，并严格约束传参的 TypeScript 强类型。
 * 2. 属于长时间存活节点的事件监听（on），务必在关闭（close/onDestroy）时调用 off 进行注销，防止内存及生命周期泄漏。
 * 3. 避免在回调中直接捕获 UI 节点而不管理监听生命周期。
 */
import { EventPayloadMap } from "../Core/GameConst";

type EventCallback<K extends keyof EventPayloadMap> = (data: EventPayloadMap[K]) => void;

interface EventWrapper {
    callback: any;
    once: boolean;
}

export class EventCenter {
    private static _events: Map<string, EventWrapper[]> = new Map();

    private static _iteratingEvents: Set<string> = new Set();
    private static _pendingRemovals: Array<{ eventName: string; callback: any }> = [];

    public static init(): void {
        this._events.clear();
        this._iteratingEvents.clear();
        this._pendingRemovals.length = 0;
    }

    public static on<K extends keyof EventPayloadMap>(eventName: K, callback: EventCallback<K>): void {
        this.addListener(eventName as string, callback, false);
    }

    public static once<K extends keyof EventPayloadMap>(eventName: K, callback: EventCallback<K>): void {
        this.addListener(eventName as string, callback, true);
    }

    private static addListener(eventName: string, callback: any, once: boolean): void {
        if (!this._events.has(eventName)) {
            this._events.set(eventName, []);
        }
        const list = this._events.get(eventName);
        if (list.find(e => e.callback === callback)) return;

        list.push({ callback, once });
    }

    public static emit<K extends keyof EventPayloadMap>(
        eventName: K,
        ...args: EventPayloadMap[K] extends void | undefined ? [data?: never] : [data: EventPayloadMap[K]]
    ): void {
        const data = args[0];

        const list = this._events.get(eventName as string);
        if (!list || list.length === 0) return;

        const copy = [...list];
        for (let wrapper of copy) {
            wrapper.callback(data);
            if (wrapper.once) {
                this.off(eventName, wrapper.callback);
            }
        }
    }

    public static off<K extends keyof EventPayloadMap>(eventName: K, callback: EventCallback<K>): void {
        const list = this._events.get(eventName as string);
        if (!list) return;

        const index = list.findIndex(e => e.callback === callback);
        if (index !== -1) {
            list.splice(index, 1);
        }
        if (list.length === 0) this._events.delete(eventName as string);
    }
}