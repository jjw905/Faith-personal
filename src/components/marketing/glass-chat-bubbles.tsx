"use client";

import {
  Environment,
  Lightformer,
  MeshTransmissionMaterial,
  OrbitControls,
  PerspectiveCamera,
} from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

function createBubbleGeometry(tail: "left" | "right") {
  const shape = new THREE.Shape();
  const w = 0.92;
  const h = 0.62;
  const r = 0.42;

  if (tail === "left") {
    shape.moveTo(-w + r, -h);
    shape.lineTo(w - r, -h);
    shape.quadraticCurveTo(w, -h, w, -h + r);
    shape.lineTo(w, h - r);
    shape.quadraticCurveTo(w, h, w - r, h);
    shape.lineTo(-w + r, h);
    shape.quadraticCurveTo(-w, h, -w, h - r);
    shape.lineTo(-w, -h + r * 0.55);
    shape.lineTo(-w - 0.32, -h - 0.3);
    shape.lineTo(-w + r * 0.35, -h);
  } else {
    shape.moveTo(-w + r, -h);
    shape.lineTo(w - r * 0.35, -h);
    shape.lineTo(w + 0.32, -h - 0.3);
    shape.lineTo(w, -h + r * 0.55);
    shape.lineTo(w, h - r);
    shape.quadraticCurveTo(w, h, w - r, h);
    shape.lineTo(-w + r, h);
    shape.quadraticCurveTo(-w, h, -w, h - r);
    shape.lineTo(-w, -h + r);
    shape.quadraticCurveTo(-w, -h, -w + r, -h);
  }
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.48,
    bevelEnabled: true,
    bevelThickness: 0.22,
    bevelSize: 0.18,
    bevelOffset: 0,
    // 모서리 하이라이트 계단 현상 방지
    bevelSegments: 32,
    curveSegments: 64,
  });
  geo.center();
  // 공유 정점 + 스무스 노멀로 베벨 각짐 완화
  const smooth = mergeVertices(geo, 1e-4);
  geo.dispose();
  smooth.computeVertexNormals();
  smooth.computeBoundingSphere();
  return smooth;
}

/**
 * 스튜디오 조명 패널 환경.
 * 넓은 상단 패널 + 좌우 스트립으로 유리 모서리에 선명한 하이라이트 줄을 만든다.
 * background={false} → 페이지 배경은 그대로 두고 반사/굴절에만 사용.
 */
function StudioEnv() {
  return (
    <Environment resolution={512} background={false}>
      {/* 중간 톤 배경 → 밝은 히어로에서도 모서리가 은은히 잡힘 */}
      <color attach="background" args={["#b7bcc4"]} />
      {/* 상단 메인 소프트박스 — 크게 퍼뜨려 모서리 하이라이트 밴딩 완화 */}
      <Lightformer
        intensity={4.5}
        position={[0, 3.5, 1.5]}
        rotation={[Math.PI / 2, 0, 0]}
        scale={[12, 5, 1]}
      />
      {/* 좌우 하이라이트 스트립 — 살짝 푸른 틴트로 유리 착색 보조 */}
      <Lightformer
        intensity={2.8}
        color="#d8f0ff"
        position={[-4.5, 1, 2]}
        rotation={[0, Math.PI / 2, 0]}
        scale={[6, 6, 1]}
      />
      <Lightformer
        intensity={2.8}
        color="#e8f6ff"
        position={[4.5, 1, 2]}
        rotation={[0, -Math.PI / 2, 0]}
        scale={[6, 6, 1]}
      />
      {/* 전면 채움 */}
      <Lightformer
        intensity={2}
        color="#f0f8ff"
        position={[0, 0, 5]}
        scale={[8, 8, 1]}
      />
    </Environment>
  );
}

/** 아이스 블루 유리 — 단일 MeshTransmissionMaterial용. */
const GLASS = {
  backside: true as const,
  samples: 16,
  resolution: 1024,
  transmission: 1,
  // 하이라이트 계단 완화
  roughness: 0.12,
  thickness: 1.25,
  ior: 1.45,
  chromaticAberration: 0.03,
  anisotropy: 0.08,
  distortion: 0.06,
  distortionScale: 0.2,
  temporalDistortion: 0,
  color: "#a8daf0",
  attenuationColor: "#3f9ec4",
  attenuationDistance: 1.35,
  clearcoat: 0.85,
  clearcoatRoughness: 0.12,
};

