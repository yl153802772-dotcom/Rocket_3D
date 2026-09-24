/**
 * StateMachine.ts
 * 作用：有限状态机管理器
 */
import { Logger } from '../../../Framework/Core/Logger'; // 引入之前的日志类
import { IState } from './IState';

export class StateMachine {
    // 状态字典：存储所有注册的状态
    private _states: Map<number | string, IState> = new Map();

    // 当前正在运行的状态
    private _currentState: IState | null = null;
    private _currentStateId: number | string | null = null;

    /**
     * 注册状态
     * @param id 状态的唯一标识（通常用 Enum）
     * @param state 状态实例
     */
    public registerState(id: number | string, state: IState): void {
        this._states.set(id, state);
    }

    /**
     * 切换状态
     * @param id 目标状态的标识
     * @param data 传递给目标状态的参数
     */
    public changeState(id: number | string, data?: any): void {
        // 如果已经是这个状态了，直接忽略（也可以根据需求支持强制重入）
        if (this._currentStateId === id) {
            return;
        }

        const nextState = this._states.get(id);
        if (!nextState) {
            Logger.error(`试图切换到不存在的状态: ${id}`);
            return;
        }

        // 1. 退出当前状态
        if (this._currentState) {
            this._currentState.onExit();
        }

        // 2. 切换引用
        this._currentStateId = id;
        this._currentState = nextState;

        // 3. 进入新状态
        this._currentState.onEnter(data);
    }

    /**
     * 状态机心跳（由拥有这个状态机的实体在自己的 update 中调用）
     */
    public update(dt: number): void {
        if (this._currentState) {
            this._currentState.onUpdate(dt);
        }
    }

    /**
     * 获取当前状态 ID
     */
    public getCurrentStateId(): number | string | null {
        return this._currentStateId;
    }

    /**
     * 清理状态机
     */
    public destroy(): void {
        if (this._currentState) {
            this._currentState.onExit();
        }
        this._states.clear();
        this._currentState = null;
        this._currentStateId = null;
    }
}