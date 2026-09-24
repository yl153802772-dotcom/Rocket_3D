/**
 * SecretTrigger.ts
 * 作用：防误触的隐藏连点触发器（挂载在任何 Node 上即可）
 */
import { _decorator, Component, Node } from 'cc';
import { UIManager } from '../../../Framework/Core/UIManager';
import { UILayer } from '../../../Framework/Core/UIManager'; // 根据你的实际路径引入
const { ccclass, property } = _decorator;

@ccclass('SecretTrigger')
export class SecretTrigger extends Component {

    @property({ tooltip: "需要连续点击的次数" })
    public targetClicks: number = 5;

    @property({ tooltip: "必须在几秒内点完" })
    public timeLimit: number = 2.0;

    private _clickCount: number = 0;
    private _lastClickTime: number = 0;

    onLoad() {
        this.node.on(Node.EventType.TOUCH_END, this.onClick, this);
    }

    private onClick() {
        const now = Date.now() / 1000; // 转换为秒

        // 如果距离上次点击超过了时间限制，重新计数
        if (now - this._lastClickTime > this.timeLimit) {
            this._clickCount = 0;
        }

        this._clickCount++;
        this._lastClickTime = now;

        // 达到目标次数，触发 GM 界面
        if (this._clickCount >= this.targetClicks) {
            this._clickCount = 0; // 重置
            this.openGMConsole();
        }
    }

    private openGMConsole() {
        // 利用你强大的 UIManager 弹出 GM 界面
        UIManager.Instance.openUI("GMConsoleUI", "prefab/GMConsoleUI", UILayer.Top, null, "ui");
    }
}