export type BubbleTransform = {
  position: [number, number, number];
  rotation: [number, number, number];
};

export type GlassBubblesConfig = {
  bubbleA: BubbleTransform;
  bubbleB: BubbleTransform;
  float: boolean;
  controls: boolean;
  /** OrbitControls 카메라 (베이크/복원용). */
  camera: {
    position: [number, number, number];
    target: [number, number, number];
  };
};

export const DEFAULT_GLASS_CONFIG: GlassBubblesConfig = {
  bubbleA: { position: [0.34, 1.1, 0.12], rotation: [0.12, -0.1, 0] },
  bubbleB: { position: [-0.28, -0.46, -0.04], rotation: [0.12, -0.1, 0] },
  float: true,
  controls: true,
  camera: {
    position: [0, 0, 9.2],
    target: [0, 0, 0],
  },
};

export const GLASS_SHOT_KEY = "faith-glass-shot-config";

export type GlassShotPayload = {
  config: GlassBubblesConfig;
  /** 저장 파일 번호 (01, 02, 03…). */
  shot: number;
};

function applyTransform(
  geo: THREE.BufferGeometry,
  position: [number, number, number],
  rotation: [number, number, number],
) {
  geo.rotateX(rotation[0]);
  geo.rotateY(rotation[1]);
  geo.rotateZ(rotation[2]);
  geo.translate(position[0], position[1], position[2]);
  return geo;
}

/**
 * 참고 이미지처럼 두 말풍선을 겹쳐 고정한 묶음.
 * 지오메트리를 하나로 합쳐 MeshTransmissionMaterial 1개로 유리 질감 + 블루 착색.
 */
function BubbleCluster({
  bubbleA,
  bubbleB,
  float,
}: {
  bubbleA: BubbleTransform;
  bubbleB: BubbleTransform;
  float: boolean;
}) {
  const ref = useRef<THREE.Group>(null);

  const merged = useMemo(() => {
    const a = applyTransform(
      createBubbleGeometry("right"),
      bubbleA.position,
      bubbleA.rotation,
    );
    const b = applyTransform(
      createBubbleGeometry("left"),
      bubbleB.position,
      bubbleB.rotation,
    );
    const out = mergeGeometries([a, b], false);
    a.dispose();
    b.dispose();
    if (!out) return new THREE.BufferGeometry();
    // ExtrudeGeometry 노멀 유지 — 재계산하면 베벨이 각져 보임
    out.computeBoundingSphere();
    return out;
  }, [bubbleA, bubbleB]);

  useEffect(() => () => merged.dispose(), [merged]);

  useFrame((state) => {
    const g = ref.current;
    if (!g) return;
    if (!float) {
      g.position.set(0, 0, 0);
      g.rotation.z = 0;
      return;
    }
    const t = state.clock.elapsedTime;
    g.position.y = Math.sin(t * 0.6) * 0.12;
    g.position.x = Math.cos(t * 0.4) * 0.04;
    g.rotation.z = Math.sin(t * 0.5) * 0.02;
  });

  return (
    <group ref={ref}>
      <mesh geometry={merged} frustumCulled={false}>
        <MeshTransmissionMaterial
          {...GLASS}
          background={new THREE.Color("#d2e8f4")}
        />
      </mesh>
    </group>
  );
}

function CameraRig({
  config,
  bake,
  onCameraChange,
}: {
  config: GlassBubblesConfig;
  bake: boolean;
  onCameraChange?: (cam: GlassBubblesConfig["camera"]) => void;
}) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
  const didInit = useRef(false);

  useEffect(() => {
    if (!bake && didInit.current) return;
    didInit.current = true;
    const [x, y, z] = config.camera.position;
    const [tx, ty, tz] = config.camera.target;
    camera.position.set(x, y, z);
    camera.lookAt(tx, ty, tz);
    const c = controlsRef.current;
    if (c) {
      c.target.set(tx, ty, tz);
      c.update();
    }
  }, [bake, camera, config.camera.position, config.camera.target]);

  useFrame(() => {
    if (bake) {
      const [tx, ty, tz] = config.camera.target;
      camera.lookAt(tx, ty, tz);
      return;
    }
    const c = controlsRef.current;
    if (!c) return;
    const next = {
      position: c.object.position.toArray() as [number, number, number],
      target: c.target.toArray() as [number, number, number],
    };
    // 프리뷰에서 PNG 저장 시 최신 카메라 읽기용
    (
      window as Window & {
        __faithGlassCamera?: GlassBubblesConfig["camera"];
      }
    ).__faithGlassCamera = next;
  });

  return (
    <>
      <PerspectiveCamera makeDefault fov={32} near={0.1} far={40} />
      {!bake && config.controls && (
        <OrbitControls
          ref={controlsRef}
          makeDefault
          enablePan
          enableZoom
          minDistance={3}
          maxDistance={20}
          rotateSpeed={0.7}
          onEnd={() => {
            const c = controlsRef.current;
            if (!c || !onCameraChange) return;
            onCameraChange({
              position: c.object.position.toArray() as [number, number, number],
              target: c.target.toArray() as [number, number, number],
            });
          }}
        />
      )}
    </>
  );
}

