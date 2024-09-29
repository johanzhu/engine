import { MathUtil, Ray, Vector2, Vector3 } from "@galacean/engine-math";
import { Camera, CameraModifyFlags } from "../Camera";
import { Component } from "../Component";
import { DependentMode, dependentComponents } from "../ComponentsDependencies";
import { Entity, EntityModifyFlags } from "../Entity";
import { RenderContext } from "../RenderPipeline/RenderContext";
import { RenderElement } from "../RenderPipeline/RenderElement";
import { assignmentClone, ignoreClone } from "../clone/CloneManager";
import { ComponentType } from "../enums/ComponentType";
import { HitResult } from "../physics";
import { CanvasGroup } from "./CanvasGroup";
import { UIRenderer } from "./UIRenderer";
import { UITransform } from "./UITransform";
import { CanvasRenderMode } from "./enums/CanvasRenderMode";
import { ResolutionAdaptationStrategy } from "./enums/ResolutionAdaptationStrategy";

@dependentComponents(UITransform, DependentMode.AutoAdd)
export class UICanvas extends Component {
  /** @internal */
  @ignoreClone
  _canvasIndex: number = -1;
  /** @internal */
  @ignoreClone
  _isRootCanvas: boolean = false;
  /** @internal */
  @ignoreClone
  _renderElement: RenderElement;
  /** @internal */
  @ignoreClone
  _sortDistance: number = 0;

  @assignmentClone
  private _renderMode = CanvasRenderMode.WorldSpace;
  @assignmentClone
  private _renderCamera: Camera;
  @assignmentClone
  private _resolutionAdaptationStrategy = ResolutionAdaptationStrategy.BothAdaptation;
  @assignmentClone
  private _sortOrder: number = 0;
  @assignmentClone
  private _distance: number = 10;
  private _renderers: UIRenderer[] = [];
  private _transform: UITransform;
  private _referenceResolution: Vector2 = new Vector2(800, 600);
  private _enableBlocked: boolean = true;
  private _parents: Entity[] = [];

  get enableBlocked(): boolean {
    return this._enableBlocked;
  }

  set enableBlocked(value: boolean) {
    this._enableBlocked = value;
  }

  get referenceResolution(): Vector2 {
    return this._referenceResolution;
  }

  set referenceResolution(val: Vector2) {
    const { _referenceResolution: referenceResolution } = this;
    if (referenceResolution === val) return;
    (referenceResolution.x !== val.x || referenceResolution.y !== val.y) && referenceResolution.copyFrom(val);
  }

  get renderMode(): CanvasRenderMode {
    return this._renderMode;
  }

  set renderMode(mode: CanvasRenderMode) {
    let preMode = this._renderMode;
    if (preMode !== mode) {
      this._renderMode = mode;
      if (this._isRootCanvas) {
        const camera = this._renderCamera;
        preMode =
          preMode === CanvasRenderMode.ScreenSpaceCamera && !camera ? CanvasRenderMode.ScreenSpaceOverlay : preMode;
        mode = mode === CanvasRenderMode.ScreenSpaceCamera && !camera ? CanvasRenderMode.ScreenSpaceOverlay : mode;
        if (preMode !== mode) {
          if (preMode === CanvasRenderMode.ScreenSpaceCamera) {
            this._removeCameraListener(camera);
            // @ts-ignore
            this._referenceResolution._onValueChanged = null;
          } else if (preMode === CanvasRenderMode.ScreenSpaceOverlay) {
            this._removeCanvasListener();
            // @ts-ignore
            this._referenceResolution._onValueChanged = null;
          }
          if (mode === CanvasRenderMode.ScreenSpaceCamera) {
            this._addCameraListener(camera);
            // @ts-ignore
            this._referenceResolution._onValueChanged = this._onReferenceResolutionChanged;
          } else if (mode === CanvasRenderMode.ScreenSpaceOverlay) {
            this._addCanvasListener();
            // @ts-ignore
            this._referenceResolution._onValueChanged = this._onReferenceResolutionChanged;
          }
          this._adapterPoseInScreenSpace();
          this._adapterSizeInScreenSpace();
          const { _componentsManager: componentsManager } = this.scene;
          componentsManager.removeUICanvas(preMode, this);
          componentsManager.addUICanvas(mode, this);
        }
      }
    }
  }

