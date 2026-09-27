import { RuntimeDataCenter } from '../../Framework/Data/DataCenter';
import { ILifecycleModule } from '../../Framework/Core/ModuleSystem';
import { RocketDataKey } from '../GameConst';
import { InputModifier } from '../Encounter/IAnomalyActions';

/**
 * 输入变换层：维护操作异常修饰器栈，把原始增量变换为最终移动目标。
 */
export class InputTransform implements ILifecycleModule {
    public static Instance: InputTransform = null;
    public readonly priority = 790;

    private readonly PIXELS_TO_WORLD = 0.01;
    private readonly MAX_OFFSET = 4;

    private _modifiers: InputModifier[] = [];
    private _offsetX = 0;
    private _offsetY = 0;

    public init(): void {
        InputTransform.Instance = this;
    }

    public applyRawDelta(dx: number, dy: number): void {
        let fx = dx;
        let fy = dy;
        for (const m of this._modifiers) {
            const t = this.transform(m, fx, fy);
            fx = t.x;
            fy = t.y;
        }
        this._offsetX = this.clamp(this._offsetX + fx * this.PIXELS_TO_WORLD, -this.MAX_OFFSET, this.MAX_OFFSET);
        this._offsetY = this.clamp(this._offsetY + fy * this.PIXELS_TO_WORLD, -this.MAX_OFFSET, this.MAX_OFFSET);
        RuntimeDataCenter.Instance.set(RocketDataKey.ROCKET_TARGET_X, this._offsetX);
        RuntimeDataCenter.Instance.set(RocketDataKey.ROCKET_TARGET_Y, this._offsetY);
    }

    public push(mod: InputModifier): void {
        if (!this._modifiers.includes(mod)) this._modifiers.push(mod);
    }

    public pop(mod: InputModifier): void {
        const i = this._modifiers.indexOf(mod);
        if (i >= 0) this._modifiers.splice(i, 1);
    }

    public get hasInertia(): boolean {
        return this._modifiers.includes(InputModifier.INERTIA);
    }

    private transform(mod: InputModifier, x: number, y: number): { x: number; y: number } {
        switch (mod) {
            case InputModifier.INVERT: return { x: -x, y: -y };
            case InputModifier.MIRROR: return { x: -x, y: y };
            case InputModifier.ROTATE90: return { x: y, y: -x };
            default: return { x, y };
        }
    }

    public dispose(): void {
        this._modifiers.length = 0;
        this._offsetX = 0;
        this._offsetY = 0;
        InputTransform.Instance = null;
    }

    private clamp(v: number, min: number, max: number): number {
        return v < min ? min : (v > max ? max : v);
    }
}
