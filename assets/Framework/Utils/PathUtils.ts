// 👇 ===== 新增文件：PathUtils.ts =====
import { Vec3 } from 'cc';

// 🌟 新增接口：用于存储预计算好的平滑路径数据
export interface IPathData {
    points: Vec3[];
    segmentLengths: number[];
    totalLength: number;
}

export class PathUtils {
    // ==========================================
    // 基础数学辅助库 (兼容 Cocos Vec3，忽略 z 轴)
    // ==========================================
    private static normalize(v: Vec3): Vec3 {
        const len = Math.hypot(v.x, v.y);
        return len === 0 ? new Vec3(0, 0, 0) : new Vec3(v.x / len, v.y / len, 0);
    }

    private static sub(a: Vec3, b: Vec3): Vec3 {
        return new Vec3(a.x - b.x, a.y - b.y, 0);
    }

    private static add(a: Vec3, b: Vec3): Vec3 {
        return new Vec3(a.x + b.x, a.y + b.y, 0);
    }

    private static mul(v: Vec3, s: number): Vec3 {
        return new Vec3(v.x * s, v.y * s, 0);
    }

    private static dot(a: Vec3, b: Vec3): number {
        return a.x * b.x + a.y * b.y;
    }

    // 获取法线（左法线）
    private static getNormal(v: Vec3): Vec3 {
        return new Vec3(-v.y, v.x, 0);
    }

    /**
     * 🌟 核心算法 1：过滤距离过近的重叠塔位
     */
    private static filterTooClose(spots: Vec3[], minDist: number = 100): Vec3[] {
        const result: Vec3[] = [];
        for (const s of spots) {
            // 如果 result 里的每一个点，离当前点 s 的距离都大于 minDist，才塞进去
            if (result.every(r => Vec3.distance(r, s) > minDist)) {
                result.push(s);
            }
        }
        return result;
    }

    /**
     * 🌟 核心算法 2：基于 S 型路线自动计算高价值防守塔位
     * @param pathPoints 原始路径关键点
     * @param offset 塔位偏离路线的法线距离
     * @param maxSpots 期望生成的最大塔位数量
     * @param minY 🌟 架构护城河：Y轴最低限制，防止塔位生成在下半区(例如 -150)
     */
    public static generateTowerSpots(
        pathPoints: any[],
        offset: number = 120,
        maxSpots: number = 6,
        minY: number = -150
    ): any[] {
        if (!pathPoints || pathPoints.length < 3) return [];

        // 将配置表的普通对象转为 Vec3 方便计算
        const path: Vec3[] = pathPoints.map(p => new Vec3(p.x, p.y, 0));
        let rawSpots: Vec3[] = [];

        // 遍历弯道寻找交汇点
        for (let i = 1; i < path.length - 1; i++) {
            const prev = path[i - 1];
            const curr = path[i];
            const next = path[i + 1];

            const dir1 = this.normalize(this.sub(curr, prev));
            const dir2 = this.normalize(this.sub(next, curr));

            // 计算转弯强度（夹角）
            const d = this.dot(dir1, dir2);

            // d 越小（甚至负），弯越大。这里可以当做策划参数微调
            if (d < 0.8) {
                // 法线方向（往路径外扩）
                const normal = this.normalize(this.getNormal(dir2));

                // 两侧各放一个
                const left = this.add(curr, this.mul(normal, offset));
                const right = this.add(curr, this.mul(normal, -offset));

                // 🌟 核心防护：绝不让塔位掉进下半屏的合成区！
                if (left.y >= minY) rawSpots.push(left);
                if (right.y >= minY) rawSpots.push(right);
            }
        }

        // 1. 去重防贴脸 (保证塔和塔之间至少间隔 100 像素)
        let filteredSpots = this.filterTooClose(rawSpots, 100);

        // 2. 截取最大数量，并转回普通 JSON 对象格式返回，以便兼容旧框架
        let finalSpots = filteredSpots.slice(0, maxSpots).map(p => ({ x: Math.floor(p.x), y: Math.floor(p.y) }));

        return finalSpots;
    }

    // ==========================================
    // 🌟 曲线平滑与寻路插值引擎 (新增区)
    // ==========================================

