/**
 * @module GuideUI
 * @description
 * [模块逻辑]
 * 核心的新手引导 UI 层，负责镂空遮罩、高亮目标节点、播放点击/拖拽的手势动画。
 *
 * [调用规则]
 * 1. 作为 Core 层纯表现 UI，严格禁止 import 业务层逻辑（如 WaveSystem, BattleManager 等）。
 * 2. 玩家点击“跳过引导”时的特定业务逻辑（如切换波次状态），必须由 Game 层实现 IGuideSkipDelegate 并注入 delegate 属性。
 * 3. 传入的 targetNodes 必须确保已被正确实例化且在屏幕可见范围内。
 */
import { _decorator, Label, Node, UITransform, Rect, tween, Vec3, Widget, Sprite, SpriteFrame, Tween, Button } from 'cc';
import { UIBase } from '../../Components/UIBase';
import { GuideMask } from './GuideMask';
import { ResManager } from '../../Core/ResManager';
import { SpriteAtlas } from 'cc';
import { Logger, LogModule } from '../../Core/Logger';
import { GuideManager } from "db://assets/Framework/Utils/Guid/GuideManager";
import { DataCenter } from "db://assets/Framework/Data/DataCenter";
import { DataKey, EventName, ToastType } from "db://assets/Framework/Core/GameConst";
import { EventCenter } from "db://assets/Framework/Data/EventCenter";

const { ccclass, property } = _decorator;

// 🌟 新增：由业务层（Game）实现并注入，解耦 WaveSystem 依赖
export interface IGuideSkipDelegate {
    onGuideSkipped(): void;
}

@ccclass('GuideUI')
export class GuideUI extends UIBase {
    @property(GuideMask) mask: GuideMask = null;
    @property(Node) promptContent: Node = null;
    @property(Label) tipLabel: Label = null;
    @property(Node) pointerAnim: Node = null;
    @property(Button) skipBtn: Button = null;

    // 🌟 新增：静态委托，供业务层注册
    public static skipDelegate: IGuideSkipDelegate = null;

    private _targetNodes: Node[] = [];
    private _cfg: any = null;

    private _clickFrames: SpriteFrame[] = [];
    private _dragFrames: SpriteFrame[] = [];
    private _pointerSprite: Sprite = null;

    private _curFrameIndex: number = 0;
    private _frameTimer: number = 0;
    private _curPlayFrames: SpriteFrame[] = [];
    private _frameInterval: number = 0.1;

    public async onInit() {
        super.onInit();
        if (this.pointerAnim) {
            this._pointerSprite = this.pointerAnim.getComponent(Sprite) || this.pointerAnim.addComponent(Sprite);
        }

        if (this.skipBtn) {
            this.skipBtn.node.on(Button.EventType.CLICK, this.onSkipGuideClick, this);
        }
        await this.loadGuideAtlas();
    }

    private onSkipGuideClick(): void {
        Logger.info(LogModule.UIBase, "玩家点击跳过新手引导");

        // 1. 停止整个引导系统内部状态
        GuideManager.Instance.stopAll();

        // 2. 将数据中心里的完成标记设为 true，防止后续波次重发
        DataCenter.Instance.set(DataKey.IS_GUIDE_COMPLETED, true);

        // 3. 强行解除因新手引导挂载的所有战术暂停锁
        DataCenter.Instance.clearAllPauseLocks();

        // 4. 🌟 呼叫业务层委托代理，执行具体的战斗启动/波次切换逻辑
        if (GuideUI.skipDelegate) {
            GuideUI.skipDelegate.onGuideSkipped();
        } else {
            Logger.warn(LogModule.UIBase, "未注册 skipDelegate，跳过引导时将不会触发游戏业务层状态改变");
        }

        // 5. 飘字提示玩家
        EventCenter.emit(EventName.SHOW_TOAST, { msg: "已跳过新手引导", type: ToastType.WARNING });

        // 6. 关闭当前 GuideUI 面板
        this.closeSelf();
    }

    private async loadGuideAtlas(): Promise<void> {
        const atlasPath = "texture/common/atlas_guide";
        const bundleName = "ui";
        await this.loadAsset(atlasPath, SpriteAtlas, bundleName);

        this._clickFrames = [];
        for (let i = 1; i <= 8; i++) {
            const frameName = `guide_click_${i < 10 ? '0' + i : i}`;
            const frame = ResManager.Instance.getSpriteFrameFromAtlas(atlasPath, frameName, bundleName);
            if (frame) this._clickFrames.push(frame);
        }

        this._dragFrames = [];
        for (let i = 1; i <= 4; i++) {
            const frameName = `guide_drag_${i < 10 ? '0' + i : i}`;
            const frame = ResManager.Instance.getSpriteFrameFromAtlas(atlasPath, frameName, bundleName);
            if (frame) this._dragFrames.push(frame);
        }
    }

    protected playOpenAnim(): void {
        this.node.setScale(new Vec3(1, 1, 1));
        if (this._opacity) this._opacity.opacity = 255;
    }

