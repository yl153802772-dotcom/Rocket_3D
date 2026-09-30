import { _decorator, Component, Vec3, Camera, Quat, director } from 'cc';
const { ccclass, property } = _decorator;

/**
 * @module CoreFramework
 * @description 通用广告牌组件 (Billboard)
 * 使节点始终朝向指定的摄像机，支持轴向锁定与自定义角度偏移。
 */
@ccclass('BillboardComponent')
export class BillboardComponent extends Component {
    @property({ type: Camera, tooltip: '目标摄像机。如果不填，将自动寻找场景主摄像机' })
    public targetCamera: Camera | null = null;

    @property({ tooltip: '是否锁定 Y 轴。勾选后，节点只在水平面内转动面向摄像机' })
    public lockY: boolean = false;

    @property({ type: Vec3, tooltip: '在正对摄像机的基础上，叠加的额外欧拉角偏移（例如 X:30）' })
    public offsetEuler: Vec3 = new Vec3(0, 0, 0);

    // 缓存计算变量，避免 Update 中频繁产生 GC
    private _targetPos: Vec3 = new Vec3();
    private _offsetQuat: Quat = new Quat();

    onLoad() {
        // 预计算偏移欧拉角对应的四元数
        Quat.fromEuler(this._offsetQuat, this.offsetEuler.x, this.offsetEuler.y, this.offsetEuler.z);
    }

    start() {
        // 如果未指定摄像机，默认抓取场景中的主摄像机
        if (!this.targetCamera) {
            const scene = director.getScene();
            if (scene) {
                this.targetCamera = scene.getComponentInChildren(Camera);
            }
        }
    }

    // 必须在 lateUpdate 中执行，确保此时摄像机的位置已经完成更新，避免画面抖动
    lateUpdate(dt: number) {
        if (!this.targetCamera || !this.targetCamera.node.isValid) return;

        // 获取摄像机的世界坐标
        this._targetPos.set(this.targetCamera.node.worldPosition);

        // 如果锁定 Y 轴，强制目标点的 Y 坐标与当前节点一致，抹平高度差
        if (this.lockY) {
            this._targetPos.y = this.node.worldPosition.y;
        }

        // 1. 让面片的 -Z 轴正对摄像机
        this.node.lookAt(this._targetPos);

        // 2. 如果存在额外角度偏移（如 30 度），在 lookAt 的基础上进行四元数叠加
        if (this.offsetEuler.lengthSqr() > 0) {
            const currentQuat = this.node.worldRotation;
            const newQuat = new Quat();
            // 四元数乘法：将基础朝向与偏移朝向合并
            Quat.multiply(newQuat, currentQuat, this._offsetQuat);
            this.node.setWorldRotation(newQuat);
        }
    }
}