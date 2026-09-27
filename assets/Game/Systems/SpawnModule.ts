import { director, find, Node, Prefab } from 'cc';
import { ILifecycleModule } from '../../Framework/Core/ModuleSystem';
import { GameObjectPool, RenderType } from '../../Framework/Core/Pool/GameObjectPool';
import { ResManager, ResType } from '../../Framework/Core/ResManager';

/**
 * 陨石生成：通过 GameObjectPool（Mesh3D 渲染适配器）动态生成与回收。
 */
export class SpawnModule implements ILifecycleModule {
    public static Instance: SpawnModule = null;
    public readonly priority = 610;

    private readonly SPAWN_INTERVAL = 0.8;
    private readonly SPAWN_Z = -150;
    private readonly METEOR_PREFAB = 'Prefab/Meteor';

    public active: Node[] = [];
    private _root: Node | null = null;
    private _ready = false;
    private _spawnTimer = 0;

    public init(): void {
        SpawnModule.Instance = this;
        this._root = find('Entities') || director.getScene();
    }

    public async start(): Promise<void> {
        try {
            const prefab = await ResManager.Instance.load<Prefab>(
                this.METEOR_PREFAB,
                Prefab,
                undefined,
                ResType.EXPLICIT,
            );
            GameObjectPool.Instance.registerPrefab('Meteor', prefab, RenderType.Mesh3D);
            this._ready = true;
        } catch (e) {
            console.error('[SpawnModule] 陨石 Prefab 加载失败:', e);
        }
    }

    public update(dt: number): void {
        if (!this._ready) return;
        this._spawnTimer -= dt;
        if (this._spawnTimer <= 0) {
            this._spawnTimer = this.SPAWN_INTERVAL;
            this.spawn();
        }
    }

    private spawn(): void {
        if (!this._root) return;
        const node = GameObjectPool.Instance.spawn('Meteor');
        if (!node) return;
        node.setParent(this._root);
        node.setPosition(
            (Math.random() - 0.5) * 12,
            (Math.random() - 0.5) * 6,
            this.SPAWN_Z,
        );
        this.active.push(node);
    }

    public recycle(node: Node): void {
        const i = this.active.indexOf(node);
        if (i >= 0) this.active.splice(i, 1);
        GameObjectPool.Instance.recycle(node);
    }

    public dispose(): void {
        this.active.length = 0;
        this._ready = false;
        SpawnModule.Instance = null;
    }
}
