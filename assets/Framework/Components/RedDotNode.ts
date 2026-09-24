/**
 * RedDotNode.ts
 * 作用：红点表现层组件。挂载到红点 UI 节点上，实现数据驱动自动显示/隐藏。
 */
import { _decorator, Component, Label, Node } from 'cc';
import { EventCenter } from '../../Framework/Data/EventCenter'; // 根据实际路径调整
import { EventName } from '../../Framework/Core/GameConst';     // 根据实际路径调整
import { RedDotManager } from '../../Framework/Core/RedDotManager'; // 根据实际路径调整

const { ccclass, property } = _decorator;

@ccclass('RedDotNode')
export class RedDotNode extends Component {

    @property({ tooltip: "红点绑定的树节点路径，例如: main/shop/weapon" })
    public dotPath: string = "";

    @property({ type: Label, tooltip: "可选: 如果红点带有数字(如邮件数量)，拖入文本节点" })
    public countLabel: Label = null;

    // 使用箭头函数锁定 this 引用，防止解绑失败导致内存泄漏
    private _onDotUpdate = (value: number) => {
        this.refreshUI(value);
    };

    // 🔴 新增：记录实际注册的事件名，确保能正确解绑
    private _registeredEventName: string = "";

    // 🔴 新增：标记是否已经被销毁
    private _isDestroyed: boolean = false;

    onEnable() {
        this._isDestroyed = false;

        if (!this.dotPath || this.dotPath === "") {
            console.warn(`[RedDotNode] 节点 ${this.node.name} 未配置 dotPath！`);
            return;
        }

        // 1. 拉取最新状态
        const currentValue = RedDotManager.Instance.getValue(this.dotPath);
        this.refreshUI(currentValue);

        // 2. 注册动态事件
        this._registeredEventName = `${EventName.RED_DOT_UPDATE}_${this.dotPath}`;
        (EventCenter.on as any)(this._registeredEventName, this._onDotUpdate);
    }

    onDisable() {
        this._cleanupListener();
    }

    // 🔴 新增：组件销毁时的兜底清理
    onDestroy() {
        this._isDestroyed = true;
        this._cleanupListener();
    }

    private _cleanupListener(): void {
        if (!this._registeredEventName) return;

        (EventCenter.off as any)(this._registeredEventName, this._onDotUpdate);
        this._registeredEventName = "";
    }

    /**
     * 核心表现刷新逻辑
     * @param value 红点值（通常 0 代表隐藏，>0 代表显示数量）
     */
    private refreshUI(value: number) {
        // 1. 控制红点本体节点的显隐
        if (this._isDestroyed || !this.node || !this.node.isValid) return;

        this.node.active = value > 0;

        // 2. 如果配置了数字文本，更新数字展示
        if (this.countLabel && value > 0) {
            // 超过 99 显示 99+，工业级小细节
            this.countLabel.string = value > 99 ? "99+" : value.toString();
        }
    }
}