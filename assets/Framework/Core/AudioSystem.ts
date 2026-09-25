/**
 * @module AudioSystem
 * @description
 * [模块逻辑]
 * 游戏通用音频中枢。本次重构（Priority 9）彻底修复了战术暂停与时间缩放下的“槽位假死”问题。
 * 将音效生命周期回收统一交由 TimerManager 的对应频道 (Group) 管理，并提供了针对 3D/重度游戏切关时的安全熔断机制。
 *
 * [调用规则]
 * 1. UI 音效与战斗音效受到严格分流，DataCenter 的 IS_PAUSED (战术暂停) 绝对不能拦截或挂起 UI 交互音效。
 * 2. 音效槽位的释放现已受全局时钟安全保护，切关时 PreloadManager 会自动触发 stopAllBattleAudio()。
 */

import { AudioClip, AudioSource, Node, clamp01, director } from 'cc';
import { ResManager } from "./ResManager";
import { SaveManager } from "./SaveManager";
import { DataKey } from "./GameConst";
import { Logger, LogModule } from "./Logger";
import {DataCenter, RuntimeDataCenter} from "../Data/DataCenter";
import { AUDIO_BUNDLE, AudioCategory } from './AudioConst';
import { TimerManager, TimerGroup } from './TimerTool/TimerManager'; // ✅ 接入统一时钟总线

export class AudioSystem {
    private static _instance: AudioSystem = null;
    public static get Instance(): AudioSystem {
        if (!this._instance) this._instance = new AudioSystem();
        return this._instance;
    }

    private _bgmSource: AudioSource = null;
    private _sfxPool: AudioSource[] = [];
    private _maxSfxCount: number = 20;

    private _sfxBusyMap: Map<AudioSource, boolean> = new Map();
    private _sfxUIMap: Map<AudioSource, boolean> = new Map();
    private _sfxClipPathMap: Map<AudioSource, string> = new Map();

    private _sfxTokenMap: Map<AudioSource, number> = new Map();
    // ✅ 重构：废除 setTimeout，改为记录 TimerManager 的任务 ID
    private _sfxReleaseTimers: Map<AudioSource, number> = new Map();
    private _sfxToken: number = 0;

    private _soundOn: boolean = true;
    private _uiSoundOn: boolean = true;
    private _bgmOn: boolean = true;
    private _currentBGM: string = "";
    private _lastBGMPath: string = "";
    private _bgmClipPath: string = "";

    private _bgmRequestToken: number = 0;
    private _rootNode: Node = null;

    private _masterVolume: number = 1.0;
    private _bgmVolume: number = 1.0;
    private _sfxVolume: number = 1.0;
    private _categoryVolumes: Map<AudioCategory, number> = new Map();
    private _sfxBaseGainMap: Map<string, number> = new Map();

    public init(): void {
        Logger.info(LogModule.AUDIO, "AudioSystem 初始化 (接入时钟总线与熔断管线)");
        this._rootNode = new Node("AudioSystem");
        director.addPersistRootNode(this._rootNode);

        this._bgmSource = this._rootNode.addComponent(AudioSource);
        this._bgmSource.loop = true;

        for (let i = 0; i < this._maxSfxCount; i++) {
            const sfxSource = this._rootNode.addComponent(AudioSource);
            this._sfxPool.push(sfxSource);
            this._sfxBusyMap.set(sfxSource, false);
            this._sfxUIMap.set(sfxSource, false);
        }

        this._soundOn = SaveManager.Instance.get(DataKey.IS_MUSIC_ON, true);
        this._bgmOn = SaveManager.Instance.get(DataKey.SETTING_BGM, true);

        // ✅ 同步重构：监听纯内存的战术暂停，严格保护 UI 音效不被误杀，并且不引起脏标记落盘
        RuntimeDataCenter.Instance.watch(DataKey.IS_PAUSED, (isPaused: boolean) => {
            this._sfxPool.forEach(sfx => {
                if (this._sfxBusyMap.get(sfx) && sfx.playing && !this._sfxUIMap.get(sfx)) {
                    if (isPaused) sfx.pause();
                    else if (this._soundOn) sfx.play();
                }
            });
        });
    }

    public async playBGM(path: string): Promise<void> {
        if (!this._bgmOn || this._currentBGM === path) return;
        this._currentBGM = path;
        this._lastBGMPath = path;

        const requestToken = ++this._bgmRequestToken;

        try {
            this.releaseBGMClip();
            const clip = await ResManager.Instance.load<AudioClip>(path, AudioClip, AUDIO_BUNDLE);

            if (requestToken !== this._bgmRequestToken || !this._bgmOn || this._currentBGM !== path || !clip || !clip.isValid) {
                if (clip) ResManager.Instance.release(path, AUDIO_BUNDLE);
                return;
            }

            this._bgmClipPath = path;
            this._bgmSource.clip = clip;
            this._bgmSource.play();
        } catch (e) {
            if (requestToken === this._bgmRequestToken && this._currentBGM === path) this._currentBGM = "";
            Logger.error(LogModule.AUDIO, "BGM加载失败", path);
        }
    }

    private releaseBGMClip(): void {
        if (this._bgmSource) {
            this._bgmSource.stop();
            this._bgmSource.clip = null;
        }
        if (this._bgmClipPath) {
            ResManager.Instance.release(this._bgmClipPath, AUDIO_BUNDLE);
            this._bgmClipPath = "";
        }
    }

