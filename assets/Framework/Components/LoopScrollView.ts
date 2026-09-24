/**
 * LoopScrollView.ts (网格增强版 - 极致优化版)
 * 作用：支持多列网格的高性能虚拟列表，已修复边界回弹、GC卡顿及锚点错乱问题
 */
import { _decorator, Component, ScrollView, Node, Prefab, instantiate, UITransform, Vec3, Vec2 } from 'cc';
const { ccclass, property } = _decorator;

export interface ILoopItem {
    updateItem(data: any, index: number): void;
}

@ccclass('LoopScrollView')
export class LoopScrollView extends Component {
    @property(ScrollView)
    scrollView: ScrollView = null;

    @property(Prefab)
    itemPrefab: Prefab = null;

    @property({ tooltip: "列数 (如3代表每行3个)" })
    columnCount: number = 3;

    @property({ tooltip: "单个格子宽度" })
    itemWidth: number = 200;

    @property({ tooltip: "单个格子高度" })
    itemHeight: number = 200;

    @property({ tooltip: "横向间距" })
    spacingX: number = 10;

    @property({ tooltip: "纵向间距" })
    spacingY: number = 10;

    @property({ tooltip: "视口外缓冲行数（防快速滑动白屏）" })
    buffer: number = 2;

    private _dataList: any[] = [];
    private _itemPool: Node[] = [];
    private _items: Map<number, Node> = new Map();
    private _content: Node = null;
    private _visibleRowCount: number = 0;

    protected onLoad() {
        if (!this.scrollView) {
            console.error("LoopScrollView: 未绑定 ScrollView 组件！");
            return;
        }
        this._content = this.scrollView.content;

        // 🌟 核心优化 1：强制规范 Content 锚点为 Top-Center (0.5, 1)
        // 保证无论编辑器里怎么乱改，代码运行时的坐标系绝对正确
        const contentTrans = this._content.getComponent(UITransform);
        if (contentTrans) {
            contentTrans.setAnchorPoint(0.5, 1);
        }

        this.scrollView.node.on('scrolling', this._onScroll, this);
    }

    public setData(dataList: any[]) {
        this._dataList = dataList || [];

        // 🔴 修复：确保组件处于激活状态才注册定时器
        if (!this.node || !this.node.isValid || !this.node.active) {
            console.warn('[LoopScrollView] 组件未激活，延迟设置数据');
            return;
        }

        this.scheduleOnce(() => {
            if (!this.node || !this.node.isValid) return; // 二次确认

            if (this.scrollView && this.scrollView.isValid) {
                this.scrollView.stopAutoScroll();
                this.scrollView.scrollToOffset(new Vec2(0, 0), 0);
            }
            this._reset();
            this._calculateVisibleCount();
            this._preAllocatePool();
            this._updateContentSize();
            this._onScroll();
        });
    }

    /** 计算可见的“行数” */
    private _calculateVisibleCount() {
        const viewTrans = this.scrollView.node.getComponent(UITransform);
        const viewHeight = viewTrans.height;
        const rowTotalHeight = this.itemHeight + this.spacingY;

        // 算出屏幕能放下几行，再多加 buffer 行防闪烁
        this._visibleRowCount = Math.ceil(viewHeight / rowTotalHeight) + this.buffer;
    }

    /** 🌟 核心优化 2 具体实现：根据最大可见数量，一次性把节点造好放入池子 */
    private _preAllocatePool() {
        const maxNeededCount = this._visibleRowCount * this.columnCount;
        const currentTotal = this._items.size + this._itemPool.length;

        const needToCreate = maxNeededCount - currentTotal;
        for (let i = 0; i < needToCreate; i++) {
            let item = instantiate(this.itemPrefab);
            // 预先挂载到 content 下但隐藏，避免后续 setParent 带来高昂的重排开销
            item.setParent(this._content);
            item.active = false;
            this._itemPool.push(item);
        }
    }

