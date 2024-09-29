import { Matrix, Plane, Ray, Vector3, Vector4 } from "@galacean/engine-math";
import { DependentMode, dependentComponents } from "../ComponentsDependencies";
import { Entity, EntityModifyFlags } from "../Entity";
import { PrimitiveChunkManager } from "../RenderPipeline/PrimitiveChunkManager";
import { RenderContext } from "../RenderPipeline/RenderContext";
import { SubPrimitiveChunk } from "../RenderPipeline/SubPrimitiveChunk";
import { Renderer } from "../Renderer";
import { TransformModifyFlags } from "../Transform";
import { ignoreClone } from "../clone/CloneManager";
import { ComponentType } from "../enums/ComponentType";
import { HitResult } from "../physics";
import { ShaderProperty } from "../shader";
import { ShaderMacroCollection } from "../shader/ShaderMacroCollection";
import { CanvasGroup } from "./CanvasGroup";
import { UICanvas } from "./UICanvas";
import { UITransform } from "./UITransform";

@dependentComponents(UITransform, DependentMode.AutoAdd)
export class UIRenderer extends Renderer {
  /** @internal */
  static _tempVec30: Vector3 = new Vector3();
  /** @internal */
  static _tempVec31: Vector3 = new Vector3();
  /** @internal */
  static _tempMat: Matrix = new Matrix();
  /** @internal */
  static _tempPlane: Plane = new Plane();
  /** @internal */
  static _textureProperty: ShaderProperty = ShaderProperty.getByName("renderer_UITexture");
  /** @internal */
  @ignoreClone
  _canvas: UICanvas;
  /** @internal */
  @ignoreClone
  _group: CanvasGroup;
  /** @internal */
  @ignoreClone
  _subChunk: SubPrimitiveChunk;

  protected _alpha: number = 1;
  protected _rayCastAble: boolean = true;
  protected _rayCastPadding: Vector4 = new Vector4(0, 0, 0, 0);

  private _uiCanvas: UICanvas[] = [];
  private _canvasGroup: CanvasGroup[] = [];

  get rayCastAble(): boolean {
    return this._rayCastAble;
  }

  set rayCastAble(value: boolean) {
    this._rayCastAble = value;
  }

  get rayCastPadding(): Vector4 {
    return this._rayCastPadding;
  }

  set rayCastPadding(value: Vector4) {
    if (this._rayCastPadding !== value) {
      this._rayCastPadding.copyFrom(value);
    }
  }

  /**
   * @internal
   */
  constructor(entity: Entity) {
    super(entity);
    this._componentType = ComponentType.UIRenderer;
    this._onEntityModify = this._onEntityModify.bind(this);
    this._findUICanvasAndCanvasGroup();
  }

  /**
   * @internal
   */
  override _updateTransformShaderData(context: RenderContext, onlyMVP: boolean, batched: boolean): void {
    //@todo: Always update world positions to buffer, should opt
    // super._updateTransformShaderData(context, onlyMVP, true);
    const worldMatrix = this.entity.transform.worldMatrix;
    if (onlyMVP) {
      this._updateProjectionRelatedShaderData(context, worldMatrix, true);
    } else {
      this._updateWorldViewRelatedShaderData(context, worldMatrix, true);
    }
  }

  /**
   * @internal
   */
  override _prepareRender(context: RenderContext): void {
    // Update once per frame per renderer, not influenced by batched
    if (this._renderFrameCount !== this.engine.time.frameCount) {
      this._update(context);
    }

    this._render(context);

    // union camera global macro and renderer macro.
    ShaderMacroCollection.unionCollection(
      context.camera._globalShaderMacro,
      this.shaderData._macroCollection,
      this._globalShaderMacro
    );
  }

  /**
   * @internal
   */
  override _onEnableInScene(): void {
    const componentsManager = this.scene._componentsManager;
    this._findUICanvasAndCanvasGroup();
    this._entity._registerModifyListener(this._onEntityModify);
    if (this._overrideUpdate) {
      componentsManager.addOnUpdateRenderers(this);
    }
  }