    private calculateFinalVolume(path: string, category: AudioCategory, dynamicScale: number): number {
        const catVol = this._categoryVolumes.get(category) ?? 1.0;
        const individualGain = this._sfxBaseGainMap.get(path) ?? 1.0;
        return clamp01(this._masterVolume * this._sfxVolume * catVol * individualGain * dynamicScale);
    }

    public stopBGM(): void {
        this._bgmRequestToken++;
        this.releaseBGMClip();
        this._currentBGM = "";
    }

    private releaseSfxSource(source: AudioSource): void {
        if (!source) return;

        // ✅ 核心修复：通过 TimerManager 精准移除定时器，不再受到 JS 原生 EventLoop 干扰
        const timerId = this._sfxReleaseTimers.get(source);
        if (timerId !== undefined) {
            TimerManager.Instance.remove(timerId);
            this._sfxReleaseTimers.delete(source);
        }

        source.stop();
        source.clip = null;

        const path = this._sfxClipPathMap.get(source);
        if (path) ResManager.Instance.release(path, AUDIO_BUNDLE);

        this._sfxClipPathMap.delete(source);
        this._sfxTokenMap.delete(source);
        this._sfxBusyMap.set(source, false);
        this._sfxUIMap.set(source, false);
    }

    public async playSound(path: string, category: AudioCategory = AudioCategory.TOWER, dynamicScale: number = 1.0): Promise<void> {
        return this._doPlaySound(path, false, category, dynamicScale);
    }

    public async playUISound(path: string, category: AudioCategory = AudioCategory.UI, dynamicScale: number = 1.0): Promise<void> {
        return this._doPlaySound(path, true, category, dynamicScale);
    }

    private async _doPlaySound(path: string, isUI: boolean, category: AudioCategory, dynamicScale: number): Promise<void> {
        if (isUI && !this._uiSoundOn) return;
        if (!isUI && !this._soundOn) return;

        const finalVolume = this.calculateFinalVolume(path, category, dynamicScale);
        if (finalVolume <= 0.001) return;

        try {
            const clip = await ResManager.Instance.load<AudioClip>(path, AudioClip, AUDIO_BUNDLE);

            if (!clip || !clip.isValid || (isUI && !this._uiSoundOn) || (!isUI && !this._soundOn)) {
                if (clip) ResManager.Instance.release(path, AUDIO_BUNDLE);
                return;
            }

            let idleSource = this._sfxPool.find(s => !this._sfxBusyMap.get(s));
            if (!idleSource) {
                idleSource = this._sfxPool.find(s => !s.playing);
                if (idleSource) this.releaseSfxSource(idleSource);
            }

            if (!idleSource) {
                Logger.warn(LogModule.AUDIO, `音效池已满(20)，主动丢弃: ${path}`);
                ResManager.Instance.release(path, AUDIO_BUNDLE);
                return;
            }

            this.releaseSfxSource(idleSource);

            const playbackToken = ++this._sfxToken;
            this._sfxBusyMap.set(idleSource, true);
            this._sfxUIMap.set(idleSource, isUI);
            this._sfxClipPathMap.set(idleSource, path);
            this._sfxTokenMap.set(idleSource, playbackToken);
            idleSource.clip = clip;
            idleSource.volume = finalVolume;

            if (isUI || !DataCenter.Instance.get(DataKey.IS_PAUSED)) {
                idleSource.play();
            }

            const estimatedDuration = clip.getDuration() || 1.0;

            // ✅ 核心防漏与时钟对齐：将释放周期交由全局时钟管理
            // 战术暂停和 TimeScale 变化会自动拉长或缩短这个回收定时器，彻底告别旧版 setTimeout 造成的槽位早泄假死
            const groupId = isUI ? TimerGroup.UI : TimerGroup.BATTLE;
            const timerId = TimerManager.Instance.doOnce((estimatedDuration + 0.1), () => {
                if (this._sfxTokenMap.get(idleSource!) !== playbackToken) return;
                this.releaseSfxSource(idleSource!);
            }, this, groupId);

            this._sfxReleaseTimers.set(idleSource, timerId);

        } catch (e) {
            Logger.error(LogModule.AUDIO, "音效加载失败", path);
        }
    }

    public setSound(on: boolean): void {
        this._soundOn = on;
        SaveManager.Instance.set(DataKey.IS_MUSIC_ON, on);
        if (!on) this._sfxPool.forEach(s => this.releaseSfxSource(s));
    }

    public setBGM(on: boolean): void {
        const wasOn = this._bgmOn;
        this._bgmOn = on;
        SaveManager.Instance.set(DataKey.SETTING_BGM, on);
        if (!on) this.stopBGM();
        else if (!wasOn && this._lastBGMPath) this.playBGM(this._lastBGMPath);
    }

    public setUISound(on: boolean): void {
        this._uiSoundOn = on;
        SaveManager.Instance.set(DataKey.IS_UI_SOUND_ON, on);
        if (!on) {
            this._sfxPool.forEach(s => {
                if (this._sfxUIMap.get(s)) this.releaseSfxSource(s);
            });
        }
    }

    // ✅ 新增接口：提供给 PreloadManager 场景切换时的强制资源熔断器
    public stopAllBattleAudio(): void {
        Logger.info(LogModule.AUDIO, "🛑 主动熔断所有战斗音效，归还资源租约");
        this._sfxPool.forEach(sfx => {
            if (this._sfxBusyMap.get(sfx) && !this._sfxUIMap.get(sfx)) {
                this.releaseSfxSource(sfx);
            }
        });
    }

    public stopAllSfx(): void {
        for (const source of this._sfxPool) this.releaseSfxSource(source);
    }
}