function CaptureBridge({ bake }: { bake: boolean }) {
  const { gl, scene, camera } = useThree();

  useEffect(() => {
    if (bake) return;
    const w = window as Window & {
      __faithGlassCapture?: () => {
        camera: GlassBubblesConfig["camera"];
        dataUrl: string;
      };
    };

    w.__faithGlassCapture = () => {
      const prevBg = scene.background;
      const prevClear = new THREE.Color();
      gl.getClearColor(prevClear);
      const prevAlpha = gl.getClearAlpha();

      // 투명 배경으로 몇 프레임 그려 굴절 버퍼 안정화
      scene.background = null;
      gl.setClearColor(0x000000, 0);
      for (let i = 0; i < 4; i += 1) {
        gl.clear();
        gl.render(scene, camera);
      }

      const dataUrl = gl.domElement.toDataURL("image/png");

      scene.background = prevBg;
      gl.setClearColor(prevClear, prevAlpha);
      gl.render(scene, camera);

      const live = (
        window as Window & {
          __faithGlassCamera?: GlassBubblesConfig["camera"];
        }
      ).__faithGlassCamera;

      return {
        camera: live ?? {
          position: camera.position.toArray() as [number, number, number],
          target: [0, 0, 0],
        },
        dataUrl,
      };
    };

    return () => {
      delete w.__faithGlassCapture;
    };
  }, [bake, camera, gl, scene]);

  return null;
}

function SceneContent({
  config,
  bake = false,
  onCameraChange,
}: {
  config: GlassBubblesConfig;
  bake?: boolean;
  onCameraChange?: (cam: GlassBubblesConfig["camera"]) => void;
}) {
  return (
    <>
      <CameraRig config={config} bake={bake} onCameraChange={onCameraChange} />
      <CaptureBridge bake={bake} />
      <ambientLight intensity={0.75} color="#e8f4fa" />
      <directionalLight position={[3, 5, 4]} intensity={1.25} color="#ffffff" />
      <directionalLight position={[-3, 1.5, 2]} intensity={0.65} color="#a8d8f0" />
      <StudioEnv />

      <BubbleCluster
        bubbleA={config.bubbleA}
        bubbleB={config.bubbleB}
        float={bake ? false : config.float}
      />
    </>
  );
}

/**
 * 유리/얼음 질감 3D 말풍선 캔버스.
 * bake=true → 투명 배경 + 고정 카메라 + 고해상도(정지). PNG로 굽는 용도.
 */
export function GlassChatBubblesPreview({
  config = DEFAULT_GLASS_CONFIG,
  bake = false,
  onCameraChange,
}: {
  config?: GlassBubblesConfig;
  bake?: boolean;
  onCameraChange?: (cam: GlassBubblesConfig["camera"]) => void;
}) {
  return (
    <div style={{ width: "100%", height: "100%", minHeight: 0 }}>
      <Canvas
        dpr={2}
        frameloop="always"
        gl={{
          antialias: true,
          alpha: true,
          preserveDrawingBuffer: true,
          powerPreference: "high-performance",
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.05,
        }}
        style={{
          width: "100%",
          height: "100%",
          background: bake ? "transparent" : "#e7e9ed",
        }}
      >
        {!bake && <color attach="background" args={["#e7e9ed"]} />}
        <Suspense fallback={null}>
          <SceneContent
            config={config}
            bake={bake}
            onCameraChange={onCameraChange}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
