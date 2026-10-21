import { createContext, useContext, useLayoutEffect, useMemo, type ReactNode, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  BoxGeometry, Color, DoubleSide, Group, DynamicDrawUsage, EdgesGeometry, Frustum,
  InstancedBufferAttribute, InstancedMesh, Matrix4, Vector3,
  type BufferGeometry, type Material, type Mesh, type Object3D
} from 'three';

type BatchMaterial = Material & {
  color?: Color;
  emissive?: Color;
  emissiveIntensity?: number;
  map?: unknown;
  wireframe?: boolean;
  roughness?: number;
  metalness?: number;
  fog?: boolean;
};
type Source = { object: Mesh; material: BatchMaterial; dimensions: Vector3; z: number };
type Batch = { mesh: InstancedMesh; sources: Source[]; capacity: number; group: Object3D; opacity: InstancedBufferAttribute; emissive: InstancedBufferAttribute | null };
type Registry = { roots: Set<Object3D>; revision: number };
// Module-owned CPU templates; batches own and dispose their uploaded clones.
export const TOWER_BOX_GEOMETRY = new BoxGeometry();
export const TOWER_OUTLINE_GEOMETRY = new EdgesGeometry(TOWER_BOX_GEOMETRY);
const Context = createContext<Registry | null>(null);

/** Animation objects stay intact; only their equivalent render submissions are combined. */
export function useRenderBatchGroup(ref: RefObject<Object3D>) {
  const registry = useContext(Context);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!registry || !root) return;
    registry.roots.add(root);
    registry.revision++;
    return () => { registry.roots.delete(root); registry.revision++; };
  }, [ref, registry]);
  useLayoutEffect(() => { if (registry) registry.revision++; });
}

function materialKey(material: BatchMaterial) {
  return [material.type, material.transparent, material.blending, material.side,
    material.depthTest, material.depthWrite, material.colorWrite, material.toneMapped,
    material.polygonOffset, material.polygonOffsetFactor, material.polygonOffsetUnits,
    material.wireframe, material.roughness, material.metalness,
    material.alphaTest, material.premultipliedAlpha, material.fog].join(':');
}

function geometryInfo(geometry: BufferGeometry) {
  const params = (geometry as BufferGeometry & { parameters?: Record<string, unknown> }).parameters;
  const box = geometry.type === 'BoxGeometry' ? geometry : geometry.type === 'EdgesGeometry' ? params?.geometry : null;
  if (box instanceof BoxGeometry) {
    const { width, height, depth, widthSegments, heightSegments, depthSegments } = box.parameters;
    if (widthSegments === 1 && heightSegments === 1 && depthSegments === 1) {
      return { key: geometry.type, dimensions: new Vector3(width, height, depth), normalized: true };
    }
  }
  return { key: geometry.type + ':' + JSON.stringify(params ?? geometry.uuid), dimensions: new Vector3(1, 1, 1), normalized: false };
}

