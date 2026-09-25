/**
 * @module AnimationHelper
 * @description
 * [模块逻辑]
 * 核心层的 2D 图集动画辅助类。负责为指定的 Sprite 节点异步拉取图集并按帧率循环播放。
 * 注入了 _requestTokenMap，能在节点被意外销毁或对象池回收后，精准拦截并销毁迟到的异步图集，防止幽灵覆盖。
 *
 * [调用规则]
 * 1. 禁用硬编码的战斗数据状态（如 DataCenter 获取 PAUSE），其播放频率直接受本类的静态变量 `globalTimeScale` 与 `globalPaused` 控制。
 * 2. 在业务层执行对象回收（Pool Recycle）时，必须立刻调用 `stopAnimation(node)` 使旧 Token 失效。
 */

import { SpriteFrame, Node, Sprite, director, macro, SpriteAtlas } from 'cc';
import { ResManager, ResType } from './ResManager';
import { Logger, LogModule } from "db://assets/Framework/Core/Logger";

export class AnimationHelper {
    private static _runningMap: Map<Node, Function> = new Map();
    private static _leasedAtlasMap: Map<Node, { path: string; bundle?: string }> = new Map();

    // ✅ 防泄漏核心：Request Token 序列与映射
    private static _requestTokenMap: Map<Node, number> = new Map();
    private static _requestSequence: number = 0;

    // ✅ 架构净化：暴露时间标尺接口供外部 Game 层注入控制，断开对具体业务层 DataKey 的依赖
    public static globalTimeScale: number = 1.0;
    public static globalPaused: boolean = false;

    public static async playAnimationFromAtlas(
        node: Node,
        atlasPath: string,
        framePrefix: string,
        frameCount: number,
        interval: number = 0.1,
        loop: boolean = true,
        resType: ResType = ResType.NORMAL,
        bundleName?: string,
        timeoutMs: number = 10000
    ): Promise<boolean> {

        if (!node || !node.isValid) return false;

        try {
            this.stopAnimation(node);

            // 发放本次请求 Token
            const requestToken = ++this._requestSequence;
            this._requestTokenMap.set(node, requestToken);

            const atlas = await this._loadAtlasWithTimeout(atlasPath, bundleName, resType, timeoutMs);

            // ✅ 防漏门卫：如果等待期间 Token 变化（被回收/再利用/销毁），立刻抛弃资源并终止！
            if (!this._isCurrentRequest(node, requestToken)) {
                if (atlas) ResManager.Instance.release(atlasPath, bundleName);
                return false;
            }
            if (!atlas) {
                Logger.warn(LogModule.ANIMATION, `图集加载失败或超时: ${atlasPath}`);
                this._finishRequest(node, requestToken);
                return false;
            }

            const frameNames: string[] = [];
            for (let i = 1; i <= frameCount; i++) {
                frameNames.push(`${framePrefix}${i.toString().padStart(2, '0')}`);
            }

            const sprite = node.getComponent(Sprite);
            if (!sprite) {
                ResManager.Instance.release(atlasPath, bundleName);
                this._finishRequest(node, requestToken);
                return false;
            }

            this._leasedAtlasMap.set(node, { path: atlasPath, bundle: bundleName });

            let currentFrame = 0;
            let timer = 0;
            const scheduler = director.getScheduler();

            const updateFunc = (dt: number) => {
                // 对象池回收兼容检查
                if (!node || !node.isValid || !node.active) {
                    this.stopAnimation(node);
                    return;
                }

                // 核心时停拦截（纯架构变量，非业务变量）
                if (AnimationHelper.globalPaused) return;

                // 应用时间倍速
                timer += (dt * AnimationHelper.globalTimeScale);

                if (timer >= interval) {
                    timer = 0;
                    const frameName = frameNames[currentFrame];
                    const frame = ResManager.Instance.getHybridSpriteFrame(atlasPath, frameName, bundleName);
                    if (frame) sprite.spriteFrame = frame;

                    currentFrame++;
                    if (currentFrame >= frameCount) {
                        if (loop) currentFrame = 0;
                        else {
                            this.stopAnimation(node);
                            return;
                        }
                    }
                }
            };

            scheduler.schedule(updateFunc, node, 0, macro.REPEAT_FOREVER, 0, false);
            this._runningMap.set(node, updateFunc);

            return true;
        } catch (err) {
            this._requestTokenMap.delete(node);
            Logger.error(LogModule.ANIMATION, `动画初始化失败: ${atlasPath}`, err);
            return false;
        }
    }

    private static async _loadAtlasWithTimeout(
        atlasPath: string, bundleName: string | undefined, resType: ResType, timeoutMs: number
    ): Promise<SpriteAtlas | null> {
        return new Promise((resolve) => {
            let isResolved = false;
            const timer = setTimeout(() => {
                if (!isResolved) {
                    isResolved = true;
                    Logger.warn(LogModule.ANIMATION, `图集加载超时: ${atlasPath}`);
                    resolve(null);
                }
            }, timeoutMs);

            // ✅ 同步更新：使用标准泛型 load 接口替代已废弃的 loadAtlas
            ResManager.Instance.load<SpriteAtlas>(atlasPath, SpriteAtlas, bundleName, resType)
                .then(atlas => {
                    if (!isResolved) {
                        isResolved = true;
                        clearTimeout(timer);
                        resolve(atlas);
                    } else {
                        ResManager.Instance.release(atlasPath, bundleName);
                    }
                })
                .catch(err => {
                    if (!isResolved) {
                        isResolved = true;
                        clearTimeout(timer);
                        resolve(null);
                    }
                });
        });
    }

    public static stopAnimation(node: Node): void {
        if (!node) return;
        // 切断旧 Token 绑定
        this._requestTokenMap.set(node, ++this._requestSequence);
        const func = this._runningMap.get(node);
        if (func) {
            director.getScheduler().unschedule(func as any, node);
            this._runningMap.delete(node);
        }
        const lease = this._leasedAtlasMap.get(node);
        if (lease) {
            ResManager.Instance.release(lease.path, lease.bundle);
            this._leasedAtlasMap.delete(node);
        }
    }

    public static clearAll(): void {
        this._requestSequence++;
        this._requestTokenMap.clear();

        const scheduler = director.getScheduler();
        this._runningMap.forEach((func, node) => scheduler.unschedule(func as any, node));
        this._runningMap.clear();

        this._leasedAtlasMap.forEach(lease => ResManager.Instance.release(lease.path, lease.bundle));
        this._leasedAtlasMap.clear();
    }

    private static _isCurrentRequest(node: Node, token: number): boolean {
        return !!node && node.isValid && this._requestTokenMap.get(node) === token;
    }

    private static _finishRequest(node: Node, token: number): void {
        if (this._requestTokenMap.get(node) === token) this._requestTokenMap.delete(node);
    }
}