/*全局调度大脑
* 提供给上层业务调用的纯净入口。*/

import { Node, Vec3 } from 'cc';
import { SequenceContext } from './SequenceContext';
import { SequenceTask } from './SequenceTask';
import { ISequenceNode } from './ISequenceNode';

export class SequenceManager {
    private static _tasks = new Map<number, SequenceTask>();

    /**
     * @param effectLogic 具体的特效策略类 (比如 FireMergeEffect)
     * @param dummyNodes 替身节点数组
     * @param dummyPoolKey 替身节点的回收 Key (如 "DummySphere")
     * @param center 爆炸中心点
     * @param onFinish 全部完成的回调
     */
    static play(
        effectLogic: ISequenceNode,
        dummyNodes: Node[],
        dummyPoolKey: string,
        center: Vec3,
        onFinish?: () => void
    ): SequenceContext {
        const ctx = new SequenceContext(center);

        const task = new SequenceTask(dummyNodes, dummyPoolKey, ctx, effectLogic, () => {
            this._tasks.delete(task.id);
            if (onFinish) onFinish();
        });

        this._tasks.set(task.id, task);
        task.start();

        return ctx;
    }

    static cancelAll() {
        this._tasks.forEach(t => t.cancel());
        this._tasks.clear();
    }
}