  get renderCamera(): Camera {
    return this._renderCamera;
  }

  set renderCamera(val: Camera) {
    const preCamera = this._renderCamera;
    if (preCamera !== val) {
      this._renderCamera = val;
      if (this._isRootCanvas && this._renderMode === CanvasRenderMode.ScreenSpaceCamera) {
        preCamera ? this._removeCameraListener(preCamera) : this._removeCanvasListener();
        const preMode = preCamera ? CanvasRenderMode.ScreenSpaceCamera : CanvasRenderMode.ScreenSpaceOverlay;
        const curMode = val ? CanvasRenderMode.ScreenSpaceCamera : CanvasRenderMode.ScreenSpaceOverlay;
        if (val) {
          this._addCameraListener(val);
        } else {
          this._addCanvasListener();
        }
        this._adapterPoseInScreenSpace();
        this._adapterSizeInScreenSpace();
        if (preMode !== curMode) {
          const { _componentsManager: componentsManager } = this.scene;
          componentsManager.removeUICanvas(preMode, this);
          componentsManager.addUICanvas(curMode, this);
        }
      }
    }
  }

  get resolutionAdaptationStrategy(): ResolutionAdaptationStrategy {
    return this._resolutionAdaptationStrategy;
  }

  set resolutionAdaptationStrategy(val: ResolutionAdaptationStrategy) {
    if (this._resolutionAdaptationStrategy !== val) {
      this._resolutionAdaptationStrategy = val;
      if (this._isRootCanvas && this._renderMode !== CanvasRenderMode.WorldSpace) {
        this._adapterSizeInScreenSpace();
      }
    }
  }

  get sortOrder(): number {
    return this._sortOrder;
  }

  set sortOrder(val: number) {
    if (this._sortOrder !== val) {
      this._sortOrder = val;
      if (this._isRootCanvas && this._renderMode === CanvasRenderMode.ScreenSpaceOverlay) {
        this.scene._componentsManager._overlayCanvasesSortingFlag = true;
      }
    }
  }

  get distance(): number {
    return this._distance;
  }

  set distance(val: number) {
    if (this._distance !== val) {
      const { _isRootCanvas: isRootCanvas, _renderMode: renderMode } = this;
      this._distance = val;
      if (this._isRootCanvas) {
        if (renderMode === CanvasRenderMode.ScreenSpaceCamera && this._renderCamera) {
          this._adapterPoseInScreenSpace();
        }
      }
    }
  }

  constructor(entity: Entity) {
    super(entity);
    this._transform = <UITransform>entity.transform;
    this._onEntityModify = this._onEntityModify.bind(this);
    this._onCanvasSizeListener = this._onCanvasSizeListener.bind(this);
    this._onCameraPropertyListener = this._onCameraPropertyListener.bind(this);
    this._onCameraTransformListener = this._onCameraTransformListener.bind(this);
    this._onReferenceResolutionChanged = this._onReferenceResolutionChanged.bind(this);
    // @ts-ignore
    this._referenceResolution._onValueChanged = this._onReferenceResolutionChanged;
  }

  _prepareRender(context: RenderContext): void {
    const { _renderers: renderers } = this;
    const { frameCount } = this.engine.time;
    const renderElement = (this._renderElement = this.engine._renderElementPool.get());
    this._updateSortDistance(context.virtualCamera.position);
    renderElement.set(this.sortOrder, this._sortDistance);
    for (let i = 0, n = renderers.length; i < n; i++) {
      const renderer = renderers[i];
      renderer._renderFrameCount = frameCount;
      renderer._prepareRender(context);
    }
  }

  /** @internal */
  _updateSortDistance(cameraPosition: Vector3): void {
    switch (this._renderMode) {
      case CanvasRenderMode.ScreenSpaceOverlay:
        this._sortDistance = 0;
      case CanvasRenderMode.ScreenSpaceCamera:
        this._sortDistance = this._distance;
      case CanvasRenderMode.WorldSpace:
        this._sortDistance = Vector3.distance(cameraPosition, (this._transform as UITransform).worldPosition);
    }
  }

  /**
   * @internal
   */
  override _onEnableInScene(): void {
    this._entity._dispatchModify(EntityModifyFlags.UICanvasEnableInScene);
    this._entity._registerModifyListener(this._onEntityModify);
    this._registerParentListener();
    this._setIsRootCanvas(this._checkIsRootCanvas());
  }

