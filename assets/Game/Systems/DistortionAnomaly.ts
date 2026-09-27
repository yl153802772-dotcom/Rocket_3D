import { IAnomaly, IAnomalyContext } from '../Encounter/IAnomaly';
import { InputModifier } from '../Encounter/IAnomalyActions';

/**
 * 时空扭曲（方向反转）：start 推 INVERT，持续结束后 finish，dispose 移除。
 */
export class DistortionAnomaly implements IAnomaly {
    private _ctx: IAnomalyContext | null = null;
    private _duration = 3;
    private _elapsed = 0;

    public init(context: IAnomalyContext): void {
        this._ctx = context;
        this._duration = 2 + context.intensity;
        this._elapsed = 0;
    }

    public start(): void {
        this._ctx?.actions.applyInputModifier(InputModifier.INVERT);
    }

    public update(): void {
        if (!this._ctx) return;
        this._elapsed += this._ctx.deltaTime;
        if (this._elapsed >= this._duration) {
            this._ctx.finishEncounter({ isSuccess: true });
        }
    }

    public dispose(): void {
        this._ctx?.actions.removeInputModifier(InputModifier.INVERT);
        this._ctx = null;
    }
}
