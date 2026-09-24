// Framework/Tools/FXPreviewer/FXDebugPanel.ts
import { _decorator, Component, Slider, Label, Toggle } from 'cc';
import { ElementType, EventName } from '../../Core/GameConst';
import { UniversalFXConfig } from '../../Core/Effect/UniversalFXConfig';
import { EventCenter } from '../../Data/EventCenter';

const { ccclass, property } = _decorator;

@ccclass('FXDebugPanel')
export class FXDebugPanel extends Component {

    @property(Slider) sliderRadius: Slider = null;
    @property(Label) labelRadius: Label = null;

    @property(Slider) sliderSpeed: Slider = null;
    @property(Label) labelSpeed: Label = null;

    @property(Slider) sliderScale: Slider = null;
    @property(Label) labelScale: Label = null;

    @property(Slider) sliderCount: Slider = null;
    @property(Label) labelCount: Label = null;

    @property(Toggle) toggleLoop: Toggle = null;

    private _radius: number = 100;
    private _speed: number = 1.0;
    private _scaleMul: number = 1.0;
    private _count: number = 2;
    private _isLoop: boolean = false;

    start() {
        if (this.sliderRadius) this.sliderRadius.progress = 0.5;
        if (this.sliderSpeed) this.sliderSpeed.progress = (1.0 - 0.1) / 1.9;
        if (this.sliderScale) this.sliderScale.progress = (1.0 - 0.1) / 2.9;
        if (this.sliderCount) this.sliderCount.progress = (2 - 1) / 9;
        if (this.toggleLoop) this.toggleLoop.isChecked = false;
        this.updateAllLabels();
    }

    private updateAllLabels() {
        if (this.labelRadius) this.labelRadius.string = `半径: ${this._radius.toFixed(0)}`;
        if (this.labelSpeed) this.labelSpeed.string = `速度: ${this._speed.toFixed(2)}`;
        if (this.labelScale) this.labelScale.string = `缩放: ${this._scaleMul.toFixed(2)}`;
        if (this.labelCount) this.labelCount.string = `数量: ${this._count}`;
    }

    onRadiusChange(slider: Slider) {
        this._radius = slider.progress * 200;
        this.updateAllLabels();
    }
    onSpeedChange(slider: Slider) {
        this._speed = 0.1 + slider.progress * 1.9;
        this.updateAllLabels();
    }
    onScaleChange(slider: Slider) {
        this._scaleMul = 0.1 + slider.progress * 2.9;
        this.updateAllLabels();
    }
    onCountChange(slider: Slider) {
        this._count = Math.floor(1 + slider.progress * 9);
        this.updateAllLabels();
    }
    onLoopToggle(toggle: Toggle) {
        this._isLoop = toggle.isChecked;
    }

    public onClickFire()  { this.emitPreviewEvent(ElementType.Fire); }
    public onClickWater() { this.emitPreviewEvent(ElementType.Water); }
    public onClickWind()  { this.emitPreviewEvent(ElementType.Wind); }
    public onClickEarth() { this.emitPreviewEvent(ElementType.Earth); }

    public onClickStop() {
        EventCenter.emit(EventName.DEBUG_STOP_FX);
    }

    private emitPreviewEvent(type: ElementType) {
        // 🌟 核心修复：绝不再带 DEFAULT_UNIVERSAL_FX_CONFIG 打底！
        // 只发送 UI 上真正被修改的变量 (Partial)
        const uiOverrides: Partial<UniversalFXConfig> = {
            speedMul: this._speed,
            scaleMul: this._scaleMul,
            shakeStrength: type === ElementType.Earth ? 10 : 0 // 测试土系震动
        };

        EventCenter.emit(EventName.DEBUG_PLAY_FX, {
            type: type,
            config: uiOverrides, // 这里传的是 Partial 补丁
            radius: this._radius,
            count: this._count,
            loop: this._isLoop
        });
    }
}