    private static catmullRom(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 {
        const t2 = t * t;
        const t3 = t2 * t;
        const f0 = -0.5 * t3 + t2 - 0.5 * t;
        const f1 = 1.5 * t3 - 2.5 * t2 + 1.0;
        const f2 = -1.5 * t3 + 2.0 * t2 + 0.5 * t;
        const f3 = 0.5 * t3 - 0.5 * t2;
        return new Vec3(
            p0.x * f0 + p1.x * f1 + p2.x * f2 + p3.x * f3,
            p0.y * f0 + p1.y * f1 + p2.y * f2 + p3.y * f3,
            0
        );
    }

    /**
     * 1. 曲线平滑化：将几个生硬的折点，扩充为圆润的曲线点阵
     */
    public static generateSmoothPath(points: Vec3[], segmentsPerCurve: number = 10): Vec3[] {
        if (points.length < 3) return points;
        let result: Vec3[] = [];
        // 补齐首尾控制点
        let p = [points[0], ...points, points[points.length - 1]];

        for (let i = 1; i < p.length - 2; i++) {
            for (let j = 0; j <= segmentsPerCurve; j++) {
                if (i !== p.length - 3 && j === segmentsPerCurve) continue;
                result.push(this.catmullRom(p[i - 1], p[i], p[i + 1], p[i + 2], j / segmentsPerCurve));
            }
        }
        return result;
    }

    /**
     * 2. 预计算路径元数据 (只在造怪前算一次，极大节省 CPU)
     */
    public static computePathData(points: Vec3[]): IPathData {
        let segmentLengths: number[] = [];
        let totalLength = 0;
        for (let i = 0; i < points.length - 1; i++) {
            let len = Vec3.distance(points[i], points[i + 1]);
            segmentLengths.push(len);
            totalLength += len;
        }
        return { points, segmentLengths, totalLength };
    }

    /**
     * 3. 弧长插值：根据当前已走过的距离，算出具体的坐标和车头朝向
     */
    public static getPosAndAngle(distance: number, pathData: IPathData): { pos: Vec3, angle: number } {
        let dist = distance;
        for (let i = 0; i < pathData.segmentLengths.length; i++) {
            let segLen = pathData.segmentLengths[i];

            if (dist <= segLen) {
                let t = dist / segLen;
                let p1 = pathData.points[i];
                let p2 = pathData.points[i + 1];
                let pos = new Vec3(
                    p1.x + (p2.x - p1.x) * t,
                    p1.y + (p2.y - p1.y) * t,
                    0
                );
                // 算出朝向角度 (Cocos 的 2D 旋转角度算法)
                let angle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * (180 / Math.PI);
                return { pos, angle };
            }
            dist -= segLen;
        }
        // 走到终点了
        return { pos: pathData.points[pathData.points.length - 1], angle: 0 };
    }


    /**
     * 🌟 核心升维算法：通过世界坐标，反推其在路线上的 travelledDistance (已走距离)
     * 用于风系黑洞吸附后，重新校准怪物的寻路进度，防瞬移跳步。
     */
    public static getDistanceByPos(worldPos: Vec3, pathData: IPathData): number {
        if (!pathData || !pathData.points || pathData.points.length < 2) return 0;

        let minDistSq = Number.MAX_VALUE;
        let bestDistance = 0;
        let accumulatedLength = 0;

        for (let i = 0; i < pathData.points.length - 1; i++) {
            let p1 = pathData.points[i];
            let p2 = pathData.points[i + 1];

            let dx = p2.x - p1.x;
            let dy = p2.y - p1.y;
            let l2 = dx * dx + dy * dy; // 线段长度的平方

            if (l2 === 0) continue;

            // 计算投射点 t (0 到 1 之间，限制在线段内)
            let t = Math.max(0, Math.min(1, ((worldPos.x - p1.x) * dx + (worldPos.y - p1.y) * dy) / l2));

            // 获取投射后的基准坐标
            let projX = p1.x + t * dx;
            let projY = p1.y + t * dy;

            // 比较当前点到线段的垂直/端点距离平方
            let distSq = (worldPos.x - projX) ** 2 + (worldPos.y - projY) ** 2;

            // 找到离当前世界坐标最近的线段
            if (distSq < minDistSq) {
                minDistSq = distSq;
                bestDistance = accumulatedLength + Math.sqrt((projX - p1.x) ** 2 + (projY - p1.y) ** 2);
            }

            accumulatedLength += Math.sqrt(l2);
        }

        return bestDistance;
    }
    
}
// 👆 ===== 新增结束 =====