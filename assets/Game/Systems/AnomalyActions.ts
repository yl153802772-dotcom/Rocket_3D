import { RuntimeDataCenter } from '../../Framework/Data/DataCenter';
import { DataKey } from 'db://assets/Framework/Core/GameConst';
import { InputTransform } from './InputTransform';
import { FlightZone } from '../Core/FlightZone';
import {
    CameraShiftHint,
    IAnomalyActions,
    InputModifier,
    SpawnRequest,
} from '../Encounter/IAnomalyActions';

/**
 * 连续型异常动作实现：委托给 InputTransform / FlightZone / RuntimeDataCenter，不暴露裸 set / Node。
 */
export class AnomalyActions implements IAnomalyActions {
    public applyInputModifier(mod: InputModifier): void {
        InputTransform.Instance?.push(mod);
    }

    public removeInputModifier(mod: InputModifier): void {
        InputTransform.Instance?.pop(mod);
    }

    public setForwardSpeed(v: number): void {
        FlightZone.Instance.forwardSpeed = v;
    }

    public setTimeScale(v: number): void {
        RuntimeDataCenter.Instance.set(DataKey.TIME_SCALE, v);
    }

    public requestSpawn(_req: SpawnRequest): void {
        // Step D 未接生成请求，Step G 由 SpawnModule 统一落地
    }

    public setNebulaTheme(_themeId: string): void {
        // 星云主题切换待视觉管线就绪后实现
    }

    public requestPreload(_hints: string[]): void {
        // 按需预载待资源管线就绪后实现
    }

    public requestCameraShift(_hint: CameraShiftHint): void {
        // 相机偏移待 CameraRig 扩展受控接口后实现
    }

    public pushPauseLock(name: string): void {
        RuntimeDataCenter.Instance.addPauseLock(name);
    }

    public popPauseLock(name: string): void {
        RuntimeDataCenter.Instance.removePauseLock(name);
    }
}
