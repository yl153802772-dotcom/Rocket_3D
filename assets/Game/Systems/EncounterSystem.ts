import { ILifecycleModule } from '../../Framework/Core/ModuleSystem';
import { RunDirector } from '../Core/Director/RunDirector';
import { EncounterDescriptor, EncounterType } from '../Core/Director/EncounterDescriptor';
import { IEncounter } from '../Encounter/IEncounter';
import { IAnomaly } from '../Encounter/IAnomaly';
import { EncounterResultPayload } from '../Encounter/EncounterResultPayload';
import { AnomalyContext, EncounterContext } from './EncounterContext';
import { AnomalyActions } from './AnomalyActions';
import { DistortionAnomaly } from './DistortionAnomaly';

/**
 * 遭遇战调度器：读导演描述符，装配并驱动 IEncounter/IAnomaly 生命周期。
 */
export class EncounterSystem implements ILifecycleModule {
    public readonly priority = 500;

    private _director = new RunDirector();
    private _current: IEncounter | IAnomaly | null = null;
    private _context: EncounterContext | null = null;
    private _cooldown = 0;

    public update(dt: number): void {
        if (this._cooldown > 0) {
            this._cooldown -= dt;
            return;
        }

        if (this._current) {
            this.driveCurrent(dt);
            return;
        }

        this.evaluateNext();
    }

    private evaluateNext(): void {
        const desc = this._director.evaluateNextEncounter();
        this.launch(desc);
    }

    private launch(desc: EncounterDescriptor): void {
        const onFinish = (result: EncounterResultPayload) => this.onEncounterFinish(result);

        if (desc.type === EncounterType.DISTORTION) {
            const actions = new AnomalyActions();
            const ctx = new AnomalyContext(desc.configId, desc.intensity, onFinish, actions);
            const anomaly = new DistortionAnomaly();
            anomaly.init(ctx);
            this._current = anomaly;
            this._context = ctx;
            anomaly.start();
            console.log('[Encounter] START', desc.type);
            return;
        }

        // 未实现的类型：跳过，短暂冷却后重新评估
        this._cooldown = 0.5;
    }

    private driveCurrent(dt: number): void {
        if (!this._context) return;
        this._context.encounterTime += dt;
        this._context.deltaTime = dt;
        this._current?.update();
    }

    private onEncounterFinish(result: EncounterResultPayload): void {
        console.log('[Encounter] FINISH', result);
        this._current?.dispose();
        this._current = null;
        this._context = null;
        this._cooldown = 1.0;
    }

    public dispose(): void {
        this._current?.dispose();
        this._current = null;
        this._context = null;
        this._cooldown = 0;
    }
}
