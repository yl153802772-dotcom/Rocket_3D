export enum EncounterType {
    NEBULA = "NEBULA",
    DISTORTION = "DISTORTION",
    MIRROR = "MIRROR",
    ROTATE = "ROTATE",
    SPEED = "SPEED",
    TIME = "TIME",
    BLACK_HOLE = "BLACK_HOLE",
    METEOR_SHOWER = "METEOR_SHOWER",
    MYSTERY = "MYSTERY",
    RUIN = "RUIN",
    SIGNAL = "SIGNAL",
}

export interface EncounterDescriptor {
    readonly type: EncounterType;
    readonly configId: string | number;
    readonly intensity: number;
    readonly preloadHints?: string[];
}
