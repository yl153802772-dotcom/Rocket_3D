// PerformanceMonitor.ts（进阶版）

import { Node, director } from 'cc';
import { ResManager } from '../../Core/ResManager';
import { GameObjectPool } from '../../Core/Pool/GameObjectPool';

export class PerformanceMonitor {

    private static _instance: PerformanceMonitor;
    public static get Instance() {
        if (!this._instance) this._instance = new PerformanceMonitor();
        return this._instance;
    }
    
    

    // ================= FPS =================
    private _fps: number = 60;
    private _frameCount = 0;
    private _accTime = 0;

    // ================= 趋势数据 =================
    private _fpsHistory: number[] = [];
    private _nodeHistory: number[] = [];

    private readonly HISTORY_MAX = 60; // 60秒趋势

    // ================= 当前数据 =================
    private _nodeCount = 0;

    // ================= 报警节流 =================
    private _lastWarnTime = 0;
    private readonly WARN_INTERVAL = 3000;

    private _stack: Node[] = [];

    public init() {
        console.log("PerformanceMonitor 进阶版启动");
    }

    // ================= 主更新 =================
    public update(dt: number) {

        this._frameCount++;
        this._accTime += dt;

        if (this._accTime >= 1) {

            this._fps = this._frameCount;
            this._frameCount = 0;
            this._accTime = 0;

            this._nodeCount = this.getNodeCount();

            this.recordHistory();
            this.checkWarnings();
        }
    }

    // ================= 记录趋势 =================
    private recordHistory() {

        this._fpsHistory.push(this._fps);
        this._nodeHistory.push(this._nodeCount);

        if (this._fpsHistory.length > this.HISTORY_MAX) {
            this._fpsHistory.shift();
            this._nodeHistory.shift();
        }
    }

    // ================= 核心检测 =================
    private checkWarnings() {

        const now = Date.now();

        if (now - this._lastWarnTime < this.WARN_INTERVAL) return;

        const res = ResManager.Instance.getDebugInfo?.();
        //const pool = GameObjectPool.Instance.getDebugInfo?.();

        // ===== FPS检测 =====
        if (this._fps < 30) {
            this.warn("FPS过低", this._fps);
        }

        // ===== Node泄漏检测 =====
        if (this.isNodeLeaking()) {
            this.warn("Node数量持续增长（疑似泄漏）", this._nodeCount);
        }

        // ===== LRU异常 =====
        if (res && res.lru > 50) {
            this.warn("LRU过大（资源未释放）", res.lru);
        }

        // ===== Pool异常 =====
       // if (pool && pool.total > 200) {
       ///     this.warn("对象池过大（可能未回收）", pool.total);
       // }

        this._lastWarnTime = now;
    }

    // ================= Node泄漏判断 =================
    private isNodeLeaking(): boolean {

        if (this._nodeHistory.length < 10) return false;

        let increasing = true;

        for (let i = 1; i < this._nodeHistory.length; i++) {
            if (this._nodeHistory[i] < this._nodeHistory[i - 1]) {
                increasing = false;
                break;
            }
        }

        return increasing;
    }

    // ================= 报警 =================
    private warn(msg: string, value: number) {
        console.warn(`⚠️ [性能警告] ${msg}: ${value}`);
    }

    // ================= Node统计 =================
    private getNodeCount(): number {

        const scene = director.getScene();
        if (!scene) return 0;

        let count = 0;

        const stack = this._stack;
        stack.length = 0;

        stack.push(scene as unknown as Node);

        while (stack.length > 0) {

            const node = stack.pop()!;
            count++;

            const children = node.children;

            for (let i = 0; i < children.length; i++) {
                stack.push(children[i]);
            }
        }

        return count;
    }

    // ================= 外部接口 =================

    public getFPS() {
        return this._fps;
    }

    public getNode() {
        return this._nodeCount;
    }

    public getAverageFPS(): number {
        if (this._fpsHistory.length === 0) return this._fps;
        return this._fpsHistory.reduce((a, b) => a + b, 0) / this._fpsHistory.length;
    }

    public getTrend() {
        return {
            fps: this._fpsHistory,
            node: this._nodeHistory
        };
    }

    public getResInfo() {
        return ResManager.Instance.getDebugInfo?.() || {};
    }

    public getPoolInfo() {
        //return GameObjectPool.Instance.getDebugInfo?.() || {};
    }
}