    public onShow(data: { targetNodes: Node[], config: any }): void {
        super.onShow(data);
        this._targetNodes = data.targetNodes;
        this._cfg = data.config;

        if (this.pointerAnim) {
            Tween.stopAllByTarget(this.pointerAnim);
            this.pointerAnim.active = false;
        }
        if (this.promptContent) this.promptContent.active = false;
        this._curPlayFrames = [];

        if (!this._targetNodes || this._targetNodes.length === 0 || !this._cfg) return;

        this.scheduleOnce(() => {
            const widget = this.node.getComponent(Widget);
            if (widget) widget.updateAlignment();
            this.node.updateWorldTransform();

            const holeLocalRect = this.mask.focusOn(this._targetNodes, this._cfg.maskPadding || 20);
            if (this.tipLabel) {
                this.tipLabel.string = this._cfg.tipText || "";
            }

            this.layoutPrompt(holeLocalRect);
            this.playPointerAnim(holeLocalRect, this._cfg.animType);

            if (this.promptContent && !!this._cfg.tipText && this._cfg.tipText.trim().length > 0) {
                this.promptContent.active = true;
            }
        }, 0.25);
    }

    private layoutPrompt(holeRect: Rect) {
        if (!this.promptContent) return;
        const uiTrans = this.node.getComponent(UITransform);
        if (!uiTrans) return;
        const screenHalfHeight = uiTrans.contentSize.height / 2;
        const promptTrans = this.promptContent.getComponent(UITransform);
        const promptHalfHeight = promptTrans ? promptTrans.contentSize.height / 2 : 100;
        const centerY = holeRect.y + holeRect.height / 2;
        const offset = holeRect.height / 2 + promptHalfHeight + 50;
        let targetY = centerY < 0 ? (centerY + offset) : (centerY - offset);
        const promptTopEdge = targetY + promptHalfHeight;
        const promptBottomEdge = targetY - promptHalfHeight;

        if (promptTopEdge > screenHalfHeight) {
            targetY = screenHalfHeight - promptHalfHeight - 20;
        } else if (promptBottomEdge < -screenHalfHeight) {
            targetY = -screenHalfHeight + promptHalfHeight + 20;
        }
        this.promptContent.setPosition(0, targetY, 0);
    }

    private playPointerAnim(holeRect: Rect, animType: string) {
        if (!this.pointerAnim || !this._pointerSprite) return;

        Tween.stopAllByTarget(this.pointerAnim);
        this.pointerAnim.setScale(new Vec3(1, 1, 1));
        this.pointerAnim.active = true;

        const myTrans = this.node.getComponent(UITransform);
        if (!myTrans) return;

        const getAnchorWorldPos = (node: Node): Vec3 => {
            node.updateWorldTransform();
            const trans = node.getComponent(UITransform);
            return trans ? trans.convertToWorldSpaceAR(Vec3.ZERO) : node.worldPosition.clone();
        };

        if (animType === "drag" && this._targetNodes.length >= 2) {
            this._curPlayFrames = this._dragFrames;
            this._curFrameIndex = 0;
            this._frameTimer = 0;
            this._frameInterval = 0.20;

            const startNode = this._targetNodes[0];
            const endNode = this._targetNodes[this._targetNodes.length - 1];
            const startLocal = myTrans.convertToNodeSpaceAR(getAnchorWorldPos(startNode));
            const endLocal = myTrans.convertToNodeSpaceAR(getAnchorWorldPos(endNode));

            this.pointerAnim.setPosition(startLocal);
            if (this._dragFrames.length > 0) {
                this._pointerSprite.spriteFrame = this._dragFrames[0];
            }

            tween(this.pointerAnim)
                .to(0.85, { position: endLocal }, { easing: 'quadOut' })
                .delay(0.3)
                .call(() => {
                    this._curFrameIndex = 0;
                    this._frameTimer = 0;
                    if (this._dragFrames.length > 0 && this._pointerSprite) {
                        this._pointerSprite.spriteFrame = this._dragFrames[0];
                    }
                })
                .set({ position: startLocal })
                .union()
                .repeatForever()
                .start();
        } else {
            this._curPlayFrames = this._clickFrames;
            this._curFrameIndex = 0;
            this._frameTimer = 0;
            this._frameInterval = 0.15;

            const centerX = holeRect.x + holeRect.width / 2;
            const centerY = holeRect.y + holeRect.height / 2;

            this.pointerAnim.setPosition(centerX + 20, centerY - 20, 0);
            if (this._clickFrames.length > 0) {
                this._pointerSprite.spriteFrame = this._clickFrames[0];
            }
        }
    }

    protected update(dt: number) {
        if (!this.pointerAnim || !this.pointerAnim.active || !this._curPlayFrames || this._curPlayFrames.length === 0) return;

        this._frameTimer += dt;
        if (this._frameTimer >= this._frameInterval) {
            this._frameTimer -= this._frameInterval;

            if (this._cfg && this._cfg.animType === "drag") {
                if (this._curFrameIndex < this._curPlayFrames.length - 1) {
                    this._curFrameIndex++;
                }
            } else {
                this._curFrameIndex = (this._curFrameIndex + 1) % this._curPlayFrames.length;
            }

            if (this._pointerSprite && this._curPlayFrames[this._curFrameIndex]) {
                this._pointerSprite.spriteFrame = this._curPlayFrames[this._curFrameIndex];
            }
        }
    }

    public onDestroyUI() {
        super.onDestroyUI();
        if (this.pointerAnim) {
            Tween.stopAllByTarget(this.pointerAnim);
        }
        this._curPlayFrames = [];
        if (this.skipBtn) {
            this.skipBtn.node.off(Button.EventType.CLICK, this.onSkipGuideClick, this);
        }
    }
}