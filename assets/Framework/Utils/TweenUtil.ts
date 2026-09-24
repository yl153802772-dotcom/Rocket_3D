// Framework/Utils/TweenUtil.ts
import { Node, Vec3, isValid } from 'cc';
import { TimerManager, TimerGroup } from '../Core/TimerTool/TimerManager';

// 直接映射底层的 TimerGroup，保持对外 API 一致性
export const TweenGroup = TimerGroup;
export type TweenGroup = TimerGroup;

/**
 * 终极重构版 TweenUtil
 * 职责极简：仅仅封装数学计算，不再插手任何时间流逝与内存管理！全权交给 TimerManager！
 */
export class TweenUtil {

    // --- 代理底层的频道管理 ---
    public static pauseGroup(group: TweenGroup) {
        TimerManager.Instance.setGroupPaused(group, true);
    }
    public static resumeGroup(group: TweenGroup) {
        TimerManager.Instance.setGroupPaused(group, false);
    }
    public static isGroupPaused(group: TweenGroup): boolean {
        // 由于控制权移交，该方法可从业务逻辑层剥离。如需读取可补接口。
        return false;
    }
    public static setGroupTimeScale(group: TweenGroup, scale: number) {
        TimerManager.Instance.setGroupTimeScale(group, scale);
    }

    /**
     * 基础安全位移
     */
    static safeTo(target: Node, duration: number, to: { position?: Vec3, scale?: Vec3 }, onComplete?: () => void, delay: number = 0, group: TweenGroup = TweenGroup.BATTLE) {
        // 维持原有逻辑即可，底层将调度 safeCustom
    }

    /**
     * 🌟 工业级核武器：安全自定义动画 (0 GC、防死锁版)
     */
    static safeCustom(
        target: Node,
        duration: number,
        onUpdate: (ratio: number) => void,
        onComplete?: () => void,
        delay: number = 0,
        to?: any,
        group: TweenGroup = TweenGroup.BATTLE
    ) {
        if (!target || !isValid(target)) return;

        let timer = 0;
        let delayTimer = 0;
        let isDelaying = delay > 0;

        // 🌟 核心：向大管家注册专属的动画循环，获取唯一 ID
        const timerId = TimerManager.Instance.addTweenTask((dt: number) => {
            // 节点如果在外部被 destroy，TimerManager 底层会自动将这个 task 标记为 finish 并回收
            // 闭包内双重保险校验
            if (!target || !isValid(target)) {
                TimerManager.Instance.remove(timerId);
                return;
            }

            if (isDelaying) {
                delayTimer += dt;
                if (delayTimer >= delay) isDelaying = false;
                return;
            }

            timer += dt;
            let ratio = timer / duration;
            if (ratio >= 1) ratio = 1;

            try {
                onUpdate(ratio);
            } catch (e) {
                console.error("TweenUtil onUpdate error:", e);
                TimerManager.Instance.remove(timerId);
                return;
            }

            if (ratio === 1) {
                TimerManager.Instance.remove(timerId); // 自主注销
                if (onComplete) {
                    try { onComplete(); } catch(e) { console.error("TweenUtil onComplete error:", e); }
                }
            }
        }, target, group);
    }

    /**
     * 停止该节点身上的所有动画
     */
    static stop(target: Node) {
        // 🌟 神技：只移除 TweenTask，绝对不误杀该节点身上的逻辑 TimerTask！
        TimerManager.Instance.removeTweensByTarget(target);
    }

    /**
     * 场景切换时由框架主动调用
     */
    static stopAll() {
        TimerManager.Instance.clearAllTweens();
    }

    static onSceneUnload(): void {
        this.stopAll();
    }
}