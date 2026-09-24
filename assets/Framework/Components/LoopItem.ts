/**
 * LoopItem.ts
 */

import { _decorator, Component, Label } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('LoopItem')
export class LoopItem extends Component {

    @property(Label)
    label: Label = null;

    public updateItem(data: any, index: number) {

        this.label.string = `${index} - ${data}`;
    }
}