function createBatch(source: Source, key: string, capacity: number, scene: Object3D): Batch {
  const info = geometryInfo(source.object.geometry);
  let geometry: BufferGeometry;
  if (info.normalized) {
    const box = new BoxGeometry();
    if (source.object.geometry.type === 'EdgesGeometry') { geometry = new EdgesGeometry(box); box.dispose(); }
    else geometry = box;
  } else geometry = source.object.geometry.clone();
  const material = source.material.clone() as BatchMaterial;
  material.visible = true;
  material.color?.setRGB(1, 1, 1);
  material.opacity = 1;
  const opacity = new InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(DynamicDrawUsage);
  geometry.setAttribute('batchOpacity', opacity);
  const emissive = material.emissive
    ? new InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(DynamicDrawUsage) : null;
  if (emissive) {
    geometry.setAttribute('batchEmissive', emissive);
    material.emissive!.setRGB(1, 1, 1);
    material.emissiveIntensity = 1;
  }
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>',
      '#include <common>\nattribute float batchOpacity;\nvarying float vBatchOpacity;'
      + (emissive ? '\nattribute vec3 batchEmissive;\nvarying vec3 vBatchEmissive;' : ''))
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBatchOpacity = batchOpacity;'
        + (emissive ? '\nvBatchEmissive = batchEmissive;' : ''));
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>',
      '#include <common>\nvarying float vBatchOpacity;'
      + (emissive ? '\nvarying vec3 vBatchEmissive;' : ''))
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );',
        'vec4 diffuseColor = vec4( diffuse, opacity * vBatchOpacity );');
    if (emissive) shader.fragmentShader = shader.fragmentShader.replace(
      'vec3 totalEmissiveRadiance = emissive;', 'vec3 totalEmissiveRadiance = emissive * vBatchEmissive;');
  };
  material.customProgramCacheKey = () => `web3-batch-v1:${Boolean(emissive)}`;
  const mesh = new InstancedMesh(geometry, material, capacity);
  if (source.object.type === 'LineSegments') {
    // Three's instanced renderer supports lines, while InstancedMesh owns the GPU buffers.
    Object.defineProperties(mesh, { isMesh: { value: false }, isLine: { value: true }, isLineSegments: { value: true } });
  }
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false; // Individual source bounds are tested before inserting instances.
  mesh.renderOrder = source.object.renderOrder;
  mesh.count = 0;
  mesh.name = `render-batch:${key}`;
  const group = new Group();
  scene.add(group);
  group.add(mesh);
  return { mesh, sources: [], capacity, group, opacity, emissive };
}

function disposeBatch(batch: Batch) {
  batch.group.removeFromParent();
  batch.mesh.dispose();
  batch.mesh.geometry.dispose();
  (batch.mesh.material as Material).dispose();
}

function writeFloat(attribute: InstancedBufferAttribute, offset: number, value: number) {
  const next = Math.fround(value);
  if (attribute.array[offset] === next) return false;
  attribute.array[offset] = next;
  return true;
}

function writeColor(attribute: InstancedBufferAttribute, offset: number, color: Color, intensity = 1) {
  const red = writeFloat(attribute, offset, color.r * intensity);
  const green = writeFloat(attribute, offset + 1, color.g * intensity);
  const blue = writeFloat(attribute, offset + 2, color.b * intensity);
  return red || green || blue;
}

function writeFloats(attribute: InstancedBufferAttribute, offset: number, values: ArrayLike<number>) {
  let changed = false;
  for (let i = 0; i < values.length; i++) {
    const value = Math.fround(values[i]);
    if (attribute.array[offset + i] !== value) { attribute.array[offset + i] = value; changed = true; }
  }
  return changed;
}

