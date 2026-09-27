import { find, Node, Vec3 } from 'cc';
import { CameraManager } from '../../Framework/Core/CameraManager';
import { ILifecycleModule } from '../../Framework/Core/ModuleSystem';

/**
 * 后上方 3/4 追尾相机：固定后上方偏移 + 固定俯角 + X/Y 部分跟随（防眩晕）。
 */
export class CameraRig implements ILifecycleModule {
    public readonly priority = 900;

    private readonly FOLLOW = 0.2;
    private readonly OFFSET = new Vec3(0, 8, 12);
    private readonly PITCH = -25;

    private _rocket: Node | null = null;
    private _target = new Vec3();

    public init(): void {
        this._rocket = find('Rocket');
    }

    public update(dt: number): void {
        const cam = CameraManager.Instance.mainCamera;
        if (!cam || !this._rocket || !this._rocket.isValid) return;

        const rp = this._rocket.worldPosition;
        const cp = cam.node.worldPosition;

        this._target.set(
            rp.x + this.OFFSET.x,
            rp.y + this.OFFSET.y,
            rp.z + this.OFFSET.z,
        );

        cam.node.setWorldPosition(
            cp.x + (this._target.x - cp.x) * this.FOLLOW,
            cp.y + (this._target.y - cp.y) * this.FOLLOW,
            cp.z + (this._target.z - cp.z) * this.FOLLOW,
        );

        // 固定俯角（旋转锁）
        cam.node.setRotationFromEuler(this.PITCH, 0, 0);
    }

    public dispose(): void {
        this._rocket = null;
    }
}
