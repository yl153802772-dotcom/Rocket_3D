import { EventMouse, EventTouch, input, Input } from 'cc';
import { ILifecycleModule } from '../../Framework/Core/ModuleSystem';
import { InputTransform } from './InputTransform';

/**
 * 原始输入采集：只产出屏幕增量，交由 InputTransform 做修饰与目标映射。
 */
export class InputModule implements ILifecycleModule {
    public readonly priority = 800;
    private _mouseDown = false;

    public init(): void {
        input.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.on(Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
        input.on(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
        input.on(Input.EventType.MOUSE_UP, this.onMouseUp, this);
        input.on(Input.EventType.MOUSE_LEAVE, this.onMouseUp, this);
    }

    private onTouchMove(e: EventTouch): void {
        const d = e.getDelta();
        InputTransform.Instance?.applyRawDelta(d.x, d.y);
    }

    private onMouseDown(_e: EventMouse): void {
        this._mouseDown = true;
    }

    private onMouseUp(_e: EventMouse): void {
        this._mouseDown = false;
    }

    private onMouseMove(e: EventMouse): void {
        if (!this._mouseDown) return;
        const d = e.getDelta();
        InputTransform.Instance?.applyRawDelta(d.x, d.y);
    }

    public dispose(): void {
        input.off(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.off(Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
        input.off(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
        input.off(Input.EventType.MOUSE_UP, this.onMouseUp, this);
        input.off(Input.EventType.MOUSE_LEAVE, this.onMouseUp, this);
    }
}
