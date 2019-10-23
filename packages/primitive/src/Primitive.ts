import { DrawMode, DataType, BufferUsage, UpdateType } from '@alipay/o3-base';
import { AssetObject, Node } from '@alipay/o3-core';
import { vec3 } from '@alipay/o3-math';

let primitiveID = 0;

/**
 * primitive(triangles, lines) data, vbo+indices, equal glTF meshes.primitives define
 * @class
 * @private
 */
export class Primitive extends AssetObject {
  public id: number;
  public mode: number;
  public usage: number;
  public updateType: number;
  public updateRange: { byteOffset: number; byteLength: number };
  public vertexBuffers;
  public vertexAttributes;
  public vertexOffset;
  public vertexCount;
  public indexType;
  public indexCount;
  public indexBuffer;
  public indexOffset;
  public material;
  public targets;
  public boundingBoxMax;
  public boundingBoxMin;
  public boundingBoxMagnify: number;
  /** 包围盒跟视锥体的相交情况，需要使用o3-renderer-cull才会生效 */
  public boundingBoxIntersectsInfo: {
    intersect: boolean,
    include: boolean
  };


  /**
   * @constructor
   */
  constructor( name? ) {

    super( name !== undefined ? name : 'DEFAULT_PRIMITIVENAME_' + primitiveID++ );

    this.id = primitiveID;
    this.mode = DrawMode.TRIANGLES;  // draw mode, triangles, lines etc.
    this.usage = BufferUsage.STATIC_DRAW;
    this.updateType = UpdateType.UPDATE_ALL;
    this.updateRange = {
      byteOffset: -1,
      byteLength: 0
    };

    //-- 顶点数据
    this.vertexBuffers = [];  // ArrayBuffer，一个Primitive可能包含1个或多个顶点缓冲
    this.vertexAttributes = {};   // vertex attributes: dict object, [senmatic]-->VertexAttribute
    this.vertexOffset = 0;
    this.vertexCount = 0;

    //-- index 数据，可能为null
    this.indexType = DataType.UNSIGNED_SHORT;
    this.indexCount = 0;       // number of elements
    this.indexBuffer = null;   // ArrayBuffer object
    this.indexOffset = 0;

    //--
    this.material = null;   // default material objects
    this.targets = [];      // MorphTarget array
    this.boundingBoxMax = [ Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE ];
    this.boundingBoxMin = [ Number.MIN_VALUE, Number.MIN_VALUE, Number.MIN_VALUE ];
    this.boundingBoxMagnify = 0;
    this.boundingBoxIntersectsInfo = {
      intersect: undefined,
      include: undefined,
    };

  }

  /**
   * 添加一个顶点属性
   * @param {string} semantic
   * @param {number} size
   * @param {DataType} type
   * @param {boolean} normalized
   * @param {number} stride
   * @param {number} offset
   * @param {number} vertexBufferIndex
   */
  addAttribute( semantic, size, type, normalized, stride, offset, vertexBufferIndex ) {

    this.vertexAttributes[semantic] = {
      semantic,
      size,
      type,
      normalized,
      stride,
      offset,
      vertexBufferIndex
    };

  }

  /**
   * 重置更新范围对象
   */
  resetUpdateRange() {

    this.updateRange.byteOffset = -1;
    this.updateRange.byteLength = 0;

  }

  /**
   *  更新boundingBox
   */
  updateBoundingBox( node: Node) {

    const modelViewMatrix = Float32Array.from((node as any).getModelMatrix());
    const index = this.vertexAttributes['POSITION'].vertexBufferIndex;
    const stride = this.vertexAttributes['POSITION'].stride || 3;
    const buffer = this.vertexBuffers[index];
    const geometryPoints = Array.from(new Float32Array(buffer));
    let points = [];
    const len = geometryPoints.length;
    for (let i = 0; i < len; i += stride) {
      points.push(geometryPoints.slice(i, i + 3));
    }
    points = points.map(point => {
      vec3.transformMat4(point, point, modelViewMatrix);
      return point;
    });
    const { min, max } = points.reduce(function(pre, curr) {
      const min = pre.min ? vec3.min(vec3.create(), pre.min, curr) : curr;
      const max = pre.max ? vec3.max(vec3.create(), pre.max, curr) : curr;
      return { min, max };
    }, { min: null, max: null });

    min[0] -= this.boundingBoxMagnify;
    min[1] -= this.boundingBoxMagnify;
    min[2] -= this.boundingBoxMagnify;
    max[0] += this.boundingBoxMagnify;
    max[1] += this.boundingBoxMagnify;
    max[2] += this.boundingBoxMagnify;

    this.boundingBoxMin = min;
    this.boundingBoxMax = max;

  }

}
