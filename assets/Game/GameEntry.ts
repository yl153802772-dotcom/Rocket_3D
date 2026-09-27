/**
 * @module GameEntry
 * @description 深空火箭入口：最小切片启动。场景保持空场景，实体由模块动态生成。
 */
import { _decorator, Component } from 'cc';
import { App } from '../Framework/Core/App';
import { TimerManager } from '../Framework/Core/TimerTool/TimerManager';
import { Logger } from '../Framework/Core/Logger';
import { BattleFlow } from './Core/BattleFlow';
import { CameraRig } from './Core/CameraRig';
import { InputModule } from './Systems/InputModule';
import { InputTransform } from './Systems/InputTransform';
import { RocketModule } from './Systems/RocketModule';
import { SpawnModule } from './Systems/SpawnModule';
import { HazardModule } from './Systems/HazardModule';
import { EncounterSystem } from './Systems/EncounterSystem';

const { ccclass } = _decorator;

@ccclass('GameEntry')
export class GameEntry extends Component {
    async start() {
        Logger.info("深空火箭启动");
        await App.Instance.init();
        this.registerModules();
        await App.Instance.start();
    }

    private registerModules(): void {
        const moduleSystem = App.Instance.moduleSystem;
        moduleSystem.register("TimerManager", TimerManager.Instance);
        moduleSystem.register("BattleFlow", new BattleFlow());
        moduleSystem.register("CameraRig", new CameraRig());
        moduleSystem.register("InputTransform", new InputTransform());
        moduleSystem.register("InputModule", new InputModule());
        moduleSystem.register("RocketModule", new RocketModule());
        moduleSystem.register("SpawnModule", new SpawnModule());
        moduleSystem.register("HazardModule", new HazardModule());
        moduleSystem.register("EncounterSystem", new EncounterSystem());
    }
}
