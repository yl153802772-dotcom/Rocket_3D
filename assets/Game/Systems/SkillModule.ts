import { RuntimeDataCenter } from '../../Framework/Data/DataCenter';
import { ConfigManager } from '../../Framework/Core/ConfigManager';
import { ILifecycleModule } from '../../Framework/Core/ModuleSystem';
import { ConfigKey, RocketDataKey } from '../GameConst';
import { SkillRow } from '../Core/BattleConfig';

/**
 * 技能模块：按区域过滤 skill.json 得到可用池；具体技能效果由插件实现。
 */
export class SkillModule implements ILifecycleModule {
    public readonly priority = 440;
    private _lastZone = 0;

    public init(): void {
        this._lastZone = this.currentZone;
        this.logPool();
    }

    public get currentZone(): number {
        return RuntimeDataCenter.Instance.get(RocketDataKey.CURRENT_ZONE) || 1;
    }

    public getAvailablePool(): SkillRow[] {
        const zone = this.currentZone;
        return ConfigManager.Instance.getAll<SkillRow>(ConfigKey.SKILL).filter(r => r.zone <= zone);
    }

    public update(_dt: number): void {
        const zone = this.currentZone;
        if (zone !== this._lastZone) {
            this._lastZone = zone;
            this.logPool();
        }
    }

    private logPool(): void {
        console.log('[Skill] 区域', this.currentZone, '可用技能', this.getAvailablePool().map(r => r.id));
    }

    public dispose(): void {}
}