    private _updateContentSize() {
        const rowCount = Math.ceil(this._dataList.length / this.columnCount);
        const totalHeight = rowCount * (this.itemHeight + this.spacingY);
        const trans = this._content.getComponent(UITransform);

        // 宽度保持不变，高度根据数据量动态撑开
        trans.setContentSize(trans.width, totalHeight);
    }

    private _onScroll() {
        if (this._dataList.length === 0) return;

        let offsetY = this.scrollView.getScrollOffset().y;

        // 🌟 核心优化 3：防止 iOS/微信的“橡皮筋回弹”导致 offsetY 为负数，进而算出负数索引
        offsetY = Math.max(0, offsetY);

        const rowTotalHeight = this.itemHeight + this.spacingY;

        // 当前滚到了第几行
        const startRow = Math.floor(offsetY / rowTotalHeight);
        const endRow = startRow + this._visibleRowCount;

        // 计算需要显示的起始和结束索引
        const startIndex = startRow * this.columnCount;
        const endIndex = (endRow + 1) * this.columnCount - 1;

        // 1. 回收超出的节点
        this._items.forEach((node, index) => {
            if (index < startIndex || index > endIndex) {
                this._recycleItem(index);
            }
        });

        // 2. 生成/复用需要的节点
        for (let i = startIndex; i <= endIndex; i++) {
            if (i >= this._dataList.length) break; // 超过总数据长度则停止渲染

            if (!this._items.has(i)) {
                this._createItem(i);
            }
        }
    }

    private _createItem(index: number) {
        let item = this._itemPool.pop();
        if (!item) {
            // 理论上预分配池子后绝不会走到这里，加一层安全兜底防报错
            item = instantiate(this.itemPrefab);
            item.setParent(this._content);
        }

        item.active = true;

        // 🌟 核心坐标算法
        const row = Math.floor(index / this.columnCount); // 行号
        const col = index % this.columnCount;          // 列号

        const contentWidth = this._content.getComponent(UITransform).width;

        // X坐标：使整体在 Content 中水平居中
        const startX = -contentWidth / 2 + this.itemWidth / 2;
        const x = startX + col * (this.itemWidth + this.spacingX);

        // Y坐标：因为 AnchorY=1，所以 Y 都是负数往下排布，减去 half height 让锚点居中
        const y = -row * (this.itemHeight + this.spacingY) - this.itemHeight / 2;

        item.setPosition(new Vec3(x, y, 0));
        this._items.set(index, item);

        // 获取脚本组件并推入数据
        const components = item.components;
        for (let i = 0; i < components.length; i++) {
            const comp = components[i] as unknown as ILoopItem;
            if (typeof comp.updateItem === 'function') {
                comp.updateItem(this._dataList[index], index);
                break;
            }
        }
    }

    private _recycleItem(index: number) {
        const item = this._items.get(index);
        if (!item) return;

        // 🌟 性能优化：直接隐藏 (active = false) 而不是 removeFromParent()
        // 这在 Cocos Creator 里能省下大量的节点树遍历耗时
        item.active = false;
        this._itemPool.push(item);
        this._items.delete(index);
    }

    private _reset() {
        this._items.forEach((item) => {
            item.active = false;
            this._itemPool.push(item);
        });
        this._items.clear();
    }

    /**
     * 🌟 核心架构增补：原位刷新当前所有可见节点的数据
     * 绝对不干扰物理排版、绝对不重置滚动条！
     */
    public refreshAllItems() {
        this._items.forEach((itemNode, index) => {
            if (index >= 0 && index < this._dataList.length) {
                const components = itemNode.components;
                for (let i = 0; i < components.length; i++) {
                    const comp = components[i] as unknown as ILoopItem;
                    if (typeof comp.updateItem === 'function') {
                        comp.updateItem(this._dataList[index], index);
                        break;
                    }
                }
            }
        });
    }
}