  /**
   * @internal
   */
  override _onDisableInScene(): void {
    this._removeParentListener();
    this._entity._removeModifyListener(this._onEntityModify);
    this._entity._dispatchModify(EntityModifyFlags.UICanvasDisableInScene);
    this._setIsRootCanvas(false);
    this._renderers.length = 0;
  }

  /**
   * @internal
   */
  rayCast(ray: Ray, out: HitResult, distance: number = Number.MAX_SAFE_INTEGER): boolean {
    const { _renderers: renderers } = this;
    for (let i = renderers.length - 1; i >= 0; i--) {
      const renderer = renderers[i];
      if (renderer.rayCastAble && renderer._raycast(ray, out, distance)) {
        return true;
      }
    }
    return false;
  }

  /**
   * @internal
   */
  addRenderer(renderer: UIRenderer) {
    renderer && this._renderers.push(renderer);
  }

  /**
   * @internal
   */
  removeRenderer(renderer: UIRenderer) {
    const index = this._renderers.indexOf(renderer);
    if (index !== -1) {
      this._renderers.splice(index, 1);
    }
  }

  private _adapterPoseInScreenSpace(): void {
    const { _renderCamera: renderCamera, _transform: transform } = this;
    if (renderCamera) {
      const { transform: cameraTransform } = renderCamera.entity;
      const { worldPosition: cameraWorldPosition, worldForward: cameraWorldForward } = cameraTransform;
      const { _distance: distance } = this;
      transform.setWorldPosition(
        cameraWorldPosition.x + cameraWorldForward.x * distance,
        cameraWorldPosition.y + cameraWorldForward.y * distance,
        cameraWorldPosition.z + cameraWorldForward.z * distance
      );
      transform.worldRotationQuaternion.copyFrom(cameraTransform.worldRotationQuaternion);
    } else {
      const { canvas } = this.engine;
      transform.setWorldPosition(canvas.width / 2, canvas.height / 2, 0);
      transform.worldRotationQuaternion.set(0, 0, 0, 1);
    }
  }

  private _adapterSizeInScreenSpace(): void {
    const { _renderCamera: renderCamera } = this;
    const { x: width, y: height } = this._referenceResolution;
    let curWidth: number;
    let curHeight: number;
    if (renderCamera) {
      curHeight = renderCamera.isOrthographic
        ? renderCamera.orthographicSize * 2
        : 2 * (Math.tan(MathUtil.degreeToRadian(renderCamera.fieldOfView / 2)) * this._distance);
      curWidth = renderCamera.aspectRatio * curHeight;
    } else {
      const canvas = this.engine.canvas;
      curHeight = canvas.height;
      curWidth = canvas.width;
    }
    let expectX: number, expectY: number, expectZ: number;
    switch (this._resolutionAdaptationStrategy) {
      case ResolutionAdaptationStrategy.WidthAdaptation:
        expectX = expectY = expectZ = curWidth / width;
        break;
      case ResolutionAdaptationStrategy.HeightAdaptation:
        expectX = expectY = expectZ = curHeight / height;
        break;
      case ResolutionAdaptationStrategy.BothAdaptation:
        expectX = curWidth / width;
        expectY = curHeight / height;
        expectZ = (expectX + expectY) / 2;
        break;
      case ResolutionAdaptationStrategy.ExpandAdaptation:
        expectX = expectY = expectZ = Math.min(curWidth / width, curHeight / height);
        break;
      case ResolutionAdaptationStrategy.ShrinkAdaptation:
        expectX = expectY = expectZ = Math.max(curWidth / width, curHeight / height);
        break;
      default:
        break;
    }
    this.entity.transform.setScale(expectX, expectY, expectZ);
    this._transform.size.set(curWidth / expectX, curHeight / expectY);
  }

  private _addCameraListener(camera: Camera): void {
    camera.entity.transform._updateFlagManager.addListener(this._onCameraTransformListener);
    camera._updateFlagManager.addListener(this._onCameraPropertyListener);
  }

  private _removeCameraListener(camera: Camera): void {
    camera.entity.transform._updateFlagManager.removeListener(this._onCameraTransformListener);
    camera._updateFlagManager.removeListener(this._onCameraPropertyListener);
  }

