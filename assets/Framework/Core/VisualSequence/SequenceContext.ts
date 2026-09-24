/**
 * Framework/Core/VisualSequence/SequenceContext.ts
 * 🌟 净化版：绝对不包含任何游戏业务逻辑，纯粹的表现层上下文
 */
import { Node, Vec3 } from 'cc';

export class SequenceContext {
    public center: Vec3;
    public isCanceled: boolean = false;

    // 🌟 核心：用 payload 接收业务层传来的任何自定义数据（黑盒）
    public payload: any = null;

    public targetRealNode: Node | null = null;
    public parentLayer: Node | null = null;

    constructor(center: Vec3) {
        this.center = center ? center.clone() : new Vec3(0, 0, 0);
    }

    updateCenter(pos: Vec3): void {
        if (!pos) return;
        this.center.set(pos);
    }

    getCenterClone(): Vec3 {
        return this.center.clone();
    }

    setPayload(data: any): void {
        this.payload = data;
    }

    getPayload<T = any>(): T {
        return this.payload as T;
    }

    cancel(): void {
        this.isCanceled = true;
    }

    reset(center: Vec3): void {
        this.isCanceled = false;
        this.payload = null; // 洗白业务数据
        this.targetRealNode = null;
        this.parentLayer = null;
        if (center) {
            this.center.set(center);
        }
    }

    private static _pool: SequenceContext[] = [];

    public static allocate(center: Vec3): SequenceContext {
        if (this._pool.length > 0) {
            const ctx = this._pool.pop()!;
            ctx.reset(center);
            return ctx;
        }
        return new SequenceContext(center);
    }

    public static recycle(ctx: SequenceContext) {
        ctx.targetRealNode = null;
        ctx.parentLayer = null;
        ctx.payload = null; // 🛑 核心防漏：切断对业务数据的引用
        ctx.isCanceled = false;
        this._pool.push(ctx);
    }
}