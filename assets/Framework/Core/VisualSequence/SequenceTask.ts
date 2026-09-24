/*安全任务执行器
* ：强制引入 GameObjectPool 并在第一阶段完成后自动回收传进来的替身节点（彻底消灭 destroy*/

import { Node } from 'cc';
import { SequenceContext } from './SequenceContext';
import { ISequenceNode } from './ISequenceNode';
import { IdGenerator } from '../../Utils/IdGenerator';
import { GameObjectPool } from '../Pool/GameObjectPool'; // 🌟 引入基建对象池

export class SequenceTask {
    public readonly id: number;

    // 🌟 强语义化命名：时刻提醒上层，这里只能传替身，不能传实体！
    private _dummyNodes: Node[];
    private _dummyPoolKey: string; // 必须知道替身的池子叫什么，才能回收

    private _ctx: SequenceContext;
    private _effectLogic: ISequenceNode;
    private _onFinish?: () => void;
    private _finished: boolean = false;

    constructor(
        dummyNodes: Node[],
        dummyPoolKey: string,
        ctx: SequenceContext,
        effectLogic: ISequenceNode,
        onFinish?: () => void
    ) {
        this.id = IdGenerator.next();
        this._dummyNodes = dummyNodes;
        this._dummyPoolKey = dummyPoolKey;
        this._ctx = ctx;
        this._effectLogic = effectLogic;
        this._onFinish = onFinish;
    }

    start() {
        this._effectLogic.playPhase1(this._dummyNodes, this._ctx, () => {
            if (this._ctx.isCanceled) return;

            // 🌟 第一阶段完成（比如球飞到了中心），安全回收满天飞的替身！
            this.recycleDummies();

            this._effectLogic.playPhase2(this._ctx, () => {
                if (this._ctx.isCanceled) return;
                this._finished = true;
                this._onFinish?.();
            });
        });
    }

    cancel() {
        if (this._finished) return;
        this._ctx.cancel();
        this._effectLogic.cancel?.(this._dummyNodes);
        this.recycleDummies(); // 发生中断时也要强制扫地
    }

    private recycleDummies() {
        if (!this._dummyPoolKey) return;
        this._dummyNodes.forEach(n => {
            if (n && n.isValid) {
                // 绝对安全地塞回对象池
                GameObjectPool.Instance.recycle(this._dummyPoolKey, n);
            }
        });
        this._dummyNodes = []; // 断开引用
    }
}