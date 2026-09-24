// assets/Framework/Components/FrameAnimator.ts
import { _decorator, Component, Sprite, SpriteFrame, isValid,CCInteger } from 'cc';
import { TimerManager } from '../Core/TimerTool/TimerManager';
const { ccclass, property, requireComponent } = _decorator;

/**
 * 核心框架组件：通用序列帧播放器
 * 【架构铁律】：绝对纯净，不包含任何游戏业务逻辑、战术暂停概念。全权交由 TimerManager 调度。
 */
@ccclass('FrameAnimator')
@requireComponent(Sprite)
export class FrameAnimator extends Component {

    // 🌟 纯净解耦：只认数字 ID，不依赖任何业务层 Enum！默认走 0 频道。
    @property({ type: CCInteger, tooltip: "定时器调度频道ID (由应用层决定具体意义)" })
    public timerGroupId: number = 0;

    private _sprite: Sprite = null;
    private _frames: SpriteFrame[] = [];
    private _interval: number = 0.1;
    private _loop: boolean = true;

    private _accumulatedTime: number = 0;
    private _currentIndex: number = 0;
    private _isPlaying: boolean = false;
    private _timerId: number = -1;

    public get isPlaying(): boolean {
        return this._isPlaying;
    }

    protected onLoad() {
        this._sprite = this.getComponent(Sprite);
    }

    /**
     * @param frames 帧数组
     * @param interval 每帧间隔时间
     * @param loop 是否循环
     * @param overrideGroupId 允许业务代码动态覆写调度频道（控制反转）
     */
    public play(frames: SpriteFrame[], interval: number = 0.1, loop: boolean = true, overrideGroupId?: number) {
        if (!frames || frames.length === 0) return;

        if (!this._sprite) this._sprite = this.getComponent(Sprite);

        this.stop();

        this._frames = frames;
        this._interval = interval;
        this._loop = loop;
        this._currentIndex = 0;
        this._accumulatedTime = 0;
        this._isPlaying = true;

        // 🌟 优先级：动态传参 > 编辑器配置
        let targetGroupId = overrideGroupId !== undefined ? overrideGroupId : this.timerGroupId;

        if (this._sprite) this._sprite.spriteFrame = this._frames[0];

        // 🌟 将控制权完全移交给底层的 TimerManager
        this._timerId = TimerManager.Instance.addTweenTask((dt: number) => {
            if (!isValid(this.node) || !this._isPlaying) {
                this.stop();
                return;
            }

            this._accumulatedTime += dt;
            if (this._accumulatedTime >= this._interval) {
                this._accumulatedTime -= this._interval;
                this._currentIndex++;

                if (this._currentIndex >= this._frames.length) {
                    if (this._loop) {
                        this._currentIndex = 0;
                    } else {
                        this.stop();
                        return;
                    }
                }
                if (this._sprite) this._sprite.spriteFrame = this._frames[this._currentIndex];
            }
        }, this.node, targetGroupId);
    }

    public stop() {
        this._isPlaying = false;
        this._accumulatedTime = 0;
        if (this._sprite) this._sprite.spriteFrame = null;

        if (this._timerId !== -1) {
            TimerManager.Instance.remove(this._timerId);
            this._timerId = -1;
        }
    }

    protected onDestroy() {
        this.stop();
    }
}