  private _onCameraPropertyListener(flag: CameraModifyFlags): void {
    switch (flag) {
      case CameraModifyFlags.NearPlane:
      case CameraModifyFlags.FarPlane:
        break;
      default:
        this._adapterSizeInScreenSpace();
        break;
    }
  }

  private _onCameraTransformListener(): void {
    this._adapterPoseInScreenSpace();
  }

  private _addCanvasListener(): void {
    this.engine.canvas._sizeUpdateFlagManager.addListener(this._onCanvasSizeListener);
  }

  private _removeCanvasListener(): void {
    this.engine.canvas._sizeUpdateFlagManager.removeListener(this._onCanvasSizeListener);
  }

  private _onCanvasSizeListener(): void {
    const { canvas } = this.engine;
    this._transform.setWorldPosition(canvas.width / 2, canvas.height / 2, 0);
    this._adapterSizeInScreenSpace();
  }

  private _removeParentListener(offset: number = 0): void {
    const { _parents: parents } = this;
    for (let i = 0, n = parents.length; i < n; i++) {
      parents[i]._removeModifyListener(this._onEntityModify);
    }
    parents.length = 0;
  }

  private _registerParentListener(): void {
    const { _parents: parents } = this;
    let curParent = this.entity.parent;
    let index = 0;
    while (curParent) {
      const preParent = parents[index];
      if (preParent !== curParent) {
        preParent?._removeModifyListener(this._onEntityModify);
        parents[index] = curParent;
        curParent._registerModifyListener(this._onEntityModify);
      }
      curParent = curParent.parent;
      index++;
    }
  }

  private _onEntityModify(flag: EntityModifyFlags, param?: any): void {
    switch (flag) {
      case EntityModifyFlags.Parent:
        this._removeParentListener();
        this._registerParentListener();
        this._setIsRootCanvas(this._checkIsRootCanvas());
        break;
      case EntityModifyFlags.UICanvasEnableInScene:
        this._setIsRootCanvas(false);
        break;
      case EntityModifyFlags.UICanvasDisableInScene:
        this._setIsRootCanvas(this._checkIsRootCanvas());
        break;
      default:
        break;
    }
  }

  private _onReferenceResolutionChanged(): void {
    this._adapterSizeInScreenSpace();
  }

  private _checkIsRootCanvas(): boolean {
    const canvases = this.entity.getComponentsInParent(UICanvas, []);
    for (let i = 0, n = canvases.length; i < n; i++) {
      if (canvases[i].enabled) return false;
    }
    return true;
  }

  private _setIsRootCanvas(value: boolean): void {
    if (this._isRootCanvas !== value) {
      this._isRootCanvas = value;
      const { _renderMode: renderMode } = this;
      if (value) {
        switch (renderMode) {
          case CanvasRenderMode.ScreenSpaceCamera:
            if (this._renderCamera) {
              this._addCameraListener(this._renderCamera);
            } else {
              this._addCanvasListener();
            }
            // @ts-ignore
            this._referenceResolution._onValueChanged = this._onReferenceResolutionChanged;
            this._adapterPoseInScreenSpace();
            this._adapterSizeInScreenSpace();
            break;
          case CanvasRenderMode.ScreenSpaceOverlay:
            this._addCanvasListener();
            // @ts-ignore
            this._referenceResolution._onValueChanged = this._onReferenceResolutionChanged;
            this._adapterPoseInScreenSpace();
            this._adapterSizeInScreenSpace();
            break;
          default:
            break;
        }
        this.scene._componentsManager.addUICanvas(renderMode, this);
      } else {
        switch (renderMode) {
          case CanvasRenderMode.ScreenSpaceCamera:
            if (this._renderCamera) {
              this._removeCameraListener(this._renderCamera);
            } else {
              this._removeCanvasListener();
            }
            // @ts-ignore
            this._referenceResolution._onValueChanged = null;
            break;
          case CanvasRenderMode.ScreenSpaceOverlay:
            this._removeCanvasListener();
            // @ts-ignore
            this._referenceResolution._onValueChanged = null;
            break;
          default:
            break;
        }
        this.scene._componentsManager.removeUICanvas(renderMode, this);
      }
    }
  }
}
