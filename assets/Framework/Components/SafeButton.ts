import { _decorator, Button, EventTouch } from 'cc';
import {AudioSystem} from "db://assets/Framework/Core/AudioSystem";
import {SFX_UI_PATH} from "db://assets/Framework/Core/AudioConst";
// import { AudioManager } from '../Core/AudioManager'; // 预留：我们下一步要做的音效管线

const { ccclass, property } = _decorator;

@ccclass('SafeButton')
export class SafeButton extends Button {

    @property({ tooltip: '防连点冷却时间（秒）' })
    public cooldownTime: number = 0.5;

    @property({ tooltip: '是否播放通用点击音效' })
    public playSound: boolean = true;

    // 记录上一次真实点击的绝对时间戳
    private _lastClickTime: number = 0;

    /**
     * 🌟 核心拦截：重写引擎底层的触摸结束事件
     */
    protected _onTouchEnded(event: EventTouch) {
        // 如果按钮不可交互，直接走原生逻辑（不响应）
        if (!this.interactable || !this.enabledInHierarchy) {
            super._onTouchEnded(event);
            return;
        }

        const now = Date.now();

        // 🛡️ 时间戳校验法：无惧节点隐藏/销毁，绝对不会永久锁死
        if (now - this._lastClickTime < this.cooldownTime * 1000) {
            // 处于冷却中，直接吞掉事件，阻止事件冒泡和后续逻辑
            event.propagationStopped = true;
            return;
        }

        // 记录本次成功点击的时间
        this._lastClickTime = now;

        // 🌟 核心接入：调用 playUISound，走无视战术暂停的 UI 音效通道
        if (this.playSound) {
            AudioSystem.Instance.playUISound(SFX_UI_PATH.BTN_CLICK);
        }

        // 放行：执行原生 Button 的逻辑（这会触发你代码里绑定的 CLICK 事件以及按钮缩放动画）
        super._onTouchEnded(event);
    }

    /**
     * 兜底防线：当节点被放入对象池复用，或重新 active 时，重置状态
     */
    public onEnable() {
        super.onEnable();
        this._lastClickTime = 0;
    }
}