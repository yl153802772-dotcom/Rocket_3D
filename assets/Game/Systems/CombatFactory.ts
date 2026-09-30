import { IWeapon, ISkill } from './CombatContracts';

/**
 * 武器/技能插件注册表：新增能力 = 新类 + register 一行 + JSON 一条，不动 CombatModule/SkillModule。
 */
export class WeaponFactory {
    private static _registry: Map<string, () => IWeapon> = new Map();

    public static register(id: string, ctor: () => IWeapon): void {
        this._registry.set(id, ctor);
    }

    public static create(id: string): IWeapon | null {
        const ctor = this._registry.get(id);
        return ctor ? ctor() : null;
    }
}

export class SkillFactory {
    private static _registry: Map<string, () => ISkill> = new Map();

    public static register(id: string, ctor: () => ISkill): void {
        this._registry.set(id, ctor);
    }

    public static create(id: string): ISkill | null {
        const ctor = this._registry.get(id);
        return ctor ? ctor() : null;
    }
}
