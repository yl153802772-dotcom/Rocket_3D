/**
 * HttpManager.ts - 完整修复版
 * 作用：统一网络请求（工业级弱网容错、防并发、解耦架构版）
 */
import { Logger } from "../Logger";
import { EventCenter } from "../../Data/EventCenter";
import { EventName } from "../GameConst";

declare const wx: any;

export class HttpManager {
    private static _instance: HttpManager;
    public static get Instance(): HttpManager {
        if (!this._instance) this._instance = new HttpManager();
        return this._instance;
    }

    private baseUrl: string = "https://api.yourgame.com/v1";
    private token: string = "";

    // 🌟 GET 请求防重锁
    private _getMap: Map<string, Promise<any>> = new Map();

    // 弱网重试配置
    private static readonly MAX_RETRY = 3;
    private static readonly RETRY_DELAY = 1000;

    public setToken(token: string) {
        const oldToken = this.token;
        this.token = token;

        // ✅ 核心修复：Token 变化时，清空所有正在飞行的 GET 请求缓存
        // 因为旧 Token 的请求返回的数据可能属于旧用户
        if (oldToken !== token && this._getMap.size > 0) {
            Logger.warn(`[HttpManager] Token 已变更，清空 ${this._getMap.size} 个缓存中的 GET 请求`);
            this._getMap.clear();
        }
    }

    /**
     * ✅ 清空指定 endpoint 的缓存（供业务层主动刷新用）
     */
    public clearGetCache(endpoint?: string): void {
        if (endpoint) {
            // 清空匹配该 endpoint 的所有缓存（忽略 Token 前缀）
            const keysToDelete: string[] = [];
            this._getMap.forEach((_, key) => {
                // Key 格式: "tokenPrefix:url"
                const urlPart = key.substring(key.indexOf(':') + 1);
                if (urlPart.startsWith(endpoint)) {
                    keysToDelete.push(key);
                }
            });
            keysToDelete.forEach(k => this._getMap.delete(k));
            Logger.info(`[HttpManager] 清空 ${keysToDelete.length} 个 ${endpoint} 相关缓存`);
        } else {
            this._getMap.clear();
            Logger.info(`[HttpManager] 清空全部 GET 缓存`);
        }
    }

    /**
     * ✅ 生成带用户维度的缓存 Key
     * 格式: "tokenPrefix:url"
     * 确保不同用户的相同 URL 请求不会互相污染
     */
    private getCacheKey(endpoint: string, params?: any): string {
        let url = endpoint;
        if (params) {
            const query = Object.keys(params)
                .sort() // ✅ 排序确保参数顺序不影响 Key
                .map(k => `${k}=${encodeURIComponent(params[k])}`)
                .join('&');
            url = `${endpoint}?${query}`;
        }
        // 取 Token 的前 8 位作为用户维度标识
        // 如果没有 Token，用 "anonymous" 标识
        const tokenPrefix = this.token
            ? this.token.substring(0, 8)
            : 'anonymous';
        return `${tokenPrefix}:${url}`;
    }

    /**
     * 发送 POST 请求
     */
    public async post<T>(endpoint: string, data: any): Promise<T> {
        return this.request<T>("POST", endpoint, data);
    }

    /**
     * 🌟 发送 GET 请求（带防并发锁 + 自动重试）
     */
    public async get<T>(endpoint: string, params?: any): Promise<T> {
        // ✅ 使用带 Token 维度的缓存 Key
        const cacheKey = this.getCacheKey(endpoint, params);

        // 1️⃣ 防并发拦截
        if (this._getMap.has(cacheKey)) {
            Logger.info(`[HttpManager] 复用进行中的请求: ${cacheKey}`);
            return this._getMap.get(cacheKey) as Promise<T>;
        }

        // 2️⃣ 带重试机制的请求
        const promise = this._requestWithRetry<T>("GET", endpoint, params);
        this._getMap.set(cacheKey, promise);

        try {
            const result = await promise;
            return result;
        } finally {
            this._getMap.delete(cacheKey);
        }
    }

    /**
     * 🌟 弱网环境的重试包裹器
     */
    private async _requestWithRetry<T>(method: string, endpoint: string, data?: any): Promise<T> {
        let attempt = 0;

        while (attempt < HttpManager.MAX_RETRY) {
            try {
                return await this.request<T>(method, endpoint, data);
            } catch (err: any) {
                // 401/403 不重试
                if (err && err.statusCode && (err.statusCode === 401 || err.statusCode === 403)) {
                    throw err;
                }

                attempt++;
                Logger.warn(`网络请求失败 [${endpoint}]，准备重试 ${attempt}/${HttpManager.MAX_RETRY}`);

                if (attempt >= HttpManager.MAX_RETRY) {
                    Logger.error(`网络请求彻底失败: ${endpoint}`);
                    EventCenter.emit(EventName.NETWORK_ERROR as any, { endpoint, err });
                    throw err;
                }

                // 指数退避
                await this._delay(HttpManager.RETRY_DELAY * attempt);
            }
        }
        throw new Error("网络请求异常");
    }

    /**
     * 核心底层请求
     */
    private request<T>(method: string, endpoint: string, data?: any): Promise<T> {
        const url = endpoint.startsWith("http") ? endpoint : `${this.baseUrl}${endpoint}`;

        return new Promise((resolve, reject) => {
            if (typeof wx !== "undefined" && wx.request) {
                wx.request({
                    url: url,
                    method: method as any,
                    data: data,
                    header: {
                        'content-type': 'application/json',
                        'Authorization': this.token ? `Bearer ${this.token}` : ''
                    },
                    timeout: 8000,
                    success: (res: any) => {
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            resolve(res.data as T);
                        } else {
                            this.handleError(res.statusCode, res.data);
                            reject(res);
                        }
                    },
                    fail: (err: any) => reject(err)
                });
            } else {
                // Web 环境
                fetch(url, {
                    method: method,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': this.token ? `Bearer ${this.token}` : ''
                    },
                    body: data ? JSON.stringify(data) : undefined
                })
                    .then(async res => {
                        if (res.ok) {
                            resolve(await res.json() as T);
                        } else {
                            const errData = await res.json().catch(() => ({}));
                            this.handleError(res.status, errData);
                            reject({ statusCode: res.status, data: errData });
                        }
                    })
                    .catch(err => reject(err));
            }
        });
    }

    private handleError(code: number, data: any) {
        Logger.warn(`HTTP 业务错误 [${code}]:`, data);
        if (code === 401) {
            Logger.error("Token 失效，派发重新登录事件！");
            EventCenter.emit(EventName.TOKEN_EXPIRED as any);
            // ✅ Token 失效时也清空缓存
            this._getMap.clear();
        }
    }

    private _delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}