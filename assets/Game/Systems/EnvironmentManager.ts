import { Node, Prefab, find, director } from 'cc';
import { ResManager, ResType, ResourceLoadScope, isResourceLoadAbandonedError } from '../../Framework/Core/ResManager';
import { GameObjectPool, RenderType } from '../../Framework/Core/Pool/GameObjectPool';
import { ConfigManager } from '../../Framework/Core/ConfigManager';

interface LevelRow {
    id: number;
    envPrefabPath: string;
    themeBundle: string;
}

/**
 * 关卡环境管理器（Game 层业务系统）。
 * 读取 level 配置，加载美术 Prefab，用对象池实例化并管理资源租约。
 */
export class EnvironmentManager {
    private static _instance: EnvironmentManager = null;
    public static get Instance(): EnvironmentManager {
        if (!this._instance) this._instance = new EnvironmentManager();
        return this._instance;
    }

    private _currentEnvNode: Node | null = null;
    private _currentPrefabPath = '';
    private _currentBundle = '';
    private _loadScope: ResourceLoadScope | null = null;

    public async buildEnvironmentByLevel(levelId: number): Promise<void> {
        const cfg = ConfigManager.Instance.query<LevelRow>('level', levelId);
        if (!cfg || !cfg.envPrefabPath) {
            console.warn(`[Environment] 未找到关卡 ${levelId} 的环境配置`);
            return;
        }
        await this.switchEnvironment(cfg.themeBundle, cfg.envPrefabPath);
    }

    private async switchEnvironment(bundleName: string, prefabPath: string): Promise<void> {
        this.clearCurrentEnvironment();
        this._currentPrefabPath = prefabPath;
        this._currentBundle = bundleName;
        this._loadScope = new ResourceLoadScope(`EnvLoad_${prefabPath}`);

        try {
            const prefab = await ResManager.Instance.load<Prefab>(
                prefabPath,
                Prefab,
                bundleName,
                ResType.NORMAL,
                undefined,
                this._loadScope,
            );
            GameObjectPool.Instance.registerPrefab(prefabPath, prefab, RenderType.Mesh3D);
            const envNode = GameObjectPool.Instance.spawn(prefabPath);
            if (envNode) {
                const root = find('EnvironmentRoot') || director.getScene();
                envNode.setParent(root);
                envNode.setPosition(0, 0, 0);
                this._currentEnvNode = envNode;
            }
        } catch (error) {
            if (isResourceLoadAbandonedError(error)) {
                console.debug(`[Environment] 环境加载已取消: ${prefabPath}`);
            } else {
                console.error(`[Environment] 环境加载失败: ${prefabPath}`, error);
            }
        }
    }

    public clearCurrentEnvironment(): void {
        if (this._loadScope) {
            this._loadScope.invalidate();
            this._loadScope = null;
        }
        if (this._currentEnvNode && this._currentEnvNode.isValid) {
            GameObjectPool.Instance.recycle(this._currentEnvNode);
            this._currentEnvNode = null;
        }
        if (this._currentPrefabPath) {
            ResManager.Instance.release(this._currentPrefabPath, this._currentBundle);
            this._currentPrefabPath = '';
            this._currentBundle = '';
        }
    }
}
