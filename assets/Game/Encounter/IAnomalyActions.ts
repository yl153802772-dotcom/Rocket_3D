export enum InputModifier {
    NORMAL = "NORMAL",
    INVERT = "INVERT",
    MIRROR = "MIRROR",
    ROTATE90 = "ROTATE90",
    INERTIA = "INERTIA",
}

export interface SpawnRequest {
    kind: string;
    count: number;
    intensity: number;
}

export interface CameraShiftHint {
    dx: number;
    dy: number;
    damping: number;
}

/**
 * 连续型异常的最小权限动作白名单：只允许命名方法，不暴露裸 set / Node。
 */
export interface IAnomalyActions {
    applyInputModifier(mod: InputModifier): void;
    removeInputModifier(mod: InputModifier): void;
    setForwardSpeed(v: number): void;
    setTimeScale(v: number): void;
    requestSpawn(req: SpawnRequest): void;
    setNebulaTheme(themeId: string): void;
    requestPreload(hints: string[]): void;
    requestCameraShift(hint: CameraShiftHint): void;
    pushPauseLock(name: string): void;
    popPauseLock(name: string): void;
}
