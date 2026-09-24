// Framework/Core/Effect/EffectPlayer.ts
import { _decorator, Component, Node } from 'cc';
import { GameObjectPool } from '../Pool/GameObjectPool';
import {TimerGroup, TimerManager} from "db://assets/Framework/Core/TimerTool/TimerManager";

const { ccclass, property } = _decorator;

@ccclass('EffectPlayer')
export class EffectPlayer extends Component {

    @property({ tooltip: "特效默认存活时间(秒)" })
    public duration: number = 1.0;

    private _poolKey: string = "";

    /**
     * 外部总控呼叫播放
     * @param poolKey 预制体在对象池的注册名
     * @param customDuration 自定义覆盖时间（可选）
     */
    public play(poolKey: string, customDuration?: number) {
        this._poolKey = poolKey;
        const d = customDuration !== undefined ? customDuration : this.duration;

        // 简单粗暴的定时回收 (未来如果有基于动画帧结尾的，再扩展)
        //this.scheduleOnce(this.recycleSelf, d);
        // 🌟 修复：抛弃原生 scheduleOnce，改用战术时钟，享受暂停与倍速保护！
        TimerManager.Instance.doOnce(d, this.recycleSelf, this, TimerGroup.BATTLE);
    }

    private recycleSelf() {
        // 🔴 修复：先检查是否已经在回收流程中
        if (!this.node || !this.node.isValid) return;
        if (!this._poolKey) return;

        // 防止重复回收
        const key = this._poolKey;
        this._poolKey = "";

        // 必须先取消定时器
        this.unschedule(this.recycleSelf);

        // 再回收到对象池
        GameObjectPool.Instance.recycle(key, this.node);
    }

    onDisable() {
        // 防止节点被意外隐藏时，定时器幽灵执行
        this.unschedule(this.recycleSelf);
    }
}