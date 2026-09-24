/**
 * @module TimerManager
 * @description
 * [模块逻辑]
 * 游戏级多通道定时器系统。提供支持时间缩放（TimeScale）与频道隔离（TimerGroup）的零GC定时器池。
 *
 * [调用规则]
 * 1. 业务端调用 doOnce/doLoop 时，必须根据使用场景传入对应的 TimerGroup（如 UI 倒计时使用 UI 频道，怪物生成使用 BATTLE 频道）。
 * 2. 避免直接对 Target 执行全局暴力的 stopAll，业务组件销毁时调用 removeByTarget(this) 安全剥离。
 */

import { isValid } from 'cc';
import { Logger, LogModule } from '../Logger';

export enum TimerGroup {
    BATTLE = 0, // 战斗层：受战术暂停与全局倍速影响
    UI = 1      // 交互层：独立于战术暂停（如倒计时弹窗、技能CD渲染）
}

export class TimerTask {
    public id: number;
    public delay: number;
    public elapsed: number = 0;
    public repeat: number;
    public currentRepeat: number = 0;
    public callback: Function;
    public target: any;
    public isFinished: boolean = false;
    public isPaused: boolean = false;
    public groupId: TimerGroup = TimerGroup.BATTLE;
    public isTween: boolean = false;

    public onSpawn(id: number, delay: number, repeat: number, callback: Function, target: any, groupId: TimerGroup, isTween: boolean) {
        this.id = id;
        this.delay = delay;
        this.repeat = repeat;
        this.callback = callback;
        this.target = target;
        this.groupId = groupId;
        this.isTween = isTween;
        this.elapsed = 0;
        this.currentRepeat = 0;
        this.isFinished = false;
        this.isPaused = false;
    }

    public update(dt: number) {
        if (this.isPaused || this.isFinished) return;
        this.elapsed += dt;
        if (this.elapsed >= this.delay) {
            this.elapsed -= this.delay;
            this.currentRepeat++;
            if (this.callback) this.callback.call(this.target, dt);
            if (this.repeat > 0 && this.currentRepeat >= this.repeat) this.isFinished = true;
        }
    }

    public onRecycle(): void {
        this.callback = null;
        this.target = null;
    }
}

export class TimerManager {
    private static _instance: TimerManager;
    public static get Instance(): TimerManager {
        if (!this._instance) this._instance = new TimerManager();
        return this._instance;
    }

    private _tasks: TimerTask[] = [];
    private _taskPool: TimerTask[] = [];
    private _taskIdCounter: number = 0;

    public timeScale: number = 1.0;
    public isPaused: boolean = false; // 总闸

    // ✅ 频道调度控制
    private _groupPaused: Map<TimerGroup, boolean> = new Map();
    private _groupTimeScales: Map<TimerGroup, number> = new Map();

    public init(): void {
        Logger.info(LogModule.FRAMEWORK, "TimerManager 初始化完成，引入频道调度隔离");
    }

    public setGroupPaused(group: TimerGroup, isPaused: boolean) {
        this._groupPaused.set(group, isPaused);
    }

    public setGroupTimeScale(group: TimerGroup, scale: number) {
        this._groupTimeScales.set(group, scale);
    }

    public update(dt: number): void {
        if (this.isPaused) return;

        for (let i = this._tasks.length - 1; i >= 0; i--) {
            const task = this._tasks[i];
            if (task.isFinished) {
                this.recycleTask(task, i);
                continue;
            }

            if (task.target && typeof task.target.isValid === 'boolean' && !isValid(task.target)) {
                this.recycleTask(task, i);
                continue;
            }

            // ✅ 独立读取任务所属频道的暂停状态
            const groupPaused = this._groupPaused.get(task.groupId) ?? false;
            if (groupPaused) continue;

            const groupScale = this._groupTimeScales.get(task.groupId) ?? 1.0;
            const finalDt = dt * this.timeScale * groupScale;

            task.update(finalDt);
        }
    }

    private recycleTask(task: TimerTask, index: number) {
        task.onRecycle();
        this._taskPool.push(task);
        this._tasks.splice(index, 1);
    }

    public doOnce(delaySec: number, callback: Function, target?: any, groupId: TimerGroup = TimerGroup.BATTLE): number {
        return this.addTimer(delaySec, 1, callback, target, groupId, false);
    }

    public doLoop(intervalSec: number, repeat: number, callback: Function, target?: any, groupId: TimerGroup = TimerGroup.BATTLE): number {
        return this.addTimer(intervalSec, repeat, callback, target, groupId, false);
    }

    public addTweenTask(callback: Function, target: any, groupId: TimerGroup): number {
        return this.addTimer(0, 0, callback, target, groupId, true);
    }

    private addTimer(delay: number, repeat: number, callback: Function, target: any, groupId: TimerGroup, isTween: boolean): number {
        let task = this._taskPool.pop();
        if (!task) task = new TimerTask();
        const id = ++this._taskIdCounter;
        task.onSpawn(id, delay, repeat, callback, target, groupId, isTween);
        this._tasks.push(task);
        return id;
    }

    public remove(id: number): void {
        const task = this._tasks.find(t => t.id === id);
        if (task) task.isFinished = true;
    }7

    public removeByTarget(target: any): void {
        this._tasks.forEach(task => { if (task.target === target) task.isFinished = true; });
    }

    public removeTweensByTarget(target: any): void {
        this._tasks.forEach(task => { if (task.target === target && task.isTween) task.isFinished = true; });
    }
}