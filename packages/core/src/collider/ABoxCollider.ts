import { Vector3 } from "@oasis-engine/math";
import { Entity } from "../Entity";
import { Collider } from "./Collider";

/**
 * 轴对齐的包围盒（AABBox）碰撞体组件
 * @extends Collider
 */
export class ABoxCollider extends Collider {
  private static _tempVec3: Vector3 = new Vector3();

  public boxMin: Vector3;
  public boxMax: Vector3;
  private _corners: Array<Vector3> = [];
  private _cornerFlag: boolean = false;

  /**
   * 构造函数
   * @param {Entity} entity 对象所在节点
   */
  constructor(entity: Entity) {
    super(entity);
    this.boxMin = new Vector3(-0.5, -0.5, -0.5);
    this.boxMax = new Vector3(0.5, 0.5, 0.5);
  }

  /**
   * 使用范围坐标，设置包围盒
   * @param {Vector3} min 最小坐标
   * @param {Vector3} max 最大坐标
   */
  setBoxMinMax(min: Vector3, max: Vector3) {
    this.boxMin = min;
    this.boxMax = max;

    this._cornerFlag = true;
  }

  /**
   * 使用中心点和Size的方式设置包围盒
   * @param {Vector3} center 包围盒的中心点
   * @param {Vector3} size 包围盒的3个轴向的大小
   */
  setBoxCenterSize(center: Vector3, size: Vector3) {
    const halfSize = ABoxCollider._tempVec3;
    Vector3.scale(size, 0.5, halfSize);
    Vector3.add(center, halfSize, this.boxMax);
    Vector3.subtract(center, halfSize, this.boxMin);

    this._cornerFlag = true;
  }

  /**
   * 取得八个顶点的位置
   */
  getCorners(): Vector3[] {
    if (this._cornerFlag) {
      const minX = this.boxMin.x;
      const minY = this.boxMin.y;
      const minZ = this.boxMin.z;
      const w = this.boxMax.x - minX;
      const h = this.boxMax.y - minY;
      const d = this.boxMax.z - minZ;

      if (this._corners.length === 0) {
        for (let i = 0; i < 8; ++i) {
          this._corners.push(new Vector3());
        }
      }

      this._corners[0].setValue(minX + w, minY + h, minZ + d);
      this._corners[1].setValue(minX, minY + h, minZ + d);
      this._corners[2].setValue(minX, minY, minZ + d);
      this._corners[3].setValue(minX + w, minY, minZ + d);
      this._corners[4].setValue(minX + w, minY + h, minZ);
      this._corners[5].setValue(minX, minY + h, minZ);
      this._corners[6].setValue(minX, minY, minZ);
      this._corners[7].setValue(minX + w, minY, minZ);

      this._cornerFlag = false;
    }

    return this._corners;
  }
}
