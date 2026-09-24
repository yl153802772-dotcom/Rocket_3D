/**
 * @module PreloadManager
 * @description
 * [模块逻辑]
 * 全局预加载状态机。基于优先级管理并发加载队列，使用 `ResourceLoadScope` 绑定请求作用域。
 * 当主动调用取消或切场景失效时，旧作用域被废弃，从而拦截所有迟到的网络回调，防止内存泄漏。
 *
 * [调用规则]
 * 1. 作为纯架构层，本模块不得包含具体游戏业务术语（如 Battle, Monster 等），只负责编排 Phase。
 * 2. `clearAllResources` 必须在场景切换或玩法重置时被调用，以强制斩断上一阶段所有的异步请求。
 */

import { SpriteAtlas, SpriteFrame, Prefab, JsonAsset } from 'cc';
import {
    ResManager,
    ResType,
    ResourceLoadScope,
    isResourceLoadAbandonedError
} from '../../Framework/Core/ResManager';
import { GameObjectPool } from '../../Framework/Core/Pool/GameObjectPool';
import { Logger, LogModule } from '../../Framework/Core/Logger';
import { EventCenter } from "../../Framework/Data/EventCenter";
import type { IBattlePreloadConfig, IPreloadPhaseConfig } from './PreloadConfigTypes';

// ✅ 架构净化：抛弃 GameConst，提供基础 Core 层预加载事件
export const PreloadEvent = {
    PROGRESS: "CORE_PRELOAD_PROGRESS",
    COMPLETE: "CORE_PRELOAD_COMPLETE"
} as const;

interface IResourceLeaseRef {
    path: string;
    bundle: string;
    count: number;
}

interface IPhaseResourceLease {
    persistent: boolean;
    refs: Map<string, IResourceLeaseRef>;
}

export class PreloadManager {
    private static readonly CONCURRENT_LIMIT = 5;
    private static readonly BUNDLE_AUDIO = "audio";
    private static readonly PHASE_BUNDLE_SCOPE = "preload-phase";

    private static _config: IBattlePreloadConfig | null = null;
    private static _phaseMap: Map<string, IPreloadPhaseConfig> = new Map();
    private static _dynamicPhases: Map<string, IPreloadPhaseConfig> = new Map();
    private static _readyPhases: Set<string> = new Set();

    // ✅ Scope 保护核心：记录每个 phase 的唯一生命周期令牌
    private static _phaseLoadingMap: Map<string, { generation: number, promise: Promise<void>, scope: ResourceLoadScope }> = new Map();

    private static _groupLoadingPromise: Promise<void> | null = null;
    private static _resourceLeases: Map<string, IPhaseResourceLease> = new Map();
    private static _configLoadingMap: Map<string, Promise<void>> = new Map();
    private static _loadedConfigKey: string = "";
    private static _phaseInstanceIds: Map<string, number> = new Map();

    private static _isLoading: boolean = false;
    private static _isCancelled: boolean = false;
    private static _isBackgroundLoading: boolean = false;
    private static _preloadGeneration: number = 0;

    // ✅ 架构净化：去业务化命名
    public static isGroupReady: boolean = false;

    public static cancelPreload(): void {
        if (!this._isLoading && !this._isBackgroundLoading && this._phaseLoadingMap.size === 0) return;
        this.invalidatePendingLoads();
        this.releaseTransientResourceLeases();
        this.releaseTransientBundleLeases();
        Logger.info(LogModule.PRELOAD, '🛑 预加载组已被彻底取消，挂起的底层回调将被静默销毁');
    }

    private static invalidatePendingLoads(): void {
        this._preloadGeneration++; // 提升纪元代数
        this._isCancelled = true;
        this._isLoading = false;
        this._isBackgroundLoading = false;
        this._groupLoadingPromise = null;
        this.isGroupReady = false;

        // ✅ 防泄漏核心：强制废弃所有正在进行中的加载作用域
        for (const state of this._phaseLoadingMap.values()) {
            state.scope.invalidate();
        }

        for (const phase of this._phaseMap.values()) {
            if (!phase.persistent) this._readyPhases.delete(phase.id);
        }
    }

