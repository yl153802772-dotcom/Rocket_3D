import { IEncounterContext } from './IEncounterContext';

/**
 * 结果型事件生命周期（开箱/遗迹/商店/信号）。
 */
export interface IEncounter {
    init(context: IEncounterContext): void;
    start(): void;
    update(): void;
    dispose(): void;
}
