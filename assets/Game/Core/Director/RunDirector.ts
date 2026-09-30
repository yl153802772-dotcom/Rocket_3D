import { RunContextFacade } from './RunContextFacade';
import { EncounterDescriptor, EncounterType } from './EncounterDescriptor';
import { ConfigManager } from '../../../Framework/Core/ConfigManager';
import { ConfigKey } from '../../GameConst';
import { EncounterRow } from '../BattleConfig';

/**
 * 受控随机/难度导演：纯逻辑推演机，只读状态，输出纯数据描述符。
 */
export class RunDirector {
    private _context: RunContextFacade = new RunContextFacade();

    public evaluateNextEncounter(): EncounterDescriptor {
        const rows = ConfigManager.Instance.getAll<EncounterRow>(ConfigKey.ENCOUNTER);
        const row = rows[0];
        if (row) {
            return {
                type: row.type as EncounterType,
                configId: row.configId,
                intensity: row.intensity,
            };
        }
        // 回退：配置缺失时固定 DISTORTION
        return {
            type: EncounterType.DISTORTION,
            configId: 1001,
            intensity: 1.0,
        };
    }
}
