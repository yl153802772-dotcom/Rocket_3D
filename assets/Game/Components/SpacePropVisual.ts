import { _decorator, Component, MeshRenderer, Texture2D, Material } from 'cc';
import { ResManager, ResType, ResourceLoadScope, isResourceLoadAbandonedError } from '../../Framework/Core/ResManager';
import { Logger, LogModule } from '../../Framework/Core/Logger';

const { ccclass, requireComponent } = _decorator;

/**
 * 通用深空面片渲染组件（Game 业务层）。
 * 负责动态加载 Texture2D 并替换材质实例贴图，配合 ResourceLoadScope 保证内存安全。
 */
@ccclass('SpacePropVisual')
@requireComponent(MeshRenderer)
export class SpacePropVisual extends Component {
    private _meshRenderer: MeshRenderer | null = null;
    private _dynamicMat: Material | null = null;

    private _currentTexturePath = '';
    private _currentBundleName = '';
    private _loadScope: ResourceLoadScope | null = null;

    onLoad() {
        this._meshRenderer = this.getComponent(MeshRenderer);
    }

    public async setTexture(bundleName: string, texturePath: string): Promise<void> {
        if (!this._meshRenderer) return;

        if (this._currentTexturePath) {
            ResManager.Instance.release(this._currentTexturePath, this._currentBundleName);
        }

        this._currentTexturePath = texturePath;
        this._currentBundleName = bundleName;

        if (this._loadScope) {
            this._loadScope.invalidate();
        }
        this._loadScope = new ResourceLoadScope(`SpaceProp_${this.node.uuid}`);

        try {
            const tex = await ResManager.Instance.load<Texture2D>(
                texturePath,
                Texture2D,
                bundleName,
                ResType.NORMAL,
                undefined,
                this._loadScope,
            );

            if (!this._dynamicMat) {
                this._dynamicMat = this._meshRenderer.material;
            }
            if (this._dynamicMat) {
                this._dynamicMat.setProperty('mainTexture', tex);
            }
        } catch (error) {
            if (isResourceLoadAbandonedError(error)) {
                Logger.debug(LogModule.RES_MANAGER, `面片贴图加载已丢弃: ${texturePath}`);
            } else {
                Logger.error(LogModule.RES_MANAGER, `面片贴图加载失败: ${texturePath}`, error);
            }
        }
    }

    public dispose(): void {
        if (this._loadScope) {
            this._loadScope.invalidate();
            this._loadScope = null;
        }

        if (this._currentTexturePath) {
            ResManager.Instance.release(this._currentTexturePath, this._currentBundleName);
            this._currentTexturePath = '';
            this._currentBundleName = '';
        }

        if (this._dynamicMat) {
            this._dynamicMat.setProperty('mainTexture', null);
        }
    }

    onDestroy() {
        this.dispose();
    }
}
