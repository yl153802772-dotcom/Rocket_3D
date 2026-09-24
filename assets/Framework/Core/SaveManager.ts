/**
 * @module SaveManager
 * @description
 * [模块逻辑]
 * 本地存储管家。利用 DJB2 变体产生校验 Hash 防篡改，应用节流机制保护系统 I/O。
 * 【架构警告】：因微信小游戏禁用了标准 Web Worker 操作，目前 _asyncStringify 利用宏任务队列避免同帧过载。但这并未改变 JSON.stringify() 同步阻塞的核心事实，一旦内存大对象过载，仍会导致掉帧。
 *
 * [调用规则]
 * 1. 业务层禁止直接调用此模块，所有存档动作应全部托管给 DataCenter 的 set 触发。
 * 2. 退入后台等高危时刻，由 App 显式调用 `saveToDisk` 强制刷盘。
 */

import { sys } from 'cc';
import { Logger, LogModule } from './Logger';

export class SaveManager {
    private static _instance: SaveManager = null;
    private _savePromise: Promise<void> | null = null;
    public static get Instance(): SaveManager {
        if (!this._instance) this._instance = new SaveManager();
        return this._instance;
    }

    private _dataMap: Map<string, any> = new Map();
    private _isDirty: boolean = false;
    private _saveTimer: any = null;

    private readonly SECRET_KEY: string = "Cocos_Hero_2026_!@#_$";
    private readonly STORAGE_KEY: string = "Game_Save_Data";

    public init(): void {
        this.loadFromDisk();
        Logger.info(LogModule.FRAMEWORK, "SaveManager 初始化完成 (加密保护已开启)");
    }

    public set(key: string, value: any): void {
        this._dataMap.set(key, value);
        this._isDirty = true;
        this.scheduleSave();
    }

    public get<T>(key: string, defaultValue: T): T {
        if (this._dataMap.has(key)) return this._dataMap.get(key) as T;
        return defaultValue;
    }

    public remove(key: string): void {
        if (this._dataMap.has(key)) {
            this._dataMap.delete(key);
            this._isDirty = true;
            this.scheduleSave();
        }
    }

    private scheduleSave(): void {
        if (this._saveTimer) return;
        this._saveTimer = setTimeout(() => {
            this.saveToDisk();
            this._saveTimer = null;
        }, 1000);
    }

    public saveToDisk(): void {
        if (!this._isDirty) return;
        if (this._savePromise) return;

        this._savePromise = this._asyncSaveToDisk()
            .then(() => { this._savePromise = null; })
            .catch((err) => {
                this._savePromise = null;
                Logger.error(LogModule.FRAMEWORK, "存档保存失败", err);
            });
    }

    private async _asyncSaveToDisk(): Promise<void> {
        try {
            const obj: any = {};
            this._dataMap.forEach((value, key) => { obj[key] = value; });

            // ✅ 架构妥协说明：这里通过 setTimeout 放入下一个宏任务执行，避免在当前渲染帧造成直接卡顿
            // 缺点是 JSON.stringify 本身依然是同步不可拆分的，如日后有巨大存档需自实现 Time-Slicing AST 解析器。
            const jsonStr = await this._asyncStringify(obj);
            const encryptedData = this.encrypt(jsonStr);
            const sign = this.generateHash(encryptedData);

            const finalSaveData = JSON.stringify({ data: encryptedData, sign: sign });
            sys.localStorage.setItem(this.STORAGE_KEY, finalSaveData);
            this._isDirty = false;
        } catch (e) {
            Logger.error(LogModule.FRAMEWORK, "存档保存失败", e);
        }
    }

    private _asyncStringify(obj: any): Promise<string> {
        return new Promise((resolve) => {
            setTimeout(() => {
                try { resolve(JSON.stringify(obj)); }
                catch (e) { resolve(JSON.stringify(obj)); }
            }, 0);
        });
    }

    private loadFromDisk(): void {
        try {
            const rawData = sys.localStorage.getItem(this.STORAGE_KEY);
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

            for (const key in obj) {
                this._dataMap.set(key, obj[key]);
            }
        } catch (e) {
            Logger.error(LogModule.FRAMEWORK, "存档读取或解密失败，可能是废弃格式", e);
            this._dataMap.clear();
        }
    }

    private handleCheater(): void {
        this._dataMap.clear();
        sys.localStorage.removeItem(this.STORAGE_KEY);
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