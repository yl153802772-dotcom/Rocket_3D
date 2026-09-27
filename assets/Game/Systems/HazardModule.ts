import { find, Node } from 'cc';
import { ILifecycleModule } from '../../Framework/Core/ModuleSystem';
import { RuntimeDataCenter } from '../../Framework/Data/DataCenter';
import { RocketDataKey } from '../GameConst';
import { FlightZone } from '../Core/FlightZone';
import { SpawnModule } from './SpawnModule';

/**
 * 危险物：驱动激活陨石向 +Z 逼近，碰撞扣 HP，越过后回收。
 */
export class HazardModule implements ILifecycleModule {
    public readonly priority = 600;

    private readonly PASS_Z = 10;
    private readonly COLLIDE_RADIUS = 1.5;
    private _rocket: Node | null = null;

    public init(): void {
        this._rocket = find('Rocket');
    }

    public update(dt: number): void {
        const spawner = SpawnModule.Instance;
        if (!spawner) return;

        if (!this._rocket) this._rocket = find('Rocket');
        const rp = this._rocket ? this._rocket.worldPosition : null;
        const speed = FlightZone.Instance.forwardSpeed;

        for (let i = spawner.active.length - 1; i >= 0; i--) {
            const m = spawner.active[i];
            const p = m.position;
            p.z += speed * dt;
            m.setPosition(p);

            if (rp && p.z >= -2 && p.z <= 2) {
                const dx = rp.x - p.x;
                const dy = rp.y - p.y;
                if (dx * dx + dy * dy < this.COLLIDE_RADIUS * this.COLLIDE_RADIUS) {
                    this.hit();
                    spawner.recycle(m);
                    continue;
                }
            }

            if (p.z > this.PASS_Z) spawner.recycle(m);
        }
    }

    private hit(): void {
        const hp = RuntimeDataCenter.Instance.get(RocketDataKey.PLAYER_HP) || 0;
        const next = hp - 1;
        RuntimeDataCenter.Instance.set(RocketDataKey.PLAYER_HP, next);
        console.log('[深空火箭] 命中！HP =', next);
    }

    public dispose(): void {
        this._rocket = null;
    }
}
