import { RunContextFacade } from './RunContextFacade';
import { EncounterDescriptor, EncounterType } from './EncounterDescriptor';

/**
 * 受控随机/难度导演：纯逻辑推演机，只读状态，输出纯数据描述符。
 */
export class RunDirector {
    private _context: RunContextFacade = new RunContextFacade();

    public evaluateNextEncounter(): EncounterDescriptor {
        // Step D 测试：固定返回 DISTORTION 验证闭环；Step E 改为配置驱动
        return {
            type: EncounterType.DISTORTION,
            configId: 1001,
            intensity: 1.0,
        };
    }
}