  /**
   * @internal
   */
  override _onDisableInScene(): void {
    const componentsManager = this.scene._componentsManager;
    this._clearUICanvasAndCanvasGroup();
    this._entity._removeModifyListener(this._onEntityModify);
    if (this._overrideUpdate) {
      componentsManager.removeOnUpdateRenderers(this);
    }
  }

  /**
   * @internal
   */
  _setGroup(group: CanvasGroup): void {
    this._group = group;
    const alpha = group ? group._globalAlpha : 1;
    if (this._alpha !== alpha) {
      this._alpha = alpha;
      this._dirtyUpdateFlag |= UIRendererUpdateFlags.Alpha;
    }
  }

  /**
   * @internal
   */
  _getChunkManager(): PrimitiveChunkManager {
    return this.engine._batcherManager.primitiveChunkManagerUI;
  }

  /** @internal */
  _raycast(ray: Ray, out: HitResult, distance: number = Number.MAX_SAFE_INTEGER): boolean {
    const entity = this._entity;
    const plane = UIRenderer._tempPlane;
    const transform = entity.transform;
    const normal = plane.normal.copyFrom(transform.worldForward);
    plane.distance = -Vector3.dot(normal, transform.worldPosition);
    ray.intersectPlane(plane);
    const curDistance = ray.intersectPlane(plane);
    if (curDistance >= 0 && curDistance < distance) {
      const hitPointWorld = ray.getPoint(curDistance, UIRenderer._tempVec30);
      const worldMatrixInv = UIRenderer._tempMat;
      Matrix.invert(this.entity.transform.worldMatrix, worldMatrixInv);
      const hitPointLocal = UIRenderer._tempVec31;
      Vector3.transformCoordinate(hitPointWorld, worldMatrixInv, hitPointLocal);
      if (this.isRaycastLocationValid(hitPointLocal)) {
        out.distance = curDistance;
        out.entity = entity;
        out.normal.copyFrom(normal);
        out.point.copyFrom(hitPointWorld);
        return true;
      }
    }
    return false;
  }

  protected isRaycastLocationValid(hitPoint: Vector3): boolean {
    const { x, y } = hitPoint;
    const uiTransform = <UITransform>this._transform;
    const { x: width, y: height } = uiTransform.size;
    const { x: pivotX, y: pivotY } = uiTransform.pivot;
    return x >= -width * pivotX && x <= width * (1 - pivotX) && y >= -height * pivotY && y <= height * (1 - pivotY);
  }

  protected override _onDestroy(): void {
    if (this._subChunk) {
      this._getChunkManager().freeSubChunk(this._subChunk);
      this._subChunk = null;
    }

    this._clearUICanvasAndCanvasGroup();

    super._onDestroy();
  }

  protected override _onTransformChanged(flag: TransformModifyFlags): void {}

  private _findUICanvasAndCanvasGroup() {
    const { _uiCanvas, _canvasGroup, entity } = this;
    _uiCanvas.length = 0;
    _canvasGroup.length = 0;
    entity.getComponentsInParent(UICanvas, _uiCanvas);
    entity.getComponentsInParent(CanvasGroup, _canvasGroup);
    _uiCanvas[0]?.addRenderer(this);
    this._setGroup(_canvasGroup[0]);
  }

  private _clearUICanvasAndCanvasGroup() {
    const { _uiCanvas, _canvasGroup } = this;
    _uiCanvas[0]?.removeRenderer(this);
    this._setGroup(null);
    _uiCanvas.length = 0;
    _canvasGroup.length = 0;
  }

  private _onEntityModify(flag: EntityModifyFlags): void {
    switch (flag) {
      case EntityModifyFlags.Parent:
        this._findUICanvasAndCanvasGroup();
        break;
      default:
        break;
    }
  }
}

/**
 * @remarks Extends `RendererUpdateFlag`.
 */
export enum UIRendererUpdateFlags {
  Alpha = 0x8
}