function BatchRenderer({ registry }: { registry: Registry }) {
  const { scene } = useThree();
  const state = useMemo(() => ({
    revision: -1, batches: new Map<string, Batch>(), hidden: new Map<Material, boolean>(),
    matrix: new Matrix4(), projection: new Matrix4(), frustum: new Frustum(), position: new Vector3()
  }), []);
  useLayoutEffect(() => () => {
    for (const [material, visible] of state.hidden) material.visible = visible;
    for (const batch of state.batches.values()) disposeBatch(batch);
    state.batches.clear();
    state.hidden.clear();
  }, [state]);

  useFrame(({ gl, camera }) => {
    if (state.revision !== registry.revision) {
      state.revision = registry.revision;
      for (const [material, visible] of state.hidden) material.visible = visible;
      state.hidden.clear();
      const collected = new Map<string, Source[]>();
      const seen = new Set<Object3D>();
      for (const root of registry.roots) root.traverse((node) => {
        const object = node as Mesh;
        if (seen.has(node) || !object.geometry || object instanceof InstancedMesh || Array.isArray(object.material)) return;
        seen.add(node);
        const material = object.material as BatchMaterial;
        if (!material?.visible || material.map || !material.color || !material.colorWrite
          || (material.transparent && material.side === DoubleSide)) return;
        const info = geometryInfo(object.geometry);
        let groupOrder = 0;
        for (let parent = object.parent; parent; parent = parent.parent) {
          if ((parent as Object3D & { isGroup?: boolean }).isGroup) { groupOrder = parent.renderOrder; break; }
        }
        const key = `${groupOrder}:${object.renderOrder}:${info.key}:${materialKey(material)}`;
        const list = collected.get(key) ?? [];
        list.push({ object, material, dimensions: info.dimensions, z: 0 });
        collected.set(key, list);
      });
      for (const [key, sources] of collected) {
        let batch = state.batches.get(key);
        if (batch && batch.capacity < sources.length) { disposeBatch(batch); state.batches.delete(key); batch = undefined; }
        if (!batch) {
          batch = createBatch(sources[0], key, Math.max(16, 2 ** Math.ceil(Math.log2(sources.length))), scene);
          batch.group.renderOrder = Number(key.split(':')[0]);
          state.batches.set(key, batch);
        }
        batch.sources = sources;
        for (const source of sources) {
          if (!state.hidden.has(source.material)) state.hidden.set(source.material, source.material.visible);
        }
      }
      for (const [key, batch] of state.batches) if (!collected.has(key)) { disposeBatch(batch); state.batches.delete(key); }
      for (const material of state.hidden.keys()) material.visible = false;
    }

    scene.updateMatrixWorld();
    camera.updateMatrixWorld();
    state.projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    state.frustum.setFromProjectionMatrix(state.projection);
    for (const batch of state.batches.values()) {
      const { mesh, sources } = batch;
      if ((mesh.material as Material).transparent) {
        for (const source of sources) source.z = state.position.setFromMatrixPosition(source.object.matrixWorld)
          .applyMatrix4(state.projection).z;
        sources.sort((a, b) => b.z - a.z || a.object.id - b.object.id);
      }
      let index = 0;
      let matrixDirty = false, colorDirty = false, opacityDirty = false, emissiveDirty = false;
      for (const source of sources) {
        const { object, material } = source;
        if (material.transparent && material.opacity <= 1e-8) continue;
        let visible = true;
        for (let parent: Object3D | null = object; parent; parent = parent.parent) {
          if (!parent.visible) { visible = false; break; }
        }
        if (!visible || !object.layers.test(camera.layers)
          || (object.frustumCulled && !state.frustum.intersectsObject(object))) continue;
        state.matrix.copy(object.matrixWorld).scale(source.dimensions);
        matrixDirty = writeFloats(mesh.instanceMatrix, index * 16, state.matrix.elements) || matrixDirty;
        colorDirty = writeColor(mesh.instanceColor!, index * 3, material.color!) || colorDirty;
        opacityDirty = writeFloat(batch.opacity, index, material.opacity) || opacityDirty;
        if (batch.emissive) {
          const color = material.emissive!;
          const intensity = material.emissiveIntensity ?? 1;
          emissiveDirty = writeColor(batch.emissive, index * 3, color, intensity) || emissiveDirty;
        }
        index++;
      }
      mesh.count = index;
      if (matrixDirty) mesh.instanceMatrix.needsUpdate = true;
      if (colorDirty) mesh.instanceColor!.needsUpdate = true;
      if (opacityDirty) batch.opacity.needsUpdate = true;
      if (emissiveDirty && batch.emissive) batch.emissive.needsUpdate = true;
    }
    const auto = scene.matrixWorldAutoUpdate;
    scene.matrixWorldAutoUpdate = false;
    try { gl.render(scene, camera); } finally { scene.matrixWorldAutoUpdate = auto; }
  }, 1); // Run after all animations; take over exactly one render, with no extra frame of latency.
  return null;
}

export function RenderBatches({ children }: { children: ReactNode }) {
  const registry = useMemo<Registry>(() => ({ roots: new Set(), revision: 0 }), []);
  return <Context.Provider value={registry}>{children}<BatchRenderer registry={registry} /></Context.Provider>;
}
