import { director, find, Node } from 'cc';
import { RuntimeDataCenter } from '../../Framework/Data/DataCenter';
import { ILifecycleModule } from '../../Framework/Core/ModuleSystem';
import { RocketDataKey } from '../GameConst';
import { WhiteboxFactory } from '../Core/WhiteboxFactory';
import { InputTransform } from './InputTransform';

/**
 * 火箭：程序化创建白膜胶囊，读目标偏移做平滑移动 + 视觉偏航。
 */
export class RocketModule implements ILifecycleModule {
    public readonly priority = 700;

    private readonly K = 12;
    private readonly K_INERTIA = 4;
    private readonly BOUND_X = 6;
    private readonly BOUND_Y = 4;

    private _rocket: Node | null = null;
    private _smoothX = 0;
    private _smoothY = 0;
    private _lastX = 0;

    public init(): void {
        const root = find('Entities') || director.getScene();
        this._rocket = new Node('Rocket');
        this._rocket.setPosition(0, 0, 0);

        const model = WhiteboxFactory.createCapsule('Model');
        model.setScale(1, 2, 1);
        model.setRotationFromEuler(90, 0, 0);
        this._rocket.addChild(model);
        root.addChild(this._rocket);
    }

    public update(dt: number): void {
        if (!this._rocket || !this._rocket.isValid) return;

        const tx = RuntimeDataCenter.Instance.get(RocketDataKey.ROCKET_TARGET_X) || 0;
        const ty = RuntimeDataCenter.Instance.get(RocketDataKey.ROCKET_TARGET_Y) || 0;

        const inertia = InputTransform.Instance?.hasInertia ?? false;
        const alpha = 1 - Math.exp(-(inertia ? this.K_INERTIA : this.K) * dt);
        this._smoothX += (tx - this._smoothX) * alpha;
        this._smoothY += (ty - this._smoothY) * alpha;

        const cx = this.clamp(this._smoothX, -this.BOUND_X, this.BOUND_X);
        const cy = this.clamp(this._smoothY, -this.BOUND_Y, this.BOUND_Y);
        const vx = cx - this._lastX;

        this._rocket.setRotationFromEuler(0, 0, vx * -8);
        this._rocket.setPosition(cx, cy, 0);
        this._lastX = cx;
    }

    public dispose(): void {
        if (this._rocket && this._rocket.isValid) this._rocket.destroy();
        this._rocket = null;
    }

    private clamp(v: number, min: number, max: number): number {
        return v < min ? min : (v > max ? max : v);
    }
}
