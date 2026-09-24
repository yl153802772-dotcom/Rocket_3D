/**
 * @module ResManager
 * @description
 * [模块逻辑]
 * 统一的异步资源调度中枢。基于引用计数、受控 LRU 与 ResourceLoadScope 提供内存安全。
 * 本次重构已将 2D 专用的图集帧缓存抽象为内部独立服务 AtlasFrameCacheService，从而使主干代码能够兼容 3D (Mesh/Material) 的纯粹 Asset 管理逻辑。
 *
 * [调用规则]
 * 1. 废弃 PERMANENT 命名，改用 ResType.EXPLICIT。它代表“引用归零时立即释放”，而非“永不释放”；长驻内存必须由业务持续持有引用。
 * 2. 禁止在业务端使用 setTimeout 延迟释放资源，所有异步请求必须绑定 Scope，并在场景切出时 invalidate()。
 */

import { AssetManager, assetManager, Asset, SpriteAtlas, SpriteFrame } from 'cc';
import { Logger, LogModule } from './Logger';
import { BundleManager, BundleLoadAbandonedError } from './BundleManager';
import { EventCenter } from "../../Framework/Data/EventCenter";

export enum ResType {
    EXPLICIT,    // 显式释放（原 PERMANENT）：引用归零立刻销毁
    NORMAL,      // LRU缓存：引用归零进入 LRU 冷宫，等待淘汰
    TEMP         // 临时资源：使用完立即销毁
}

export interface IBundleLeaseOptions {
    ownerKey: string;
    persistent?: boolean;
    scope?: string;
    requestScope?: ResourceLoadScope;
}

interface IBundleLeaseEntry {
    persistent: boolean;
    scope: string;
}

export interface ILoadedResourceRef<T extends Asset = Asset> {
    asset: T;
    path: string;
    bundleName?: string;
}

export class ResourceLoadScope {
    private _active: boolean = true;
    private _invalidateListeners = new Set<() => void>();
    constructor(public readonly name: string) {}
    public get isActive(): boolean { return this._active; }
    public invalidate(): void {
        if (!this._active) return;
        this._active = false;
        const listeners = Array.from(this._invalidateListeners);
        this._invalidateListeners.clear();
        listeners.forEach(listener => listener());
    }
    public onInvalidate(listener: () => void): () => void {
        if (!this._active) { listener(); return () => {}; }
        this._invalidateListeners.add(listener);
        return () => this._invalidateListeners.delete(listener);
    }
}

export class ResourceLoadAbandonedError extends Error {
    constructor(public readonly key: string) {
        super(`资源加载已失效并丢弃: ${key}`);
        this.name = "ResourceLoadAbandonedError";
    }
}

export function isResourceLoadAbandonedError(err: unknown): err is ResourceLoadAbandonedError | BundleLoadAbandonedError {
    return err instanceof ResourceLoadAbandonedError || err instanceof BundleLoadAbandonedError || (err as any)?.name === "ResourceLoadAbandonedError" || (err as any)?.name === "BundleLoadAbandonedError";
}

interface ILoadingResourceWaiter {
    resType: ResType;
    scope?: ResourceLoadScope;
    resolve: (asset: Asset) => void;
    reject: (reason?: any) => void;
    cleanup: () => void;
}

interface ILoadingResourceEntry {
    waiters: Set<ILoadingResourceWaiter>;
}

// ✅ 架构净化：将纯 2D 的混合图集帧缓存抽取为内部服务，不污染通用 Asset 管理管线
class AtlasFrameCacheService {
    private _frameCache = new Map<string, SpriteFrame>();

    public setFrame(cacheKey: string, frame: SpriteFrame): void {
        if (!frame || !frame.isValid) return;
        if (this._frameCache.size >= 300) {
            this._frameCache.clear();
            Logger.warn(LogModule.RES_MANAGER, `[AtlasFrameCache] 图集帧缓存达到阈值(300)，执行防爆清空`);
        }
        this._frameCache.set(cacheKey, frame);
    }
    public getFrame(cacheKey: string): SpriteFrame | null {
        const cached = this._frameCache.get(cacheKey);
        if (cached && cached.isValid) return cached;
        this._frameCache.delete(cacheKey);
        return null;
    }
    public clearByAtlas(atlasPath: string): void {
        const prefix = `${atlasPath}_`;
        for (const key of this._frameCache.keys()) {
            if (key.startsWith(prefix)) this._frameCache.delete(key);
        }
    }
    public clearByPrefix(prefix: string): void {
        for (const key of this._frameCache.keys()) {
            if (key.startsWith(prefix)) this._frameCache.delete(key);
        }
    }
    public clearAll(): void { this._frameCache.clear(); }
    public get size(): number { return this._frameCache.size; }
}

