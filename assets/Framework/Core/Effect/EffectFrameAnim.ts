// Framework/Core/Effect/EffectFrameAnim.ts
import { _decorator, Component, Sprite, SpriteAtlas, CCString, CCFloat, CCInteger } from 'cc';
import {DataCenter} from "db://assets/Framework/Data/DataCenter";
import {DataKey} from "db://assets/Framework/Core/GameConst";

const { ccclass, property } = _decorator;

/**
 * 🎨 特效专属帧动画驱动器 (完美复刻 MonsterAnimDriver 的纯逻辑算法)
 * 职责：挂载于特效预制体，自驱动播放 4 帧极简动画。
 */
@ccclass('EffectFrameAnim')
export class EffectFrameAnim extends Component {
    @property(Sprite)
    sprite: Sprite = null;

    @property(SpriteAtlas)
    atlas: SpriteAtlas = null;

    @property(CCString)
    prefix: string = "fx_fire_aoe";

    @property(CCInteger)
    frameCount: number = 4;

    @property(CCFloat)
    fps: number = 20;

    private _currentFrame: number = 0;
    private _timer: number = 0;
    private _interval: number = 0;

    onEnable() {
        // 预制体从对象池捞出时，重置状态
        this._interval = this.fps > 0 ? 1.0 / this.fps : 0.1;
        this._currentFrame = 0;
        this._timer = 0;
        this._applyCurrentFrame();
    }

    update(dt: number) {
        if (!this.atlas || !this.sprite || this.frameCount <= 0) return;

        //this._timer += dt;
        // 🌟 修复 1：拦截战术暂停
        if (DataCenter.Instance.get(DataKey.IS_PAUSED)) return;

        // 🌟 修复 2：享受全局战斗倍速
        let timeScale = Number(DataCenter.Instance.get(DataKey.TIME_SCALE as any)) || 1.0;
        let battleDt = dt * timeScale;

        this._timer += battleDt; // 使用受控时间

        if (this._timer >= this._interval) {
            this._timer -= this._interval;

            // 游标推进
            this._currentFrame++;

            // 🌟 特效逻辑区别于怪物：爆炸不需要循环！
            // 播到最后一帧就停住，等待 EffectPlayer 的 duration 到期自动回收
            if (this._currentFrame >= this.frameCount) {
                this._currentFrame = this.frameCount - 1;
            } else {
                this._applyCurrentFrame();
            }
        }
    }

    private _applyCurrentFrame() {
        // 完全对齐您的规范："fx_fire_aoe_0"
        const frameName = `${this.prefix}_${this._currentFrame}`;
        const frame = this.atlas.getSpriteFrame(frameName);
        if (frame) {
            this.sprite.spriteFrame = frame;
        }
    }
}