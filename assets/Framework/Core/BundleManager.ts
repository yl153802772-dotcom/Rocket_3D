/**
 * @module BundleManager
 * @description
 * [模块逻辑]
 * 核心分包加载管理器。负责物理 Bundle 的防并发请求、弱网阶梯重试、超时熔断，以及超时/被取消后的迟到结果防覆盖（Request Token 防护）。
 *
 * [调用规则]
 * 1. 业务层禁止直接调用 assetManager.loadBundle。
 * 2. 单包同时间只会发起一个物理请求，超时仅阻断上层 await，底层迟到的请求会被 `discardWhenLoaded` 标记静默抛弃，绝不污染全局状态。
 * 3. 作为纯 Core 模块，严禁反向依赖 Game 层的 GameConst，事件发射使用自身的静态只读常量。
 */

import { assetManager, AssetManager } from 'cc';
import { Logger, LogModule } from './Logger';
import { EventCenter } from "../../Framework/Data/EventCenter";

interface IBundleLoadState {
    attemptId: number;
    discardWhenLoaded: boolean;
    promise: Promise<AssetManager.Bundle>;
}

class BundleTimeoutError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "BundleTimeoutError";
    }
}

export class BundleLoadAbandonedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "BundleLoadAbandonedError";
    }
}

// ✅ 架构净化：将 Bundle 释放事件独立定义，断开对 GameConst.ts 的反向依赖
export const BundleEvent = {
    RELEASED: "CORE_BUNDLE_RELEASED"
} as const;

export class BundleManager {
    private static _bundleMap: Map<string, AssetManager.Bundle> = new Map();
    private static _loadingMap: Map<string, IBundleLoadState> = new Map();
    private static _attemptId: number = 0;

    private static readonly MAX_RETRY = 3;
    private static readonly RETRY_DELAY = 1000;
    private static readonly BUNDLE_TIMEOUT = 8000;

    public static isBundleLoading(bundleName: string): boolean {
        return this._loadingMap.has(bundleName);
    }

    public static isBundleLoaded(bundleName: string): boolean {
        return this._bundleMap.has(bundleName);
    }

    public static getLoadedBundle(bundleName: string): AssetManager.Bundle | undefined {
        return this._bundleMap.get(bundleName);
    }

    public static async loadBundle(bundleName: string): Promise<AssetManager.Bundle> {
        if (this._bundleMap.has(bundleName)) {
            return this._bundleMap.get(bundleName)!;
        }

        const currentLoading = this._loadingMap.get(bundleName);
        if (currentLoading) {
            currentLoading.discardWhenLoaded = false;
            return this.waitWithTimeout(currentLoading.promise, bundleName);
        }

        const state: IBundleLoadState = {
            attemptId: ++this._attemptId,
            discardWhenLoaded: false,
            promise: Promise.resolve(null as any)
        };

        const clearLoadingState = () => {
            if (this._loadingMap.get(bundleName) === state) {
                this._loadingMap.delete(bundleName);
            }
        };

        state.promise = this._loadPhysicalBundleWithRetry(
            bundleName,
            () => state.discardWhenLoaded
        ).then(bundle => {
            // ✅ Token 防护：如果加载期间发生了取消或严重超时，迟到的 Bundle 将被直接丢弃
            if (state.discardWhenLoaded) {
                this.removeBundleIfUnclaimed(bundleName, bundle);
                throw new BundleLoadAbandonedError(`Bundle 加载结果已过期并丢弃: ${bundleName}`);
            }
            this._bundleMap.set(bundleName, bundle);
            return bundle;
        });

        void state.promise.then(clearLoadingState, clearLoadingState);

        this._loadingMap.set(bundleName, state);
        return this.waitWithTimeout(state.promise, bundleName);
    }

    private static async _loadPhysicalBundleWithRetry(
        bundleName: string,
        shouldStopRetry: () => boolean
    ): Promise<AssetManager.Bundle> {
        let lastError: any = null;

        for (let attempt = 1; attempt <= this.MAX_RETRY; attempt++) {
            if (shouldStopRetry()) {
                throw new BundleLoadAbandonedError(`Bundle 加载已废弃: ${bundleName}`);
            }

            try {
                return await new Promise<AssetManager.Bundle>((resolve, reject) => {
                    assetManager.loadBundle(bundleName, (err, bundle) => {
                        if (err) reject(err);
                        else resolve(bundle);
                    });
                });
            } catch (err) {
                if (shouldStopRetry()) throw new BundleLoadAbandonedError(`Bundle 加载已废弃: ${bundleName}`);
                lastError = err;
                Logger.warn(LogModule.FRAMEWORK, `Bundle加载失败 [${bundleName}] 重试 ${attempt}/${this.MAX_RETRY}`);
                if (attempt >= this.MAX_RETRY) {
                    Logger.error(LogModule.FRAMEWORK, `Bundle彻底加载失败: ${bundleName}`);
                    throw err;
                }
                await this._delay(this.RETRY_DELAY * attempt);
            }
        }
        throw lastError ?? new Error(`Bundle加载异常: ${bundleName}`);
    }

    private static waitWithTimeout(
        promise: Promise<AssetManager.Bundle>,
        bundleName: string
    ): Promise<AssetManager.Bundle> {
        return new Promise<AssetManager.Bundle>((resolve, reject) => {
            let settled = false;
            const timeoutId = setTimeout(() => {
                if (settled) return;
                settled = true;
                reject(new BundleTimeoutError(`加载 Bundle 弱网超时(${this.BUNDLE_TIMEOUT}ms): ${bundleName}`));
            }, this.BUNDLE_TIMEOUT);

            promise.then(
                bundle => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timeoutId);
                    resolve(bundle);
                },
                err => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timeoutId);
                    reject(err);
                }
            );
        });
    }

    private static removeBundleIfUnclaimed(bundleName: string, bundle: AssetManager.Bundle): void {
        if (!bundle) return;
        if (this._bundleMap.get(bundleName) === bundle) return;
        this.removeBundleFromEngine(bundle);
    }

    public static releaseBundle(bundleName: string): void {
        const bundle = this._bundleMap.get(bundleName);
        if (!bundle) {
            const loading = this._loadingMap.get(bundleName);
            if (loading) {
                // ✅ 取消标记：如果还在下载中，标记其丢弃，防止迟到污染
                loading.discardWhenLoaded = true;
                Logger.info(LogModule.FRAMEWORK, `Bundle 正在加载，完成后将丢弃结果: ${bundleName}`);
            }
            return;
        }

        // 广播包卸载事件，解耦 ResManager 强依赖
        EventCenter.emit(BundleEvent.RELEASED as any, bundleName);
        this.removeBundleFromEngine(bundle);
        this._bundleMap.delete(bundleName);
        Logger.info(LogModule.FRAMEWORK, `Bundle已被安全移除: ${bundleName}`);
    }

    private static removeBundleFromEngine(bundle: AssetManager.Bundle): void {
        try {
            if (bundle) {
                const current = assetManager.getBundle(bundle.name);
                if (current && current !== bundle) return;
                assetManager.removeBundle(bundle);
            }
        } catch (err) {}
    }

    private static _delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}