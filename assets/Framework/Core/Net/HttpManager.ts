/**
 * @module HttpManager
 * @description
 * [模块逻辑]
 * 工业级弱网容错网络管线。支持请求去重、失败重试与指数退避。
 * 移除了内置的 fetch 与 wx.request 差异处理，由 PlatformManager 统一代理。支持环境基地址动态注入。
 */

import { Logger, LogModule } from "../Logger";
import { EventCenter } from "../../Data/EventCenter";
import { EventName } from "../GameConst";
import { PlatformManager } from "../Platform/PlatformManager";

export class HttpManager {
    private static _instance: HttpManager;
    public static get Instance(): HttpManager {
        if (!this._instance) this._instance = new HttpManager();
        return this._instance;
    }

    private _baseUrl: string = "";
    private _token: string = "";
    private _getMap: Map<string, Promise<any>> = new Map();

    private static readonly MAX_RETRY = 3;
    private static readonly RETRY_DELAY = 1000;

    // ✅ 环境变量注入点
    public init(envBaseUrl: string): void {
        this._baseUrl = envBaseUrl;
        Logger.info(LogModule.FRAMEWORK, `[HttpManager] 初始化完成，BaseUrl: ${this._baseUrl}`);
    }

    public setToken(token: string) {
        const oldToken = this._token;
        this._token = token;

        if (oldToken !== token && this._getMap.size > 0) {
            Logger.warn(LogModule.FRAMEWORK, `[HttpManager] Token 已变更，清空 ${this._getMap.size} 个缓存请求`);
            this._getMap.clear();
        }
    }

    public clearGetCache(endpoint?: string): void {
        if (endpoint) {
            const keysToDelete: string[] = [];
            this._getMap.forEach((_, key) => {
                const urlPart = key.substring(key.indexOf(':') + 1);
                if (urlPart.startsWith(endpoint)) keysToDelete.push(key);
            });
            keysToDelete.forEach(k => this._getMap.delete(k));
        } else {
            this._getMap.clear();
        }
    }

    private getCacheKey(endpoint: string, params?: any): string {
        let url = endpoint;
        if (params) {
            const query = Object.keys(params).sort()
                .map(k => `${k}=${encodeURIComponent(params[k])}`).join('&');
            url = `${endpoint}?${query}`;
        }
        const tokenPrefix = this._token ? this._token.substring(0, 8) : 'anonymous';
        return `${tokenPrefix}:${url}`;
    }

    public async post<T>(endpoint: string, data: any): Promise<T> {
        return this._requestWithRetry<T>("POST", endpoint, data);
    }

    public async get<T>(endpoint: string, params?: any): Promise<T> {
        const cacheKey = this.getCacheKey(endpoint, params);

        if (this._getMap.has(cacheKey)) {
            return this._getMap.get(cacheKey) as Promise<T>;
        }

        const promise = this._requestWithRetry<T>("GET", endpoint, params);
        this._getMap.set(cacheKey, promise);

        try {
            return await promise;
        } finally {
            this._getMap.delete(cacheKey);
        }
    }

    private async _requestWithRetry<T>(method: string, endpoint: string, data?: any): Promise<T> {
        let attempt = 0;
        const url = endpoint.startsWith("http") ? endpoint : `${this._baseUrl}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': this._token ? `Bearer ${this._token}` : ''
        };

        while (attempt < HttpManager.MAX_RETRY) {
            try {
                // ✅ 网络请求委托至平台层
                return await PlatformManager.Instance.adapter.request<T>(method, url, data, headers, 8000);
            } catch (err: any) {
                if (err && err.statusCode && (err.statusCode === 401 || err.statusCode === 403)) {
                    this.handleError(err.statusCode, err.data);
                    throw err;
                }

                attempt++;
                Logger.warn(LogModule.FRAMEWORK, `网络请求失败 [${endpoint}]，重试 ${attempt}/${HttpManager.MAX_RETRY}`);

                if (attempt >= HttpManager.MAX_RETRY) {
                    EventCenter.emit(EventName.NETWORK_ERROR as any, { endpoint, err });
                    throw err;
                }
                await this._delay(HttpManager.RETRY_DELAY * attempt);
            }
        }
        throw new Error("网络请求异常");
    }

    private handleError(code: number, data: any) {
        Logger.warn(LogModule.FRAMEWORK, `HTTP 业务错误 [${code}]:`, data);
        if (code === 401) {
            Logger.error(LogModule.FRAMEWORK, "Token 失效，派发重新登录事件！");
            EventCenter.emit(EventName.TOKEN_EXPIRED as any);
            this._getMap.clear();
        }
    }

    private _delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}