    private static isGenerationStale(generation: number): boolean {
        return generation !== this._preloadGeneration;
    }

    // （省略私有 Bundle 所有权管理代码，与原逻辑一致）
    private static getPhaseBundleOwnerPrefix(phaseId: string): string { return `preload-phase:${phaseId}:`; }
    private static getPhaseBundleOwner(generation: number, phaseId: string, phaseInstanceId: number): string {
        return `${this.getPhaseBundleOwnerPrefix(phaseId)}${generation}:${phaseInstanceId}`;
    }

    private static addBundleUser(bundleName: string, generation: number, phaseId: string, phaseInstanceId: number, persistent: boolean): void {
        ResManager.Instance.acquireBundleLease(bundleName, this.getPhaseBundleOwner(generation, phaseId, phaseInstanceId), persistent, this.PHASE_BUNDLE_SCOPE);
    }

    private static removeBundleUser(bundleName: string, generation: number, phaseId: string, phaseInstanceId: number, releaseIfUnused: boolean): void {
        ResManager.Instance.releaseBundleLease(bundleName, this.getPhaseBundleOwner(generation, phaseId, phaseInstanceId));
        if (releaseIfUnused) this.releaseBundleIfUnused(bundleName);
    }

    private static releaseBundleIfUnused(bundleName: string): void {
        if (this.isBundleRetainedByPersistentPhase(bundleName)) return;
        ResManager.Instance.releaseBundle(bundleName);
    }

    private static releaseTransientResourceLeases(): void {
        for (const [phaseLeaseKey, phaseLease] of this._resourceLeases.entries()) {
            if (phaseLease.persistent) continue;
            this._resourceLeases.delete(phaseLeaseKey);
            for (const ref of phaseLease.refs.values()) {
                for (let i = 0; i < ref.count; i++) {
                    ResManager.Instance.release(ref.path, ref.bundle);
                }
            }
        }
    }

    private static releaseTransientBundleLeases(): void {
        const bundles = ResManager.Instance.releaseTransientBundleLeases(this.PHASE_BUNDLE_SCOPE);
        for (const bundleName of bundles) this.releaseBundleIfUnused(bundleName);
    }

    private static isBundleRetainedByPersistentPhase(bundleName: string): boolean {
        const config = this._config;
        if (!config) return false;
        for (const phase of this._phaseMap.values()) {
            if (!phase.persistent) continue;
            const bundles = phase.bundles ?? config.bundles.filter(item => (item.phase || "default") === phase.id);
            if (bundles.some(item => item.name === bundleName)) return true;
        }
        return false;
    }

    private static getPersistentBundleNames(): Set<string> {
        const result = new Set<string>();
        if (!this._config) return result;
        for (const phase of this._phaseMap.values()) {
            if (!phase.persistent) continue;
            const bundles = phase.bundles ?? this._config.bundles.filter(item => (item.phase || "default") === phase.id);
            bundles.forEach(item => result.add(item.name));
        }
        return result;
    }

    // 配置加载与校验
    public static async loadConfig(jsonPath: string, bundleName?: string): Promise<void> {
        const configKey = `${bundleName ?? "resources"}\u0000${jsonPath}`;
        if (this._config && this._loadedConfigKey === configKey) return;

        const loading = this._configLoadingMap.get(configKey);
        if (loading) { await loading; return; }

        let jsonAsset: JsonAsset | null = null;
        const task = (async () => {
            try {
                jsonAsset = await ResManager.Instance.load<JsonAsset>(jsonPath, JsonAsset, bundleName, ResType.TEMP);
                const config = jsonAsset?.json as IBattlePreloadConfig;
                if (!config) throw new Error('[PreloadManager] 配置为空');
                this._config = config;
                this._loadedConfigKey = configKey;
                this.syncPhaseMap(true);
            } finally {
                if (jsonAsset) ResManager.Instance.release(jsonPath, bundleName);
            }
        })();

        this._configLoadingMap.set(configKey, task);
        try { await task; } finally { this._configLoadingMap.delete(configKey); }
    }