export class ResManager {
    private static _instance: ResManager;
    public static get Instance(): ResManager {
        if (!this._instance) this._instance = new ResManager();
        return this._instance;
    }

    private _bundleMap = new Map<string, AssetManager.Bundle>();
    private _loadingMap = new Map<string, ILoadingResourceEntry>();
    private _assetMap = new Map<string, Asset>();
    private _resTypeMap = new Map<string, ResType>();
    private _lruCache = new Map<string, { asset: Asset; lastAccessTime: number }>();
    private _bundleLeases = new Map<string, Map<string, IBundleLeaseEntry>>();
    private _pendingBundleReleases = new Map<string, boolean>();

    // 2D 专属缓存服务
    private _atlasCacheService = new AtlasFrameCacheService();

    private readonly MAX_LRU_COUNT = 30;
    private readonly LRU_EXPIRE_TIME = 5 * 60 * 1000;

    public init(): void {
        Logger.info(LogModule.RES_MANAGER, "ResManager 最终版初始化完成 (2D/3D解耦架构)");
        EventCenter.on("CORE_BUNDLE_RELEASED" as any, (bundleName: string) => {
            this.clearAssetsByBundle(bundleName);
        });
    }

    private getKey(path: string, bundleName?: string): string {
        return bundleName ? `${bundleName}/${path}` : path;
    }

    // ==================== Bundle 管理 (略作删减保留核心) ====================
    public async loadBundle(bundleName: string, lease?: IBundleLeaseOptions): Promise<AssetManager.Bundle> {
        if (lease?.requestScope && !lease.requestScope.isActive) throw new ResourceLoadAbandonedError(bundleName);

        let addedLease = false;
        if (lease?.ownerKey) {
            addedLease = this.acquireBundleLease(bundleName, lease.ownerKey, lease.persistent === true, lease.scope);
            this._pendingBundleReleases.delete(bundleName);
        }

        try {
            const bundle = await this._loadBundleRequest(bundleName, lease?.requestScope);
            if (bundle) this._bundleMap.set(bundleName, bundle);
            this.retryPendingBundleReleases();
            return bundle;
        } catch (err) {
            if (addedLease && lease?.ownerKey) this.releaseBundleLease(bundleName, lease.ownerKey);
            throw err;
        }
    }

    private _loadBundleRequest(bundleName: string, requestScope?: ResourceLoadScope): Promise<AssetManager.Bundle> {
        if (!requestScope) return BundleManager.loadBundle(bundleName);
        return new Promise<AssetManager.Bundle>((resolve, reject) => {
            let settled = false;
            let removeInvalidateListener = requestScope.onInvalidate(() => {
                if (settled) return;
                settled = true;
                reject(new ResourceLoadAbandonedError(bundleName));
            });
            BundleManager.loadBundle(bundleName).then(
                bundle => { if (!settled) { settled = true; removeInvalidateListener(); resolve(bundle); } },
                err => { if (!settled) { settled = true; removeInvalidateListener(); reject(err); } }
            );
        });
    }

    public acquireBundleLease(bundleName: string, ownerKey: string, persistent: boolean = false, scope: string = "default"): boolean {
        let owners = this._bundleLeases.get(bundleName);
        if (!owners) { owners = new Map<string, IBundleLeaseEntry>(); this._bundleLeases.set(bundleName, owners); }
        const existing = owners.get(ownerKey);
        if (existing) { existing.persistent = existing.persistent || persistent; return false; }
        owners.set(ownerKey, { persistent, scope });
        return true;
    }

    public releaseBundleLease(bundleName: string, ownerKey: string): boolean {
        const owners = this._bundleLeases.get(bundleName);
        if (!owners || !owners.delete(ownerKey)) return false;
        if (owners.size === 0) this._bundleLeases.delete(bundleName);
        return this.releaseBundle(bundleName);
    }

