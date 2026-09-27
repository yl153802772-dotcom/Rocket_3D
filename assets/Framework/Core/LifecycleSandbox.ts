/**
 * @module LifecycleSandbox
 * @description
 * [模块逻辑]
 * 通用生命周期安全沙箱。解决对象池复用或组件销毁时，忘记解绑全局事件、数据监听和定时器导致的静态引用泄漏问题。
 *
 * [调用规则]
 * 1. 任何非继承自 UIBase 的业务组件（如 3D 怪物、子弹系统），如需监听全局事件，应在内部实例化一个 LifecycleSandbox。
 * 2. 在组件的 onEnable/onSpawn 阶段，通过 sandbox.listenEvent / watchData 注册。
 * 3. 在组件的 onDisable/onRecycle/onDestroy 阶段，无脑调用 sandbox.dispose() 即可安全物理熔断所有引用。
 */

import { EventCenter } from '../Data/EventCenter';
import {ArchiveDataCenter, DataCenter, DataWatcher, RuntimeDataCenter} from '../Data/DataCenter';
import { TimerManager, TimerGroup } from './TimerTool/TimerManager';
import { EventPayloadMap, DataPayloadMap } from 'db://assets/Framework/Core/GameConst';
import { Logger, LogModule } from './Logger';

export class LifecycleSandbox {
    private _ownerName: string;

    // 使用 Set 确保高频增删的 O(1) 性能，防范重复添加
    private _eventSandbox: Set<{ eventName: string, callback: any }> = new Set();
    private _dataSandbox: Set<{ key: string, callback: any }> = new Set();
    private _timerSandbox: Set<number> = new Set();

    // 拆分双向数据桶
    private _archiveDataSandbox: Set<{ key: string, callback: any }> = new Set();
    private _runtimeDataSandbox: Set<{ key: string, callback: any }> = new Set();
    
    constructor(ownerName: string = "Unknown") {
        this._ownerName = ownerName;
    }

    // 代理持久化数据 (如图鉴解锁、金币)
    public watchArchiveData<K extends keyof DataPayloadMap>(key: K, callback: DataWatcher<K>): void {
        ArchiveDataCenter.Instance.watch(key, callback);
        this._archiveDataSandbox.add({ key: key as string, callback });
    }

    // 代理运行时数据 (如 HP、MP、暂停锁)
    public watchRuntimeData<K extends keyof DataPayloadMap>(key: K, callback: DataWatcher<K>): void {
        RuntimeDataCenter.Instance.watch(key, callback);
        this._runtimeDataSandbox.add({ key: key as string, callback });
    }

    /**
     * 代理注册全局事件
     */
    public listenEvent<K extends keyof EventPayloadMap>(eventName: K, callback: (data: EventPayloadMap[K]) => void): void {
        EventCenter.on(eventName, callback);
        this._eventSandbox.add({ eventName: eventName as string, callback });
    }

    /**
     * 代理注册数据监听
     */
    public watchData<K extends keyof DataPayloadMap>(key: K, callback: (newValue: DataPayloadMap[K], oldValue: DataPayloadMap[K]) => void): void {
        DataCenter.Instance.watch(key, callback);
        this._dataSandbox.add({ key: key as string, callback });
    }

    /**
     * 代理注册单次定时器
     */
    public doOnce(delaySec: number, callback: Function, target?: any, groupId: TimerGroup = TimerGroup.BATTLE): number {
        const timerId = TimerManager.Instance.doOnce(delaySec, callback, target, groupId);
        this._timerSandbox.add(timerId);
        return timerId;
    }

    /**
     * 代理注册循环定时器
     */
    public doLoop(intervalSec: number, repeat: number, callback: Function, target?: any, groupId: TimerGroup = TimerGroup.BATTLE): number {
        const timerId = TimerManager.Instance.doLoop(intervalSec, repeat, callback, target, groupId);
        this._timerSandbox.add(timerId);
        return timerId;
    }

    /**
     * 一键物理熔断所有关联引用（在对象回收或销毁时调用）
     */
    public dispose(): void {
        if (this._eventSandbox.size > 0) {
            this._eventSandbox.forEach(item => EventCenter.off(item.eventName as any, item.callback));
            this._eventSandbox.clear();
        }

        if (this._dataSandbox.size > 0) {
            this._dataSandbox.forEach(item => DataCenter.Instance.unwatch(item.key as keyof DataPayloadMap, item.callback));
            this._dataSandbox.clear();
        }

        if (this._timerSandbox.size > 0) {
            this._timerSandbox.forEach(timerId => TimerManager.Instance.remove(timerId));
            this._timerSandbox.clear();
        }

        if (this._archiveDataSandbox.size > 0) {
            this._archiveDataSandbox.forEach(item => ArchiveDataCenter.Instance.unwatch(item.key as any, item.callback));
            this._archiveDataSandbox.clear();
        }

        if (this._runtimeDataSandbox.size > 0) {
            this._runtimeDataSandbox.forEach(item => RuntimeDataCenter.Instance.unwatch(item.key as any, item.callback));
            this._runtimeDataSandbox.clear();
        }

        Logger.info(LogModule.FRAMEWORK, `[Sandbox] 实体 [${this._ownerName}] 的安全沙箱已完全熔断释放`);
    }
}
