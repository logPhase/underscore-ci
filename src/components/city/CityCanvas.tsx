import { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html, Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { CityBuilding, CityDistrict } from "@/lib/city-layout";
import type { CityModel, CityRoute } from "@/lib/city-data";

/**
 * CityCanvas — the Code City, rendered to match the agent-symphony reference:
 * spaced district islands, buildings with landmark silhouettes, window glow,
 * test roofs and per-role materials, under the reference's no-bloom recipe
 * (ACES-filmic tone mapping + emissive materials + warm-key / cool-violet fill
 * + fog). Picking a journey lights an ordered route; PR mode shows only the
 * files the PR touched, on their district platforms, so a busy repo reads as a
 * handful of buildings instead of a wall of blocks.
 *
 * All domain decisions (positions, sizes, colours, roles, routes, PR status)
 * are precomputed in city-layout / city-data — this file only renders + camera.
 */

const CLEAR = "#0f0f23";
const GROUND = "#1a1a2e";
const AMBER = "#f59e0b";

// The reference's exact role palette — clean, saturated, one family.
const ROLE_COLORS: Record<string, string> = {
  controller: "#e87461",
  service: "#4a9ead",
  model: "#7c5cbf",
  utility: "#6b7280",
  test: "#4ade80",
  config: "#a1a1aa",
  infrastructure: "#e879a0",
};
const roleColor = (role: string) => ROLE_COLORS[role] ?? "#6b7280";

export interface CityCanvasProps {
  model: CityModel;
  selectedId: string | null;
  hoveredId: string | null;
  activeRoute: CityRoute | null;
  routeStep: number;
  prMode: boolean;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
}

type Emphasis = "idle" | "hover" | "selected" | "route";

// ─── one building ───────────────────────────────────────────────────────────
function Building({
  b,
  emphasis,
  dim,
  prMode,
  onSelect,
  onHover,
}: {
  b: CityBuilding;
  emphasis: Emphasis;
  dim: boolean;
  prMode: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const color = roleColor(b.role);
  const isController = b.role === "controller";
  const isInfra = b.role === "infrastructure";
  const isTest = b.role === "test";
  const isPRNew = b.prStatus === "added";
  const w = b.width;
  const h = b.height;
  const d = b.depth;

  useFrame(() => {
    const m = matRef.current;
    if (!m) return;
    const targetO = dim ? 0.22 : isPRNew ? 0.7 : 1;
    m.opacity += (targetO - m.opacity) * 0.1;
    // A faint base glow keeps our muted palette legible (dimmed neighbours stay
    // visible as a lived-in city rather than going black); it climbs on
    // hover / select / route.
    const targetE =
      emphasis === "route" ? 0.6 : emphasis === "selected" ? 0.45 : emphasis === "hover" ? 0.3 : dim ? 0.05 : 0.12;
    m.emissiveIntensity += (targetE - m.emissiveIntensity) * 0.15;
  });

  const material = (
    <meshStandardMaterial
      ref={matRef}
      color={color}
      emissive={color}
      emissiveIntensity={0}
      transparent
      opacity={1}
      metalness={isController ? 0.6 : isInfra ? 0.4 : 0.2}
      roughness={isController ? 0.2 : 0.5}
    />
  );

  // Landmark silhouettes — the reference's varied "church spires".
  let body: React.ReactNode;
  if (b.isLandmark && b.landmarkType === "skyscraper") {
    body = (
      <group>
        <mesh castShadow receiveShadow><boxGeometry args={[w, h * 0.85, d]} />{material}</mesh>
        <mesh position={[0, h * 0.5, 0]}><boxGeometry args={[w * 0.5, h * 0.3, d * 0.5]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.1} metalness={0.5} roughness={0.3} /></mesh>
        <mesh position={[0, h * 0.72, 0]}><cylinderGeometry args={[0.05, 0.05, h * 0.18, 8]} /><meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.5} /></mesh>
      </group>
    );
  } else if (b.isLandmark && b.landmarkType === "silo") {
    body = (
      <group>
        <mesh castShadow receiveShadow><cylinderGeometry args={[w * 0.5, w * 0.55, h, 12]} />{material}</mesh>
        <mesh position={[0, h * 0.5, 0]}><sphereGeometry args={[w * 0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.1} metalness={0.5} roughness={0.2} /></mesh>
      </group>
    );
  } else if (b.isLandmark && b.landmarkType === "facility") {
    body = (
      <group>
        <mesh castShadow receiveShadow><boxGeometry args={[w * 1.15, h * 0.7, d * 1.15]} />{material}</mesh>
        <mesh position={[w * 0.3, h * 0.5, 0]}><cylinderGeometry args={[0.1, 0.1, h * 0.6, 6]} /><meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={0.3} /></mesh>
      </group>
    );
  } else if (b.isLandmark && b.landmarkType === "gate") {
    body = (
      <group>
        <mesh position={[-w * 0.4, 0, 0]} castShadow><boxGeometry args={[w * 0.22, h * 1.15, d * 0.35]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.1} metalness={0.4} roughness={0.3} /></mesh>
        <mesh position={[w * 0.4, 0, 0]} castShadow><boxGeometry args={[w * 0.22, h * 1.15, d * 0.35]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.1} metalness={0.4} roughness={0.3} /></mesh>
        <mesh position={[0, h * 0.55, 0]}><boxGeometry args={[w * 1.1, h * 0.18, d * 0.4]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.15} metalness={0.5} roughness={0.2} /></mesh>
      </group>
    );
  } else if (b.isLandmark && b.landmarkType === "tower") {
    body = (
      <group>
        <mesh castShadow receiveShadow><boxGeometry args={[w, h, d]} />{material}</mesh>
        <mesh position={[0, h * 0.52, 0]}><boxGeometry args={[w * 0.6, h * 0.14, d * 0.6]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.06} metalness={0.4} roughness={0.3} /></mesh>
      </group>
    );
  } else {
    body = (
      <mesh castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        {material}
      </mesh>
    );
  }

  return (
    <group
      position={[b.x, h / 2, b.z]}
      onPointerDown={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); onSelect(b.id); }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); onHover(b.id); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { onHover(null); document.body.style.cursor = "default"; }}
    >
      {body}

      {/* Selection outline */}
      {emphasis === "selected" && (
        <mesh><boxGeometry args={[w + 0.15, h + 0.15, d + 0.15]} /><meshBasicMaterial color="#facc15" wireframe transparent opacity={0.6} /></mesh>
      )}

      {/* PR scaffolding — amber cage on changed, red on deleted, spire on added */}
      {prMode && b.prStatus === "modified" && (
        <mesh position={[0, h * 0.08, 0]}><boxGeometry args={[w + 0.22, h + 0.22, d + 0.22]} /><meshBasicMaterial color={AMBER} wireframe transparent opacity={0.55} /></mesh>
      )}
      {prMode && b.prStatus === "deleted" && (
        <mesh><boxGeometry args={[w + 0.2, h + 0.2, d + 0.2]} /><meshBasicMaterial color="#ef4444" wireframe transparent opacity={0.5} /></mesh>
      )}
      {prMode && isPRNew && (
        <mesh position={[0, h * 0.6, 0]}><boxGeometry args={[0.08, h * 0.5, 0.08]} /><meshStandardMaterial color="#4ade80" emissive="#4ade80" emissiveIntensity={0.5} /></mesh>
      )}

      {/* Test green roof */}
      {isTest && !dim && !b.isLandmark && (
        <mesh position={[0, h / 2 + 0.02, 0]}><boxGeometry args={[w + 0.02, 0.04, d + 0.02]} /><meshStandardMaterial color="#4ade80" emissive="#4ade80" emissiveIntensity={0.2} /></mesh>
      )}

      {/* Window glow lines on taller buildings */}
      {h > 1.5 && !dim && (
        <>
          {Array.from({ length: Math.min(Math.floor(h / 0.6), 6) }).map((_, i) => (
            <mesh key={i} position={[w / 2 + 0.01, -h / 2 + 0.5 + i * 0.6, 0]}>
              <planeGeometry args={[0.02, 0.16]} />
              <meshBasicMaterial color="#fef3c7" transparent opacity={0.3} />
            </mesh>
          ))}
        </>
      )}

      {/* Hover tooltip */}
      {emphasis === "hover" && (
        <Html position={[0, h / 2 + 0.6, 0]} center distanceFactor={22} zIndexRange={[40, 0]} style={{ pointerEvents: "none" }}>
          <div style={{ padding: "5px 9px", borderRadius: 8, background: "hsla(230,25%,7%,0.95)", border: "1px solid rgba(125,211,252,0.3)", color: "#e8e4dc", fontFamily: "var(--bpmn-font-mono, monospace)", fontSize: 11, whiteSpace: "nowrap" }}>
            <div style={{ fontWeight: 600 }}>{b.name}</div>
            <div style={{ color: "#8a8f97", fontSize: 9.5, marginTop: 2 }}>
              {b.lines} LOC · {b.role}{b.prStatus ? ` · ${b.prStatus}` : ""}
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

// ─── district platform ───────────────────────────────────────────────────────
function DistrictGround({ d, active }: { d: CityDistrict; active: boolean }) {
  return (
    <group position={[d.x + d.width / 2, -0.02, d.z + d.depth / 2]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[d.width, d.depth]} />
        <meshStandardMaterial color={d.color} transparent opacity={active ? 0.14 : 0.06} roughness={0.9} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <planeGeometry args={[d.width, d.depth]} />
        <meshBasicMaterial color={d.color} transparent opacity={0.16} wireframe />
      </mesh>
      <Html position={[0, 0.1, -d.depth / 2 + 0.5]} center distanceFactor={30} zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
        <div style={{ color: d.color, background: "hsla(230,25%,7%,0.7)", padding: "2px 7px", borderRadius: 5, fontFamily: "var(--bpmn-font-mono, monospace)", fontSize: 10, fontWeight: 600, whiteSpace: "nowrap" }}>
          {d.name}
        </div>
      </Html>
    </group>
  );
}

// ─── journey route — lit line + flowing particles ───────────────────────────
function RouteFlow({ points, color }: { points: THREE.Vector3[]; color: string }) {
  const dots = useRef<THREE.Group>(null);
  const N = 5;
  useFrame(({ clock }) => {
    const g = dots.current;
    if (!g || points.length < 2) return;
    const t = clock.getElapsedTime();
    g.children.forEach((child, i) => {
      const prog = (t * 0.25 + i / N) % 1;
      const seg = prog * (points.length - 1);
      const idx = Math.floor(seg);
      const frac = seg - idx;
      child.position.lerpVectors(points[idx], points[Math.min(idx + 1, points.length - 1)], frac);
    });
  });
  return (
    <group>
      <Line points={points} color={color} lineWidth={2.5} transparent opacity={0.9} />
      <group ref={dots}>
        {Array.from({ length: N }, (_, i) => (
          <mesh key={i}><sphereGeometry args={[0.14, 8, 8]} /><meshBasicMaterial color={color} transparent opacity={0.9} /></mesh>
        ))}
      </group>
    </group>
  );
}

// ─── camera rig — orbit + interruptible lerp to a focus ──────────────────────
export interface CameraFocus {
  center: [number, number, number];
  dist: number;
}
function CameraRig({ focus }: { focus: CameraFocus }) {
  const controls = useRef<any>(null);
  const { camera } = useThree();
  const tC = useRef(new THREE.Vector3(...focus.center));
  const tD = useRef(focus.dist);
  tC.current.set(...focus.center);
  tD.current = focus.dist;
  useFrame(() => {
    const c = controls.current;
    if (!c) return;
    c.target.lerp(tC.current, 0.06);
    const dir = camera.position.clone().sub(c.target);
    const curD = dir.length();
    if (Math.abs(curD - tD.current) > 0.4) {
      const nextD = curD + (tD.current - curD) * 0.06;
      dir.normalize().multiplyScalar(nextD);
      camera.position.copy(c.target).add(dir);
    }
    c.update();
  });
  return (
    <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.08} minDistance={6} maxDistance={400} maxPolarAngle={Math.PI / 2.2} minPolarAngle={0.25} />
  );
}

// ─── scene ───────────────────────────────────────────────────────────────────
function Scene({ model, selectedId, hoveredId, activeRoute, routeStep, prMode, onSelect, onHover }: CityCanvasProps) {
  const { buildings, districts, extent } = model.layout;

  const routeSet = useMemo(() => new Set(activeRoute?.buildingIds ?? []), [activeRoute]);
  const routePoints = useMemo(() => {
    if (!activeRoute) return [];
    return activeRoute.buildingIds
      .map((id) => model.buildingById.get(id))
      .filter((b): b is CityBuilding => !!b)
      .map((b) => new THREE.Vector3(b.x, 0.4, b.z));
  }, [activeRoute, model]);

  // Always render the (already thinned) city; PR mode DIMS the untouched
  // buildings to ghosts rather than hiding them, so the changed buildings pop
  // with their neighbourhood around them — the reference's PR-review look, and
  // far better than a handful of specks scattered across empty platforms.
  const visible = buildings;

  const routeFocusId = activeRoute && routeStep >= 0 ? activeRoute.buildingIds[routeStep] : null;
  const activeDistrict = useMemo(() => {
    const id = selectedId ?? routeFocusId;
    return id ? model.buildingById.get(id)?.districtId : undefined;
  }, [selectedId, routeFocusId, model]);

  const focus: CameraFocus = useMemo(() => {
    const at = (b?: CityBuilding): CameraFocus | null =>
      b ? { center: [b.x, b.height / 2 + 1, b.z], dist: Math.max(12, b.height * 2 + 10) } : null;
    if (routeFocusId) { const f = at(model.buildingById.get(routeFocusId)); if (f) return f; }
    if (selectedId) { const f = at(model.buildingById.get(selectedId)); if (f) return f; }
    if (prMode) {
      const changed = buildings.filter((b) => b.prStatus === "modified" || b.prStatus === "added" || b.prStatus === "deleted");
      if (changed.length > 0) {
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (const b of changed) { minX = Math.min(minX, b.x); maxX = Math.max(maxX, b.x); minZ = Math.min(minZ, b.z); maxZ = Math.max(maxZ, b.z); }
        const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
        const span = Math.max(maxX - minX, maxZ - minZ, 10);
        return { center: [cx, 1, cz], dist: span * 1.5 + 16 };
      }
    }
    return { center: [0, 0, 0], dist: extent * 2.3 + 16 };
  }, [routeFocusId, selectedId, prMode, visible, model, extent]);

  return (
    <>
      <color attach="background" args={[CLEAR]} />
      <fog attach="fog" args={[CLEAR, extent * 1.5, extent * 3.8]} />

      <ambientLight intensity={0.3} color="#c4b5fd" />
      <directionalLight
        position={[extent * 0.6, extent * 0.9, extent * 0.35]}
        intensity={0.65}
        color="#fef3c7"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={extent * 4}
        shadow-camera-left={-extent * 1.2}
        shadow-camera-right={extent * 1.2}
        shadow-camera-top={extent * 1.2}
        shadow-camera-bottom={-extent * 1.2}
      />
      <pointLight position={[-extent * 0.4, extent * 0.6, -extent * 0.7]} intensity={0.2} color="#818cf8" />
      <hemisphereLight intensity={0.15} color="#c4b5fd" groundColor="#1e1b4b" />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]} receiveShadow onPointerMissed={() => onSelect(null)}>
        <planeGeometry args={[extent * 5, extent * 5]} />
        <meshStandardMaterial color={GROUND} roughness={0.95} metalness={0.05} />
      </mesh>

      {districts.map((d) => (
        <DistrictGround key={d.id} d={d} active={activeDistrict === d.id} />
      ))}

      {visible.map((b) => {
        const inRoute = routeSet.has(b.id);
        const focused = b.id === selectedId || b.id === hoveredId || inRoute;
        const emphasis: Emphasis =
          b.id === selectedId ? "selected" : b.id === routeFocusId || inRoute ? "route" : b.id === hoveredId ? "hover" : "idle";
        // Dim: untouched buildings in PR mode, and off-route buildings while a
        // route is active. Changed / focused buildings always stay lit.
        const dim =
          !focused &&
          ((prMode && !b.prStatus) || (!!activeRoute && !inRoute && !prMode));
        return (
          <Building key={b.id} b={b} emphasis={emphasis} dim={dim} prMode={prMode} onSelect={onSelect} onHover={onHover} />
        );
      })}

      {routePoints.length >= 2 && <RouteFlow points={routePoints} color={AMBER} />}

      <CameraRig focus={focus} />
    </>
  );
}

const CityCanvas = (props: CityCanvasProps) => {
  const extent = props.model.layout.extent;
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [extent * 0.95, extent * 1.05, extent * 1.4], fov: 45, near: 0.1, far: extent * 14 }}
      gl={{ antialias: true, alpha: false }}
      onCreated={({ gl }) => {
        gl.setClearColor(CLEAR);
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.2;
      }}
    >
      <Scene {...props} />
    </Canvas>
  );
};

export default CityCanvas;
