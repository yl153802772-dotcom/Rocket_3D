import { RuntimeDataCenter } from '../../Framework/Data/DataCenter';
import { ConfigManager } from '../../Framework/Core/ConfigManager';
import { ILifecycleModule } from '../../Framework/Core/ModuleSystem';
import { ConfigKey, RocketDataKey } from '../GameConst';
import { WeaponRow } from '../Core/BattleConfig';
import { WeaponFactory } from './CombatFactory';

/**
 * 武器模块：按区域过滤 weapon.json 得到可用池；具体开火由插件实现。
 */
export class CombatModule implements ILifecycleModule {
    public readonly priority = 450;
    private _lastZone = 0;

    public init(): void {
        this._lastZone = this.currentZone;
        this.logPool();
    }

    public get currentZone(): number {
        return RuntimeDataCenter.Instance.get(RocketDataKey.CURRENT_ZONE) || 1;
    }

    public getAvailablePool(): WeaponRow[] {
        const zone = this.currentZone;
        return ConfigManager.Instance.getAll<WeaponRow>(ConfigKey.WEAPON).filter(r => r.zone <= zone);
    }

    public equip(id: string): void {
        const w = WeaponFactory.create(id);
        if (!w) {
            console.warn('[Combat] 未注册武器插件:', id);
            return;
        }
        console.log('[Combat] 装备武器:', id);
    }

    public update(_dt: number): void {
        const zone = this.currentZone;
        if (zone !== this._lastZone) {
            this._lastZone = zone;
            this.logPool();
        }
    }

    private logPool(): void {
        console.log('[Combat] 区域', this.currentZone, '可用武器', this.getAvailablePool().map(r => r.id));
    }

    public dispose(): void {}
}