    public releaseTransientBundleLeases(scope?: string): string[] {
        const releasedBundles: string[] = [];
        for (const [bundleName, owners] of this._bundleLeases.entries()) {
            let changed = false;
            for (const [ownerKey, lease] of owners.entries()) {
                if (lease.persistent) continue;
                if (scope !== undefined && lease.scope !== scope) continue;
                owners.delete(ownerKey);
                changed = true;
            }
            if (owners.size === 0) this._bundleLeases.delete(bundleName);
            if (changed) releasedBundles.push(bundleName);
        }
        return releasedBundles;
    }

    // ==================== 单资源加载 ====================
    public load<T extends Asset>(path: string, type: any, bundleName?: string, resType: ResType = ResType.NORMAL, onProgress?: (finished: number, total: number) => void, requestScope?: ResourceLoadScope): Promise<T> {
        const key = this.getKey(path, bundleName);
        if (requestScope && !requestScope.isActive) return Promise.reject(new ResourceLoadAbandonedError(key));

        if (this._assetMap.has(key)) {
            const asset = this._assetMap.get(key)!;
            if (!asset || !asset.isValid) {
                this._assetMap.delete(key); this._resTypeMap.delete(key);
            } else {
                asset.addRef();
                const existingType = this._resTypeMap.get(key);
                if (existingType && existingType !== resType && resType === ResType.EXPLICIT) {
                    this._resTypeMap.set(key, resType);
                }
                return Promise.resolve(asset as T);
            }
        }

        if (resType === ResType.NORMAL && this._lruCache.has(key)) {
            const item = this._lruCache.get(key)!;
            this._lruCache.delete(key);
            if (item.asset && item.asset.isValid) {
                item.lastAccessTime = Date.now();
                this._assetMap.set(key, item.asset);
                this._resTypeMap.set(key, ResType.NORMAL);
                return Promise.resolve(item.asset as T);
            }
        }

        const existingLoading = this._loadingMap.get(key);
        if (existingLoading) return this._joinLoadingEntry<T>(key, existingLoading, resType, requestScope);

        const entry: ILoadingResourceEntry = { waiters: new Set() };
        this._loadingMap.set(key, entry);

        const task = this._loadWithRetry<T>(path, type, bundleName, 3, onProgress);
        void task.then(
            asset => this._completeLoadingEntry(key, entry, asset, resType),
            err => this._failLoadingEntry(key, entry, err)
        );
        return this._joinLoadingEntry<T>(key, entry, resType, requestScope);
    }

    private _joinLoadingEntry<T extends Asset>(key: string, entry: ILoadingResourceEntry, resType: ResType, requestScope?: ResourceLoadScope): Promise<T> {
        if (requestScope && !requestScope.isActive) return Promise.reject(new ResourceLoadAbandonedError(key));
        return new Promise<T>((resolve, reject) => {
            const waiter: ILoadingResourceWaiter = {
                resType, scope: requestScope, resolve: asset => resolve(asset as T), reject, cleanup: () => {}
            };
            waiter.cleanup = requestScope?.onInvalidate(() => {
                if (!entry.waiters.delete(waiter)) return;
                waiter.reject(new ResourceLoadAbandonedError(key));
            }) ?? (() => {});
            entry.waiters.add(waiter);
        });
    }

