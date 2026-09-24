/**
 * @module SaveManager
 * @description
 * [模块逻辑]
 * 工业级本地存储管家。本次重构实现了【增量状态快照 (Fragment Cache)】与【原生异步 I/O】。
 * 彻底解决了全量 JSON.stringify 导致的主线程 CPU 峰值掉帧问题；并在运行态剥离了同步写盘的 I/O 阻塞。
 *
 * [调用规则]
 * 1. 业务层禁止直接调用此模块，所有存档动作应全部托管给 DataCenter 的 set 触发。
 * 2. 正常运行期间的 scheduleSave 走异步非阻塞管线；在 App 监听到 wx.onHide 退后台的高危时刻，必须显式调用 `saveToDisk(true)` 强制同步刷盘。
 */

import { sys } from 'cc';
import { Logger, LogModule } from './Logger';

declare const wx: any;

export class SaveManager {
    private static _instance: SaveManager = null;
    public static get Instance(): SaveManager {
        if (!this._instance) this._instance = new SaveManager();
        return this._instance;
    }

    private _dataMap: Map<string, any> = new Map();
    private _saveTimer: any = null;

    // ✅ 核心重构：增量碎片缓存与脏标记机制
    private _fragmentCache: Map<string, string> = new Map();
    private _dirtyKeys: Set<string> = new Set();
    private _isSaving: boolean = false;

    private readonly SECRET_KEY: string = "Cocos_Hero_2026_!@#_$";
    private readonly STORAGE_KEY: string = "Game_Save_Data";

    public init(): void {
        this.loadFromDisk();
        Logger.info(LogModule.FRAMEWORK, "SaveManager 初始化完成 (增量快照与异步 I/O 已就绪)");
    }

    public set(key: string, value: any): void {
        this._dataMap.set(key, value);
        this._dirtyKeys.add(key); // 仅标记发生变化的节点
        this.scheduleSave();
    }

    public get<T>(key: string, defaultValue: T): T {
        if (this._dataMap.has(key)) return this._dataMap.get(key) as T;
        return defaultValue;
    }

    public remove(key: string): void {
        if (this._dataMap.has(key)) {
            this._dataMap.delete(key);
            this._dirtyKeys.add(key); // 删除同样视为脏操作
            this.scheduleSave();
        }
    }

    private scheduleSave(): void {
        if (this._saveTimer) return;
        this._saveTimer = setTimeout(() => {
            this.saveToDisk(false);
            this._saveTimer = null;
        }, 1000);
    }

    /**
     * 核心存盘中枢
     * @param forceSync 是否强制同步写盘（仅在 wx.onHide 退入后台等高危关断时刻设为 true）
     */
    public saveToDisk(forceSync: boolean = false): void {
        if (this._dirtyKeys.size === 0) return;
        if (this._isSaving && !forceSync) return;

        this._isSaving = true;

        try {
            // ✅ 核心优化 1：增量 JSON 构建
            // 不再全量 stringify！未修改的庞大数据分支（如科技树、背包）直接提取字符串碎片拼接，CPU 消耗逼近于 0。
            const fragments: string[] = [];

            this._dataMap.forEach((value, key) => {
                let frag = this._fragmentCache.get(key);
                if (this._dirtyKeys.has(key) || frag === undefined) {
                    frag = JSON.stringify(value);
                    this._fragmentCache.set(key, frag);
                }
                fragments.push(`"${key}":${frag}`);
            });

            // 极速拼接成最终的 JSON 字符串
            const jsonStr = `{${fragments.join(',')}}`;
            this._dirtyKeys.clear();

            // 加密与签名
            const encryptedData = this.encrypt(jsonStr);
            const sign = this.generateHash(encryptedData);
            const finalSaveData = JSON.stringify({ data: encryptedData, sign: sign });

            // ✅ 核心优化 2：I/O 线程分流
            if (!forceSync && typeof wx !== 'undefined' && wx.setStorage) {
                // 运行时：丢给微信底层异步 IO 线程，不阻塞当前 JS 渲染帧
                wx.setStorage({
                    key: this.STORAGE_KEY,
                    data: finalSaveData,
                    success: () => { this._isSaving = false; },
                    fail: (err: any) => {
                        this._isSaving = false;
                        Logger.error(LogModule.FRAMEWORK, "异步存档落盘失败", err);
                    }
                });
            } else {
                // 退后台/无微信环境：强制主线程同步写入，保证进程被杀前数据绝对落库
                if (typeof wx !== 'undefined' && wx.setStorageSync) {
                    wx.setStorageSync(this.STORAGE_KEY, finalSaveData);
                } else {
                    sys.localStorage.setItem(this.STORAGE_KEY, finalSaveData);
                }
                this._isSaving = false;
                if (forceSync) Logger.info(LogModule.FRAMEWORK, "已执行强制同步刷盘防丢失");
            }
        } catch (e) {
            this._isSaving = false;
            Logger.error(LogModule.FRAMEWORK, "存档序列化或加密致命异常", e);
        }
    }

    private loadFromDisk(): void {
        try {
            let rawData: string = "";
            if (typeof wx !== 'undefined' && wx.getStorageSync) {
                rawData = wx.getStorageSync(this.STORAGE_KEY);
            } else {
                rawData = sys.localStorage.getItem(this.STORAGE_KEY);
            }

            if (!rawData) return;

            const parsed = JSON.parse(rawData);
            if (!parsed.data || !parsed.sign) throw new Error("存档结构异常");

            const calculatedSign = this.generateHash(parsed.data);
            if (calculatedSign !== parsed.sign) {
                Logger.error(LogModule.FRAMEWORK, "🚨 警告：检测到存档被恶意篡改！");
                this.handleCheater();
                return;
            }

            const decryptedData = this.decrypt(parsed.data);
            const obj = JSON.parse(decryptedData);

            // ✅ 预热缓存：初始化时直接把所有数据切片缓存，确保第一帧 save 的极速
            for (const key in obj) {
                this._dataMap.set(key, obj[key]);
                this._fragmentCache.set(key, JSON.stringify(obj[key]));
            }
        } catch (e) {
            Logger.error(LogModule.FRAMEWORK, "存档读取或解密失败，可能是废弃格式", e);
            this._dataMap.clear();
            this._fragmentCache.clear();
        }
    }

    private handleCheater(): void {
        this._dataMap.clear();
        this._fragmentCache.clear();
        if (typeof wx !== 'undefined' && wx.removeStorageSync) {
            wx.removeStorageSync(this.STORAGE_KEY);
        } else {
            sys.localStorage.removeItem(this.STORAGE_KEY);
        }
    }

    private encrypt(text: string): string {
        let result = '';
        for (let i = 0; i < text.length; i++) {
            const charCode = text.charCodeAt(i) ^ this.SECRET_KEY.charCodeAt(i % this.SECRET_KEY.length);
            let hexStr = charCode.toString(16);
            while (hexStr.length < 4) hexStr = '0' + hexStr;
            result += hexStr;
        }
        return result;
    }

    private decrypt(hexText: string): string {
        let result = '';
        for (let i = 0; i < hexText.length; i += 4) {
            const hexStr = hexText.substring(i, i + 4);
            const charCode = parseInt(hexStr, 16) ^ this.SECRET_KEY.charCodeAt((i / 4) % this.SECRET_KEY.length);
            result += String.fromCharCode(charCode);
        }
        return result;
    }

    private generateHash(str: string): string {
        let hash = 5381;
        for (let i = 0; i < str.length; i++) hash = ((hash << 5) + hash) + str.charCodeAt(i);
        return (hash >>> 0).toString(16);
    }
}