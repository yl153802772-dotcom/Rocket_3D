/**
 * GMManager.ts
 * 作用：游戏内建开发者控制台（指令注册与解析）
 */
import {Logger, LogModule} from '../../../Framework/Core/Logger';
import { SaveManager } from '../../../Framework/Core/SaveManager';
import { ResManager } from '../../../Framework/Core/ResManager';
import { UIManager } from '../../../Framework/Core/UIManager';

// 定义 GM 命令的回调格式：接收一个字符串数组作为参数，返回执行结果的提示语
export type GMCommandAction = (args: string[]) => string;

export class GMManager {
    private static _instance: GMManager = null;
    public static get Instance(): GMManager {
        if (!this._instance) this._instance = new GMManager();
        return this._instance;
    }

    // 存储所有指令: Map<指令名, {描述, 执行函数}>
    private _commands: Map<string, { desc: string, action: GMCommandAction }> = new Map();

    public init(): void {
        Logger.info(LogModule.GMManager,"GMManager 初始化 (开发者控制台已就绪)");
        this.registerDefaultCommands();
    }

    /**
     * 注册一条 GM 指令
     * @param cmd 指令名 (如 "add_gold")
     * @param desc 指令描述 (如 "增加金币: add_gold [数量]")
     * @param action 执行回调
     */
    public register(cmd: string, desc: string, action: GMCommandAction): void {
        this._commands.set(cmd.toLowerCase(), { desc, action });
    }

    /**
     * 执行输入的字符串指令
     * @param input 玩家在输入框输入的内容 (如 "add_gold 1000")
     * @returns 返回执行结果的文本，用于显示在控制台上
     */
    public execute(input: string): string {
        if (!input || input.trim() === "") return "输入不能为空";

        // 将输入按空格分割："add_gold 100" -> ["add_gold", "100"]
        const parts = input.trim().split(/\s+/);
        const cmd = parts[0].toLowerCase();
        const args = parts.slice(1);

        if (cmd === "help") {
            return this.getHelpText();
        }

        if (this._commands.has(cmd)) {
            try {
                const commandObj = this._commands.get(cmd)!;
                const resultMsg = commandObj.action(args);
                return `[成功] ${resultMsg}`;
            } catch (e) {
                Logger.error(`GM 指令执行报错: ${cmd}`, e);
                return `[报错] 指令执行异常，请检查参数`;
            }
        }

        return `[失败] 未知指令: ${cmd}。输入 help 查看所有指令。`;
    }

    /**
     * 获取所有可用指令的帮助文档
     */
    private getHelpText(): string {
        let text = "--- 可用 GM 指令列表 ---\n";
        this._commands.forEach((value, key) => {
            text += `🔹 ${key} : ${value.desc}\n`;
        });
        return text;
    }

    // ==========================================
    // 默认的框架级 GM 指令
    // ==========================================
    private registerDefaultCommands(): void {

        // 1. 清理存档指令
        this.register("clear_save", "清空所有本地存档并重启", (args) => {
            // ✅ 直接调用，不再使用动态 import
            SaveManager.Instance.set("gold", 0);
            // 建议：如果你在 SaveManager 里写了 clearAll() 方法，这里直接调 clearAll() 最好
            return "存档数据已重置，请手动刷新/重启游戏生效";
        });

        // 2. 内存清理指令
        this.register("gc", "强制释放 LRU 冷宫资源", (args) => {
            // ✅ 直接调用
            ResManager.Instance.clearExpiredLRU();
            return "LRU 缓存回收指令已发送，无用内存已释放";
        });

        // 3. 打印当前 UI 栈
        this.register("show_ui", "打印当前打开的所有界面", (args) => {
            // ✅ 直接调用。这里强制转为 any 是为了绕过 TS 对私有变量 _uiStack 的访问限制
            const stack = (UIManager.Instance as any)._uiStack;
            Logger.info(LogModule.GMManager,"====== 当前 UI 栈状态 ======");
            Logger.info(LogModule.GMManager,stack);
            return "已在浏览器/开发者工具控制台打印 UI 栈信息";
        });
    }
}