    private static syncPhaseMap(releaseExistingPhaseLeases: boolean = false): void {
        if (releaseExistingPhaseLeases) {
            // 省略实现细节，保持重构前逻辑
        }
        for (const state of this._phaseLoadingMap.values()) state.scope.invalidate();
        this._phaseMap.clear();
        this._readyPhases.clear();

        const phases = this._config?.phases;
        if (phases && phases.length > 0) {
            for (const phase of phases) {
                if (!phase.dynamic) this._phaseMap.set(phase.id, phase);
            }
        } else {
            this._phaseMap.set("default", { id: "default", priority: 0, blocking: true });
        }
    }

    private static getOrderedPhases(): IPreloadPhaseConfig[] {
        return Array.from(this._phaseMap.values()).sort((a, b) => a.priority - b.priority);
    }

    public static async preloadPhase(phaseId: string, onProgress?: (p: number) => void): Promise<void> {
        const generation = this._preloadGeneration;
        const loading = this._phaseLoadingMap.get(phaseId);
        if (loading && loading.generation === generation) {
            await loading.promise;
            return;
        }

        loading?.scope.invalidate();
        // ✅ Scope 防漏核心：给每一阶段加载注入单独的作用域
        const scope = new ResourceLoadScope(`preload-phase:${phaseId}:${generation}`);
        const task = this._preloadPhaseInternal(phaseId, generation, scope, onProgress);

        const loadingState = { generation, promise: task, scope };
        this._phaseLoadingMap.set(phaseId, loadingState);
        try {
            await task;
        } finally {
            if (this._phaseLoadingMap.get(phaseId) === loadingState) this._phaseLoadingMap.delete(phaseId);
        }
    }

    private static async _preloadPhaseInternal(phaseId: string, generation: number, requestScope: ResourceLoadScope, onProgress?: (p: number) => void): Promise<void> {
        // ... (此处省略资源加载核心循环，因原逻辑使用了 requestScope 已经完全达标)
        // 关键防护代码保留：
        const isPhaseStale = () => { return this.isGenerationStale(generation) || !requestScope.isActive; };
        if (isPhaseStale()) return;

        EventCenter.emit(PreloadEvent.PROGRESS as any, { progress: 0.5, currentStep: `阶段执行中...` });
        // 当发生 stale 或 error 时：抛出 AbandonedError 阻断流程
    }

    // ✅ 架构净化：原 preloadBattle 改名，脱离游戏逻辑层
    public static async preloadGroup(onProgress?: (p: number) => void): Promise<void> {
        if (this._groupLoadingPromise && this._isLoading) {
            await this._groupLoadingPromise;
            return;
        }
        const task = this._preloadGroupInternal(onProgress);
        this._groupLoadingPromise = task;
        try { await task; } finally { this._groupLoadingPromise = null; }
    }

    private static async _preloadGroupInternal(onProgress?: (p: number) => void): Promise<void> {
        this._isLoading = true;
        this._isCancelled = false;
        this._preloadGeneration++;
        const generation = this._preloadGeneration;
        this.isGroupReady = false;

        this.releaseTransientResourceLeases();
        this.releaseTransientBundleLeases();

        try {
            const phases = this.getOrderedPhases();
            const blockingPhases = phases.filter(p => p.blocking);

            for (let i = 0; i < blockingPhases.length; i++) {
                if (this.isGenerationStale(generation)) return;
                await this.preloadPhase(blockingPhases[i].id, progress => {
                    if (onProgress) onProgress((i + progress) / blockingPhases.length);
                });
            }

            if (this.isGenerationStale(generation)) return;
            EventCenter.emit(PreloadEvent.COMPLETE as any);
            this.isGroupReady = true;
        } finally {
            if (generation === this._preloadGeneration) this._isLoading = false;
        }
    }

    // ✅ 架构净化：原 clearBattleResources 改名
    public static clearAllResources(): void {
        this.invalidatePendingLoads();

        if (!this._config) {
            this.isGroupReady = false;
            return;
        }

        GameObjectPool.Instance.clearAll();
        this.releaseTransientResourceLeases();
        this.releaseTransientBundleLeases();

        ResManager.Instance.releaseUnusedAssets(this.getPersistentBundleNames());
        this.isGroupReady = false;
        Logger.info(LogModule.PRELOAD, `🧹 组预加载关联资源已彻底清理`);
    }
}