    private _completeLoadingEntry(key: string, entry: ILoadingResourceEntry, asset: Asset, initialResType: ResType): void {
        if (this._loadingMap.get(key) === entry) this._loadingMap.delete(key);
        const waiters = Array.from(entry.waiters);
        entry.waiters.clear();

        if (!asset || !asset.isValid) {
            const error = new Error(`加载结果无效: ${key}`);
            waiters.forEach(w => { w.cleanup(); w.reject(error); });
            this.retryPendingBundleReleasesForKey(key);
            return;
        }

        const activeWaiters: ILoadingResourceWaiter[] = [];
        const abandonedWaiters: ILoadingResourceWaiter[] = [];
        for (const w of waiters) {
            w.cleanup();
            if (w.scope && !w.scope.isActive) abandonedWaiters.push(w);
            else activeWaiters.push(w);
        }

        if (activeWaiters.length === 0) {
            assetManager.releaseAsset(asset);
            abandonedWaiters.forEach(w => w.reject(new ResourceLoadAbandonedError(key)));
            this.retryPendingBundleReleasesForKey(key);
            return;
        }

        let finalResType = initialResType;
        for (const w of activeWaiters) {
            if (w.resType === ResType.EXPLICIT) { finalResType = ResType.EXPLICIT; break; }
        }

        for (let i = 0; i < activeWaiters.length; i++) asset.addRef();
        this._assetMap.set(key, asset);
        this._resTypeMap.set(key, finalResType);

        activeWaiters.forEach(w => w.resolve(asset));
        abandonedWaiters.forEach(w => w.reject(new ResourceLoadAbandonedError(key)));
        this.retryPendingBundleReleasesForKey(key);
    }

    private _failLoadingEntry(key: string, entry: ILoadingResourceEntry, err: any): void {
        if (this._loadingMap.get(key) === entry) this._loadingMap.delete(key);
        const waiters = Array.from(entry.waiters);
        entry.waiters.clear();
        waiters.forEach(w => { w.cleanup(); w.reject(err); });
        this.retryPendingBundleReleasesForKey(key);
    }

    // ==================== 资源释放 ====================
    public release(path: string, bundleName?: string): void {
        const key = this.getKey(path, bundleName);
        const asset = this._assetMap.get(key);
        if (!asset) return;

        asset.decRef(false);
        if (asset.refCount <= 0) {
            const resType = this._resTypeMap.get(key);
            this._assetMap.delete(key);
            this._resTypeMap.delete(key);

            if (resType === ResType.EXPLICIT || resType === ResType.TEMP) {
                assetManager.releaseAsset(asset);
                this.retryPendingBundleReleasesForKey(key);
                return;
            }

            if (asset.isValid) {
                asset.addRef();
                this._lruCache.set(key, { asset, lastAccessTime: Date.now() });
                this.checkLRUCapacity();
            } else {
                assetManager.releaseAsset(asset);
            }
            this.retryPendingBundleReleasesForKey(key);
        }
    }

    private checkLRUCapacity(): void {
        if (this._lruCache.size <= this.MAX_LRU_COUNT) return;
        let oldestKey = ""; let oldestTime = Number.MAX_VALUE;
        this._lruCache.forEach((item, key) => {
            if (item.lastAccessTime < oldestTime) { oldestTime = item.lastAccessTime; oldestKey = key; }
        });
        if (oldestKey) this.realRelease(oldestKey);
    }

    public clearExpiredLRU(): void {
        const now = Date.now();
        const expired: string[] = [];
        this._lruCache.forEach((item, key) => {
            if (now - item.lastAccessTime > this.LRU_EXPIRE_TIME) expired.push(key);
        });
        expired.forEach(key => this.realRelease(key));
    }

    private realRelease(key: string): void {
        const item = this._lruCache.get(key);
        if (item) {
            if (item.asset && item.asset.isValid) {
                this._atlasCacheService.clearByAtlas(key);
                try { assetManager.releaseAsset(item.asset); } catch(e){}
            }
            this._lruCache.delete(key);
        }
    }

    // ==================== 混合图集提取器 (2D 专属) ====================
    public getHybridSpriteFrame(atlasPath: string, frameName: string, bundleName?: string): SpriteFrame | null {
        const cacheKey = `${bundleName || 'resources'}/${atlasPath}_${frameName}`;
        let cached = this._atlasCacheService.getFrame(cacheKey);
        if (cached) return cached;

        const atlasKey = this.getKey(atlasPath, bundleName);
        const atlas = this._assetMap.get(atlasKey) as SpriteAtlas;
        if (atlas && atlas.isValid) {
            const frame = atlas.getSpriteFrame(frameName);
            if (frame) { this._atlasCacheService.setFrame(cacheKey, frame); return frame; }
        }

        const possiblePaths = [`${atlasPath}/${frameName}/spriteFrame`, `${atlasPath}/${frameName}`];
        for (const framePath of possiblePaths) {
            const frameKey = this.getKey(framePath, bundleName);
            const frame = this._assetMap.get(frameKey) as SpriteFrame;
            if (frame && frame.isValid) {
                this._atlasCacheService.setFrame(cacheKey, frame);
                return frame;
            }
        }
        return null;
    }

