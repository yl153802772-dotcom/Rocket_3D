/**
 * I18nLabel.ts
 * 作用：多语言文本组件（挂载到 Label 节点即可生效）
 */
import { _decorator, Component, Label } from 'cc';
import { EventCenter } from "../../Data/EventCenter";
import { EventName } from "../../Core/GameConst";
import { ConfigManager } from "../../Core/ConfigManager";
const { ccclass, property, requireComponent } = _decorator;

@ccclass('I18nLabel')
@requireComponent(Label)
export class I18nLabel extends Component {

    @property({ tooltip: "语言表里的唯一 Key" })
    public i18nKey: string = "";

    private _label: Label = null;

    // ✅ 修复：使用类属性箭头函数。这样它永远是同一个引用，且 this 永远指向当前组件
    private _onLangChange = () => {
        this.updateLabel();
    };

    onLoad() {
        this._label = this.getComponent(Label);
    }

    onEnable() {
        this.updateLabel();

        // ✅ 注册时用这个固定引用
        EventCenter.on(EventName.LANGUAGE_CHANGED, this._onLangChange);
    }

    onDisable() {
        // ✅ 离开时解绑用同一个引用，才能真正释放内存！
        EventCenter.off(EventName.LANGUAGE_CHANGED, this._onLangChange);
    }

    public updateLabel() {
        if (!this.i18nKey || !this._label) return;

        // ✅ 同步更新：使用规范的 query API 提取单行数据
        const langRow = ConfigManager.Instance.query<any>("lang", this.i18nKey);
        const currentLang = "zh";

        if (langRow) {
            this._label.string = langRow[currentLang] || this.i18nKey;
        } else {
            this._label.string = this.i18nKey;
        }
    }
}