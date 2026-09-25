/**
 * @module CameraManager
 * @description
 * [模块逻辑]
 * 游戏多相机分层渲染系统的核心管家。
 * 负责严格隔离 3D 场景透视相机 (MainCamera) 与 2D UI 正交相机 (UICamera) 的渲染层级，防范 3D 穿透与透视畸变。
 *
 * [调用规则]
 * 1. 业务层禁止直接通过 find 获取相机，必须通过 CameraManager.Instance.mainCamera 获取。
 * 2. 3D 世界向 UI 屏幕空间的映射（如血条跟谁），直接调用 worldToUINodeSpace 进行极速转换。
 */

import { _decorator, Node, Camera, find, Vec3, UITransform, Layers } from 'cc';
import { Logger, LogModule } from './Logger';

export class CameraManager {
    private static _instance: CameraManager = null;
    public static get Instance(): CameraManager {
        if (!this._instance) this._instance = new CameraManager();
        return this._instance;
    }

    public mainCamera: Camera | null = null;
    public uiCamera: Camera | null = null;
    public uiCanvasNode: Node | null = null;

    public init(): void {
        Logger.info(LogModule.FRAMEWORK, "CameraManager 初始化 (3D/2D 相机分离架构已就绪)");

        // 1. 获取并配置 2D UI 画布与相机
        this.uiCanvasNode = find("Canvas");
        if (this.uiCanvasNode) {
            this.uiCamera = this.uiCanvasNode.getComponentInChildren(Camera);
            if (this.uiCamera) {
                // ✅ 渲染隔离：确保 UI 相机只渲染 UI_2D 和 UI_3D 层
                this.uiCamera.visibility = Layers.Enum.UI_2D | Layers.Enum.UI_3D;
            }
        } else {
            Logger.error(LogModule.FRAMEWORK, "未找到名为 'Canvas' 的节点！UI 渲染将无法工作。");
        }

        // 2. 获取并配置 3D 主相机
        const mainCamNode = find("Main Camera");
        if (mainCamNode) {
            this.mainCamera = mainCamNode.getComponent(Camera);
            if (this.mainCamera) {
                // ✅ 渲染隔离：确保 3D 相机绝对不渲染 UI，防止模型穿透 UI 面板
                this.mainCamera.visibility &= ~(Layers.Enum.UI_2D | Layers.Enum.UI_3D);
            }
        } else {
            Logger.warn(LogModule.FRAMEWORK, "未找到名为 'Main Camera' 的 3D 场景相机节点，如果是纯 2D 游戏请忽略。");
        }
    }

    /**
     * 核心基础算法：将 3D 世界坐标映射为特定 UI 节点的局部坐标
     * 常用于：3D 怪物的头顶血条、伤害飘字跟随
     * @param worldPos 3D 空间中的实际坐标
     * @param uiParentNode 作为容器的 UI 父节点
     * @param outVec3 计算结果的输出容器（避免 GC）
     * @returns 是否转换成功
     */
    public worldToUINodeSpace(worldPos: Vec3, uiParentNode: Node, outVec3: Vec3): boolean {
        if (!this.mainCamera || !this.uiCamera || !uiParentNode || !uiParentNode.isValid) {
            return false;
        }

        const uiTransform = uiParentNode.getComponent(UITransform);
        if (!uiTransform) return false;

        // 1. 3D 世界坐标 -> 设备屏幕坐标
        const screenPos = new Vec3();
        this.mainCamera.worldToScreen(worldPos, screenPos);

        // 2. 设备屏幕坐标 -> UI 世界坐标
        const uiWorldPos = new Vec3();
        this.uiCamera.screenToWorld(screenPos, uiWorldPos);

        // 3. UI 世界坐标 -> UI 父节点的局部坐标
        uiTransform.convertToNodeSpaceAR(uiWorldPos, outVec3);

        return true;
    }
}