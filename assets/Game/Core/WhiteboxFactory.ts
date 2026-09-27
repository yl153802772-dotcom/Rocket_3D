import { Color, Material, MeshRenderer, Node, primitives, utils } from 'cc';

/**
 * 白膜基础几何体工厂：程序化创建胶囊/球体，避免在场景里硬编码网格。
 */
export class WhiteboxFactory {
    public static createCapsule(name: string, color: Color = new Color(220, 220, 220, 255)): Node {
        const node = new Node(name);
        const mesh = utils.createMesh(primitives.capsule(0.4, 0.4, 1.2));
        const renderer = node.addComponent(MeshRenderer);
        renderer.mesh = mesh;
        renderer.material = this.createUnlit(color);
        return node;
    }

    public static createSphere(name: string, radius: number = 1, color: Color = new Color(150, 150, 150, 255)): Node {
        const node = new Node(name);
        const mesh = utils.createMesh(primitives.sphere(radius));
        const renderer = node.addComponent(MeshRenderer);
        renderer.mesh = mesh;
        renderer.material = this.createUnlit(color);
        return node;
    }

    private static createUnlit(color: Color): Material {
        const mat = new Material();
        mat.initialize({ effectName: 'builtin-unlit' });
        mat.setProperty('mainColor', color);
        return mat;
    }
}
