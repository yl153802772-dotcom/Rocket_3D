/**
 * IState.ts
 * 作用：状态的接口规范
 */
export interface IState {
    /** * 状态进入时调用（常用于播放动画、初始化数据）
     * @param data 切换状态时传递的参数
     */
    onEnter(data?: any): void;

    /** * 状态更新时调用（每帧执行的具体逻辑）
     */
    onUpdate(dt: number): void;

    /** * 状态退出时调用（常用于清理特效、重置变量）
     */
    onExit(): void;
}