    // ==================== 引擎交互与其他 ====================
    private async _loadWithRetry<T extends Asset>(path: string, type: any, bundleName?: string, maxRetry: number = 3, onProgress?: (f: number, t: number) => void): Promise<T> {
        let attempt = 0;
        while (attempt <= maxRetry) {
            try {
                let loader: any = assetManager.resources;
                if (bundleName) loader = await this.loadBundle(bundleName);
                return await new Promise<T>((resolve, reject) => {
                    loader.load(path, type, (f: number, t: number) => onProgress?.(f, t), (err: Error | null, asset: T) => {
                        if (err) reject(err); else resolve(asset);
                    });
                });
            } catch (err) {
                attempt++;
                if (attempt > maxRetry) throw err;
                await new Promise(res => setTimeout(res, attempt * 1000));
            }
        }
        throw new Error(`加载失败: ${path}`);
    }

    public releaseUnusedAssets(preserveBundles?: Iterable<string>): void {
        const manager = assetManager as any;
        if (typeof manager.releaseUnusedAssets !== "function") return;

        const preservedPrefixes = Array.from(preserveBundles ?? []).filter(name => !!name).map(name => `${name}/`);
        for (const key of Array.from(this._lruCache.keys())) {
            if (preservedPrefixes.some(prefix => key.startsWith(prefix))) continue;
            this.realRelease(key);
        }

        for (const [key, asset] of this._assetMap.entries()) {
            if (!asset || !asset.isValid) { this._assetMap.delete(key); this._resTypeMap.delete(key); }
        }

        try { manager.releaseUnusedAssets(); } catch(e){}
        this.retryPendingBundleReleases();
        Logger.info(LogModule.RES_MANAGER, "[ResManager] 已执行 releaseUnusedAssets 兜底清理");
    }

    public clearAssetsByBundle(bundleName: string, force: boolean = false): void {
        const prefix = `${bundleName}/`;
        for (const [key, asset] of this._assetMap.entries()) {
            if (key.startsWith(prefix)) {
                if (force || !asset || !asset.isValid || asset.refCount <= 0) {
                    if (asset?.isValid) assetManager.releaseAsset(asset);
                    this._assetMap.delete(key);
                    this._resTypeMap.delete(key);
                }
            }
        }
        for (const [key, item] of this._lruCache.entries()) {
            if (key.startsWith(prefix)) {
                if (item.asset && item.asset.isValid) assetManager.releaseAsset(item.asset);
                this._lruCache.delete(key);
            }
        }
        this._atlasCacheService.clearByPrefix(prefix);
    }

    // (其余 Bundle 重试与判定逻辑保持原有稳定实现)
    public releaseBundle(bundleName: string, force: boolean = false): boolean {
        if (!force && !this.canReleaseBundle(bundleName)) {
            this._pendingBundleReleases.set(bundleName, false);
            return true;
        }
        this._pendingBundleReleases.delete(bundleName);
        this.clearAssetsByBundle(bundleName, force);
        BundleManager.releaseBundle(bundleName);
        this._bundleMap.delete(bundleName);
        return true;
    }
    public retryPendingBundleReleases(): void {
        for (const bundleName of Array.from(this._pendingBundleReleases.keys())) {
            if (this.canReleaseBundle(bundleName)) this.releaseBundle(bundleName);
        }
    }
    private retryPendingBundleReleasesForKey(key: string): void {
        for (const bundleName of Array.from(this._pendingBundleReleases.keys())) {
            if (key.startsWith(`${bundleName}/`) && this.canReleaseBundle(bundleName)) this.releaseBundle(bundleName);
        }
    }
    private canReleaseBundle(bundleName: string): boolean {
        if ((this._bundleLeases.get(bundleName)?.size ?? 0) > 0) return false;
        const prefix = `${bundleName}/`;
        for (const [key, asset] of this._assetMap.entries()) {
            if (key.startsWith(prefix) && asset && asset.isValid && asset.refCount > 0) return false;
        }
        for (const key of this._loadingMap.keys()) {
            if (key.startsWith(prefix)) return false;
        }
        return true;
    }
}