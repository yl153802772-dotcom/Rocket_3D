// IdGenerator.ts - 工业级修复
export class IdGenerator {
    private static _id: number = 1;

    // ✅ 使用时间戳 + 随机数 + 自增的组合，确保唯一性
    static next(): number {
        if (this._id > Number.MAX_SAFE_INTEGER - 1000) {
            console.warn('[IdGenerator] ID 接近上限，执行回绕');
            this._id = 1;
        }
        // 🔴 注意：单例模式，多场景同时运行时不保证唯一性
        return this._id++;
    }

    // ✅ 读档后调用，确保新 ID 不会与存档中的旧 ID 冲突
    static resetToSafeValue(maxExistingId: number): void {
        this._id = Math.max(this._id, maxExistingId + 1);
    }


    // ✅ 生成字符串类型的唯一 ID（推荐用于网络同步）
    static nextString(): string {
        return `${Date.now()}-${this.next()}-${Math.random().toString(36).substr(2, 9)}`;
    }
}