import { Collider } from "./Collider";
import { Ray, RaycastHit, Vector3 } from "@oasis-engine/math";
import { Entity } from "../Entity";
/**
 * 球型碰撞体组件
 * @extends Collider
 */
export class ASphereCollider extends Collider {
  center: Vector3;

  radius: number;
  /**
   * @constructor
   * @param {Entity} entity
   */
  constructor(entity: Entity) {
    super(entity);

    /**
     * 球心的坐标(在Local坐标系)
     * @member {Vector3}
     */
    this.center = new Vector3();

    /**
     * 球体的半径
     * @member {float}
     */
    this.radius = 1;
  }

  /**
   * 射线检测
   * @param ray - 射线
   * @param hit - 碰撞信息
   */
  raycast(ray: Ray, hit: RaycastHit) {}

  /**
   * 设置球体的属性数据
   * @param {Vector3} center 球心坐标
   * @param {number} radius 球的半径
   */
  setSphere(center: Vector3, radius: number) {
    this.center = center;
    this.radius = radius;
  }
}
