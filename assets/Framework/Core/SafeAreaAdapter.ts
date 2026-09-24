/**
 * SafeAreaAdapter.ts
 * 作用：UI 异形屏安全区智能适配（配合 Widget 使用）
 */
import { _decorator, Component, Widget, sys, screen } from 'cc';
const { ccclass, property, requireComponent } = _decorator;

@ccclass('SafeAreaAdapter')
@requireComponent(Widget) // 必须挂载 Widget 组件
export class SafeAreaAdapter extends Component {

    @property({ tooltip: "是否适配顶部刘海" })
    adaptTop: boolean = true;

    @property({ tooltip: "是否适配底部小白条" })
    adaptBottom: boolean = true;

    start() {
        this.applySafeArea();
    }

    private applySafeArea() {
        const widget = this.getComponent(Widget);
        if (!widget) return;

        // 获取当前屏幕的安全区矩形 (平台原生数据)
        const safeArea = sys.getSafeAreaRect();
        const screenSize = screen.windowSize;

        // 计算顶部被刘海/状态栏遮挡的高度比例，转换为设计分辨率下的真实像素
        if (this.adaptTop) {
            const topNotchHeight = screenSize.height - (safeArea.y + safeArea.height);
            if (topNotchHeight > 0 && widget.isAlignTop) {
                // 原有的 top 边距加上刘海的高度
                widget.top += topNotchHeight;
            }
        }

        // 计算底部被 Home 条遮挡的高度
        if (this.adaptBottom) {
            const bottomBarHeight = safeArea.y;
            if (bottomBarHeight > 0 && widget.isAlignBottom) {
                widget.bottom += bottomBarHeight;
            }
        }

        widget.updateAlignment(); // 强制刷新排版
    }
}