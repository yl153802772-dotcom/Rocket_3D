/**
 * PreloadConfigTypes.ts
 * 作用：预加载配置的纯类型定义（框架层，不包含任何业务数据）
 */

import { ResType } from './ResManager';

export interface IBundleConfig {
    name: string;
    phase?: string;
    isCritical?: boolean;
}

export interface IAtlasConfig {
    path: string;
    bundle: string;
    phase?: string;
    isCritical?: boolean;
}

export interface IPrefabConfig {
    path: string;
    bundle: string;
    resType: ResType;
    poolCount?: number;
    isCritical?: boolean;
    phase?: string;
}

export interface IPoolCleanupItem {
    poolKey: string;
}

export interface IPreloadPhaseConfig {
    id: string;
    priority: number;
    blocking: boolean;
    persistent?: boolean;
    dynamic?: boolean;
    bundles?: IBundleConfig[];
    atlases?: IAtlasConfig[];
    prefabs?: IPrefabConfig[];
}

export interface IBattlePreloadConfig {
    phases?: IPreloadPhaseConfig[];
    bundles: IBundleConfig[];
    atlases: IAtlasConfig[];
    prefabs: IPrefabConfig[];
    cleanupPools?: IPoolCleanupItem[];
}
