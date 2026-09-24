// Framework/Utils/MathUtil.ts
import { Vec3 } from 'cc';

export class MathUtil {
    /**
     * 获取指定范围内的随机浮点数
     */
    public static randomRange(min: number, max: number): number {
        return min + Math.random() * (max - min);
    }

    /**
     * 计算两点之间的 2D 夹角（返回角度值 Degree，适用于 setRotationFromEuler）
     */
    public static getAngleDegrees2D(from: Vec3, to: Vec3): number {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        return Math.atan2(dy, dx) * (180 / Math.PI);
    }
}