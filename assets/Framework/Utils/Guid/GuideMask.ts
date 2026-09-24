import { _decorator, Component, Node, UITransform, BlockInputEvents, Graphics, Color, Vec3, Rect } from 'cc';
const { ccclass, requireComponent } = _decorator;

@ccclass('GuideMask')
@requireComponent(Graphics)
export class GuideMask extends Component {

    private _graphics: Graphics = null;
    private _targetNodes: Node[] = [];
    private _padding: number = 10;

    // 🌟 核心：4 个物理阻挡节点（上、下、左、右）
    private _blockers: Node[] = [];

    onLoad() {
        this._graphics = this.getComponent(Graphics);

        // 1. 废弃一切事件接管，剥夺自身的阻挡能力
        const blockEvent = this.getComponent(BlockInputEvents);
        if (blockEvent) blockEvent.enabled = false;

        // 2. 将自身尺寸设为 0，防止自身吞噬点击
        const uiTrans = this.getComponent(UITransform);
        if (uiTrans) uiTrans.setContentSize(0, 0);

        // 3. 生成 4 个物理阻挡块
        for (let i = 0; i < 4; i++) {
            const blocker = new Node(`Blocker_${i}`);
            const trans = blocker.addComponent(UITransform);
            trans.setAnchorPoint(0.5, 0.5);
            blocker.addComponent(BlockInputEvents); // 挂载原生阻挡组件
            blocker.setParent(this.node);
            this._blockers.push(blocker);
        }
    }

    public focusOn(targets: Node[], padding: number = 10): Rect {
        this._targetNodes = targets;
        this._padding = padding;
        return this.drawMask();
    }

    private drawMask(): Rect {
        if (!this._graphics || !this._targetNodes || this._targetNodes.length === 0) return new Rect(0,0,0,0);
        const myTrans = this.node.getComponent(UITransform);
        if (!myTrans) return new Rect(0,0,0,0);

        this._graphics.clear();
        let unionWorldRect: Rect | null = null;

        // 1. 计算所有目标的最大并集包围盒
        for (const target of this._targetNodes) {
            if (!target || !target.isValid) continue;
            target.updateWorldTransform();

            let worldRect: Rect;
            const targetTrans = target.getComponent(UITransform);
            if (targetTrans) {
                worldRect = targetTrans.getBoundingBoxToWorld();
                // 给可点击的“洞”加一点容错空间
                worldRect.x -= 10;
                worldRect.y -= 10;
                worldRect.width += 20;
                worldRect.height += 20;
            } else {
                const pos = target.worldPosition;
                worldRect = new Rect(pos.x - 50, pos.y - 50, 100, 100);
            }

            if (!unionWorldRect) {
                unionWorldRect = worldRect.clone();
            } else {
                Rect.union(unionWorldRect, unionWorldRect, worldRect);
            }
        }

        if (!unionWorldRect) return new Rect(0,0,0,0);

        // 2. 计算本地挖孔坐标
        let realWidth = unionWorldRect.width + this._padding * 2;
        let realHeight = unionWorldRect.height + this._padding * 2;
        const targetWorldCenter = new Vec3(unionWorldRect.x + unionWorldRect.width / 2, unionWorldRect.y + unionWorldRect.height / 2, 0);

        const localCenter = myTrans.convertToNodeSpaceAR(targetWorldCenter);
        const left = localCenter.x - realWidth / 2;
        const right = localCenter.x + realWidth / 2;
        const bottom = localCenter.y - realHeight / 2;
        const top = localCenter.y + realHeight / 2;

        // 3. 视觉绘制（黑底挖孔）
        this._graphics.fillColor = new Color(0, 0, 0, 200);
        const huge = 4000;

        this._graphics.rect(-huge, top, huge * 2, huge);
        this._graphics.rect(-huge, -huge, huge * 2, bottom - (-huge));
        this._graphics.rect(-huge, bottom, left - (-huge), top - bottom);
        this._graphics.rect(right, bottom, huge - right, top - bottom);
        this._graphics.fill();

        // 🌟 4. 终极物理防御：用 4 个真实的 Node 填满黑底区域！
        // 这样不仅完美隔绝穿透，而且由于中间挖孔区域是绝对的“真空”，你的 DragSystem 拖拽逻辑将 100% 不受影响！

        // 顶部阻挡块
        this._setupBlocker(this._blockers[0], 0, top + huge/2, huge * 2, huge);
        // 底部阻挡块
        this._setupBlocker(this._blockers[1], 0, bottom - huge/2, huge * 2, huge);
        // 左侧阻挡块
        this._setupBlocker(this._blockers[2], left - huge/2, (top + bottom)/2, huge, top - bottom);
        // 右侧阻挡块
        this._setupBlocker(this._blockers[3], right + huge/2, (top + bottom)/2, huge, top - bottom);

        return new Rect(left, bottom, realWidth, realHeight);
    }

    private _setupBlocker(blocker: Node, x: number, y: number, w: number, h: number) {
        if (!blocker) return;
        blocker.active = true;
        blocker.setPosition(x, y, 0);
        const trans = blocker.getComponent(UITransform);
        if (trans) trans.setContentSize(w, h);
    }

    public removeMask(): void {
        if (this._graphics) this._graphics.clear();
        this._targetNodes = [];
        for (const b of this._blockers) {
            b.active = false;
        }
    }
}