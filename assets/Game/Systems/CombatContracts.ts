/**
 * 战斗能力插件契约：武器/技能以独立插件实现，按区域动态装卸。
 */
export interface ICombatContext {
    readonly currentZone: number;
}

export interface IWeapon {
    readonly id: string;
    init(ctx: ICombatContext): void;
    equip(): void;
    fire(): void;
    update(dt: number): void;
    unequip(): void;
    dispose(): void;
}

export interface ISkillContext {
    readonly currentZone: number;
}

export interface ISkill {
    readonly id: string;
    init(ctx: ISkillContext): void;
    canUse(): boolean;
    use(): void;
    update(dt: number): void;
    dispose(): void;
}
