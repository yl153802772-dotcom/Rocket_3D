/**
 * @module GuideUI
 * @description
 * [模块逻辑]
 * 通用新手引导 UI 层。
 * 本次重构彻底修复了图集解析报错，并将所有硬编码的美术资源路径和动画参数改为由业务层 Config 动态注入，
 * 使其成为一个 100% 与具体 Game 业务脱钩的 Core 层纯表现组件。
 */
import { _decorator, Label, Node, UITransform, Rect, tween, Vec3, Widget, Sprite, SpriteFrame, Tween, Button, SpriteAtlas } from 'cc';
import { UIBase } from '../../Components/UIBase';
import { GuideMask } from './GuideMask';
import { Logger, LogModule } from '../../Core/Logger';
import { GuideManager } from "db://assets/Framework/Utils/Guid/GuideManager";
import { DataCenter } from "db://assets/Framework/Data/DataCenter";
import { DataKey, EventName, ToastType } from "db://assets/Framework/Core/GameConst";
import { EventCenter } from "db://assets/Framework/Data/EventCenter";

const { ccclass, property } = _decorator;

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
    }

    private onSkipGuideClick(): void {
        Logger.info(LogModule.UIBase, "玩家点击跳过新手引导");

        GuideManager.Instance.stopAll();
        DataCenter.Instance.set(DataKey.IS_GUIDE_COMPLETED, true);
        //DataCenter.Instance.clearAllPauseLocks();

        if (GuideUI.skipDelegate) {
            GuideUI.skipDelegate.onGuideSkipped();
        } else {
            Logger.warn(LogModule.UIBase, "未注册 skipDelegate，跳过引导时将不会触发游戏业务层状态改变");
        }

        EventCenter.emit(EventName.SHOW_TOAST, { msg: "已跳过新手引导", type: ToastType.WARNING });
        this.closeSelf();
    }

    private async loadGuideAtlas(): Promise<void> {
        const atlasPath = this._cfg?.atlasPath || "texture/common/atlas_guide";
        const bundleName = this._cfg?.bundleName || "ui";

        const atlas = await this.loadAsset<SpriteAtlas>(atlasPath, SpriteAtlas, bundleName);
        if (!atlas || !atlas.isValid) {
            Logger.warn(LogModule.UIBase, `引导图集加载失败或已失效: ${atlasPath}`);
            return;
        }

        this._clickFrames = [];
        const clickPrefix = this._cfg?.clickPrefix || 'guide_click_';
        const clickCount = this._cfg?.clickCount || 8;
        for (let i = 1; i <= clickCount; i++) {
            const frameName = `${clickPrefix}${i < 10 ? '0' + i : i}`;
            const frame = atlas.getSpriteFrame(frameName);
            if (frame) this._clickFrames.push(frame);
        }

        this._dragFrames = [];
        const dragPrefix = this._cfg?.dragPrefix || 'guide_drag_';
        const dragCount = this._cfg?.dragCount || 4;
        for (let i = 1; i <= dragCount; i++) {
            const frameName = `${dragPrefix}${i < 10 ? '0' + i : i}`;
            const frame = atlas.getSpriteFrame(frameName);
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

        this.loadGuideAtlas().then(() => {
            // ✅ 修复 TS2554: UIBase 的 doOnce 默认使用 TimerGroup.UI，只需传 2 个参数
            this.doOnce(0.25, () => {
                if (!this.node || !this.node.isValid) return;

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
            });
        });
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