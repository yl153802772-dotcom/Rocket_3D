/**
 * @module EventCenter
 * @description
 * [模块逻辑]
 * 强类型约束的全局事件中心。负责 UI、系统模块、不同平台适配代码之间的解耦通信。
 * 通过延时清理和副本迭代，解决了迭代期间注销或修改监听器的数组越界与污染问题。
 * * 强类型约束的全局事件中心。
 *  * 本次重构激活了真正的遍历期安全移除（Pending Removals），并增加了业务异常隔离舱（Try-Catch Isolation）。
 *  *
 *
 * [调用规则]
 * 1. 业务层监听的所有事件名称必须在 EventPayloadMap 中静态定义，并严格约束传参的 TypeScript 强类型。
 * 2. 属于长时间存活节点的事件监听（on），务必在关闭（close/onDestroy）时调用 off 进行注销，防止内存及生命周期泄漏。
 * 3. 避免在回调中直接捕获 UI 节点而不管理监听生命周期。
 */
import { EventPayloadMap } from "../Core/GameConst";
import { Logger, LogModule } from "../Core/Logger";

type EventCallback<K extends keyof EventPayloadMap> = (data: EventPayloadMap[K]) => void;

interface EventWrapper {
    callback: any;
    once: boolean;
}

export class EventCenter {
    private static _events: Map<string, EventWrapper[]> = new Map();

    // 记录正在广播的事件名，防止在 emit 期间直接 splice 数组引发跳帧
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
        const list = this._events.get(eventName)!;
        if (list.find(e => e.callback === callback)) return;

        list.push({ callback, once });
    }

    public static emit<K extends keyof EventPayloadMap>(
        eventName: K,
        ...args: EventPayloadMap[K] extends void | undefined ? [data?: never] : [data: EventPayloadMap[K]]
    ): void {
        const data = args[0];
        const nameStr = eventName as string;

        const list = this._events.get(nameStr);
        if (!list || list.length === 0) return;

        // ✅ 安全锁：标记当前事件正在遍历中
        this._iteratingEvents.add(nameStr);

        const copy = [...list];
        for (const wrapper of copy) {
            // 在副本遍历期间，如果该 callback 已被其他监听者请求 off，则跳过
            const isPendingRemove = this._pendingRemovals.some(r => r.eventName === nameStr && r.callback === wrapper.callback);
            if (isPendingRemove) continue;

            try {
                wrapper.callback(data);
            } catch (e) {
                // ✅ 异常隔离：单一业务的报错不会卡死整个全局事件总线
                Logger.error(LogModule.FRAMEWORK, `[EventCenter] 触发事件 ${nameStr} 时发生业务异常`, e);
            }

            if (wrapper.once) {
                this.off(eventName, wrapper.callback);
            }
        }

        // ✅ 解锁并结算延迟移除队列
        this._iteratingEvents.delete(nameStr);
        if (!this._iteratingEvents.has(nameStr)) {
            this.processPendingRemovals(nameStr);
        }
    }

    public static off<K extends keyof EventPayloadMap>(eventName: K, callback: EventCallback<K>): void {
        const nameStr = eventName as string;

        // ✅ 并发防暴：如果在 emit 期间请求注销，挂入延迟队列，避免直接切割破坏当前迭代逻辑
        if (this._iteratingEvents.has(nameStr)) {
            this._pendingRemovals.push({ eventName: nameStr, callback });
            return;
        }

        this.removeDirectly(nameStr, callback);
    }

    private static removeDirectly(eventName: string, callback: any): void {
        const list = this._events.get(eventName);
        if (!list) return;

        const index = list.findIndex(e => e.callback === callback);
        if (index !== -1) {
            list.splice(index, 1);
        }
        if (list.length === 0) {
            this._events.delete(eventName);
        }
    }

    private static processPendingRemovals(eventName: string): void {
        for (let i = this._pendingRemovals.length - 1; i >= 0; i--) {
            const pending = this._pendingRemovals[i];
            if (pending.eventName === eventName) {
                this.removeDirectly(eventName, pending.callback);
                this._pendingRemovals.splice(i, 1);
            }
        }
    }
}