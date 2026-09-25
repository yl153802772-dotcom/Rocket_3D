// DebugPanel.ts
import { _decorator, Component, Label,Color } from 'cc';
import { PerformanceMonitor } from './PerformanceMonitor';

const { ccclass, property } = _decorator;

@ccclass('DebugPanel')
export class DebugPanel extends Component {

    @property(Label)
    fpsLabel: Label = null;

    @property(Label)
    nodeLabel: Label = null;

    @property(Label)
    memLabel: Label = null;

    update(dt: number) {

        PerformanceMonitor.Instance.update(dt);

        const fps = PerformanceMonitor.Instance.getFPS();
        const avg = PerformanceMonitor.Instance.getAverageFPS();
        const node = PerformanceMonitor.Instance.getNode();

        const res = PerformanceMonitor.Instance.getResInfo();
        const pool = PerformanceMonitor.Instance.getPoolInfo();

        this.fpsLabel.string = `FPS: ${fps} (${avg.toFixed(1)})`;
        this.nodeLabel.string = `Node: ${node}`;

        this.memLabel.string =
            `Res: ${res.active || 0}\n` +
            `LRU: ${res.lru || 0}\n` +
            `Pool: ${/*pool.total || */0}`;

        // ===== 颜色警告 =====
        this.fpsLabel.color = fps < 30 ? Color.RED : Color.WHITE;
    }
}