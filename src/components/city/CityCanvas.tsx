import { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html, Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { CityBuilding, CityDistrict } from "@/lib/city-layout";
import type { CityModel, CityRoute } from "@/lib/city-data";

/**
 * CityCanvas — the Code City. A deterministic squarified-treemap city
 * (districts = module groups, buildings = files, height ∝ lines) rendered in
 * three.js. The polish is borrowed wholesale from the agent-symphony reference
 * recipe: ACES-filmic tone mapping + emissive materials (no bloom pass) under a
 * warm key / cool violet fill, with fog fading into the clear colour. Selecting
 * a journey lights an ordered route through the buildings and flies the camera
 * from stop to stop.
 *
 * Every domain decision (positions, sizes, colours, which files, which routes)
 * is precomputed upstream in city-layout / city-data — this file only renders
 * and handles the camera + hit-testing, per the project's backend/frontend
 * split.
 */

const CLEAR = "#0b0e1a";
const GROUND = "#111421";

// Muted role palette — one family, matched to the app's --bpmn accents. Keyed
// by substring so it survives whatever exact role vocabulary the analyzer emits.
const ROLE_COLORS: [string, string][] = [
  ["controller", "#e0996b"],
  ["endpoint", "#e0996b"],
  ["api", "#e0996b"],
  ["handler", "#6bb6c9"],
  ["service", "#6bb6c9"],
  ["model", "#9b87c4"],
  ["entity", "#9b87c4"],
  ["domain", "#9b87c4"],
  ["repository", "#7fae8e"],
  ["persistence", "#7fae8e"],
  ["data", "#7fae8e"],
  ["infrastructure", "#d18fae"],
  ["config", "#a1a1aa"],
  ["test", "#7dd3ae"],
  ["util", "#8a8f97"],
];
function roleColor(role: string): string {
  const r = (role || "").toLowerCase();
  for (const [k, c] of ROLE_COLORS) if (r.includes(k)) return c;
  return "#7d92ab"; // slate — lifted off drab navy so the mass keeps some life
}

const AMBER = "#e8b923";

export interface CameraFocus {
  center: [number, number, number];
  dist: number;
}

interface CityCanvasProps {
  model: CityModel;
  selectedId: string | null;
  hoveredId: string | null;
  activeRoute: CityRoute | null;
  routeStep: number; // index into activeRoute.buildingIds, or -1 for "whole route"
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
}

// ─── one building ───────────────────────────────────────────────────────────
function Building({
  b,
  color,
  state,
  dim,
  onSelect,
  onHover,
}: {
  b: CityBuilding;
  color: string;
  state: "idle" | "hover" | "selected" | "route";
  dim: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  const matRef = useRef<THREE.MeshStandardMaterial>(null);

  // Emissive intensity + opacity are lerped, never snapped — the reference's
  // trick for buttery hover/select transitions and focus+context dimming.
  useFrame(() => {
    const m = matRef.current;
    if (!m) return;
    // A faint base glow (our role palette is more muted than the reference's,
    // so a touch of self-emissive keeps the massed buildings from going drab
    // navy under the low light) that climbs on hover / select / route.
    const targetE =
      state === "route" ? 0.9 : state === "selected" ? 0.65 : state === "hover" ? 0.4 : 0.08;
    const targetO = dim ? 0.14 : 1;
    m.emissiveIntensity += (targetE - m.emissiveIntensity) * 0.15;
    m.opacity += (targetO - m.opacity) * 0.12;
  });

  const cy = b.height / 2;
  const landmark = b.isLandmark;
  const metalness = landmark ? 0.45 : 0.2;
  const roughness = landmark ? 0.3 : 0.55;

  return (
    <group position={[b.x, 0, b.z]}>
      <mesh
        position={[0, cy, 0]}
        castShadow
        receiveShadow
        onPointerDown={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          onSelect(b.id);
        }}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          onHover(b.id);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          onHover(null);
          document.body.style.cursor = "default";
        }}
      >
        <boxGeometry args={[b.width, b.height, b.depth]} />
        <meshStandardMaterial
          ref={matRef}
          color={color}
          emissive={color}
          emissiveIntensity={0}
          metalness={metalness}
          roughness={roughness}
          transparent
          opacity={1}
        />
      </mesh>

      {/* Landmark caps — the "church spire" orientation anchors. */}
      {landmark && b.landmarkType === "skyscraper" && (
        <mesh position={[0, b.height + 0.9, 0]}>
          <cylinderGeometry args={[0.06, 0.06, 1.8, 6]} />
          <meshStandardMaterial color={AMBER} emissive={AMBER} emissiveIntensity={1.1} />
        </mesh>
      )}
      {landmark && b.landmarkType === "tower" && (
        <mesh position={[0, b.height + 0.35, 0]}>
          <boxGeometry args={[b.width * 0.5, 0.7, b.depth * 0.5]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} metalness={0.4} roughness={0.3} />
        </mesh>
      )}

      {/* Selection outline — an amber wireframe box, slightly larger. */}
      {state === "selected" && (
        <mesh position={[0, cy, 0]}>
          <boxGeometry args={[b.width + 0.18, b.height + 0.18, b.depth + 0.18]} />
          <meshBasicMaterial color={AMBER} wireframe transparent opacity={0.6} />
        </mesh>
      )}

      {/* Hover label. */}
      {state === "hover" && (
        <Html position={[0, b.height + 1.4, 0]} center distanceFactor={26} zIndexRange={[40, 0]}>
          <div
            style={{
              padding: "5px 9px",
              borderRadius: 7,
              background: "hsla(228,30%,7%,0.92)",
              border: "1px solid rgba(125,211,252,0.35)",
              color: "#e8e4dc",
              fontFamily: "var(--bpmn-font-mono, monospace)",
              fontSize: 11,
              whiteSpace: "nowrap",
              pointerEvents: "none",
            }}
          >
            <div style={{ fontWeight: 600 }}>{b.name}</div>
            <div style={{ color: "#8a8f97", fontSize: 9.5, marginTop: 1 }}>
              {b.lines} lines{b.isLandmark ? " · landmark" : ""}
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

// ─── a district platform ─────────────────────────────────────────────────────
function DistrictGround({ d, active }: { d: CityDistrict; active: boolean }) {
  const cx = d.x + d.width / 2;
  const cz = d.z + d.depth / 2;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, -0.02, cz]} receiveShadow>
        <planeGeometry args={[d.width, d.depth]} />
        <meshStandardMaterial color={d.color} transparent opacity={active ? 0.16 : 0.07} roughness={0.9} metalness={0.05} />
      </mesh>
      {/* faint border */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, -0.015, cz]}>
        <planeGeometry args={[d.width, d.depth]} />
        <meshBasicMaterial color={d.color} wireframe transparent opacity={0.14} />
      </mesh>
      <Html position={[d.x + 0.6, 0.02, d.z + 1.4]} distanceFactor={30} zIndexRange={[20, 0]} pointerEvents="none">
        <div
          style={{
            color: d.color,
            background: "hsla(228,30%,7%,0.66)",
            padding: "2px 7px",
            borderRadius: 5,
            fontFamily: "var(--bpmn-font-mono, monospace)",
            fontSize: 10,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          {d.name} · {d.buildingCount}
        </div>
      </Html>
    </group>
  );
}

// ─── journey route — a lit line + flowing particles ─────────────────────────
function RouteFlow({ points, color }: { points: THREE.Vector3[]; color: string }) {
  const dots = useRef<THREE.Group>(null);
  const N = 6;
  useFrame(({ clock }) => {
    const g = dots.current;
    if (!g || points.length < 2) return;
    const t = clock.getElapsedTime();
    g.children.forEach((child, i) => {
      const prog = (t * 0.18 + i / N) % 1;
      const seg = prog * (points.length - 1);
      const idx = Math.floor(seg);
      const frac = seg - idx;
      const a = points[idx];
      const bpt = points[Math.min(idx + 1, points.length - 1)];
      child.position.lerpVectors(a, bpt, frac);
    });
  });
  return (
    <group>
      <Line points={points} color={color} lineWidth={2.6} transparent opacity={0.92} />
      <group ref={dots}>
        {Array.from({ length: N }, (_, i) => (
          <mesh key={i}>
            <sphereGeometry args={[0.28, 10, 10]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.4} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// ─── camera rig — orbit + interruptible lerp to a focus ──────────────────────
function CameraRig({ focus }: { focus: CameraFocus }) {
  const controls = useRef<any>(null);
  const { camera } = useThree();
  const targetC = useRef(new THREE.Vector3(...focus.center));
  const targetD = useRef(focus.dist);
  targetC.current.set(...focus.center);
  targetD.current = focus.dist;

  useFrame(() => {
    const c = controls.current;
    if (!c) return;
    c.target.lerp(targetC.current, 0.06);
    const dir = camera.position.clone().sub(c.target);
    const curD = dir.length();
    const nextD = curD + (targetD.current - curD) * 0.06;
    dir.normalize().multiplyScalar(nextD);
    camera.position.copy(c.target).add(dir);
    c.update();
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={6}
      maxDistance={400}
      maxPolarAngle={Math.PI / 2.15}
      minPolarAngle={0.2}
    />
  );
}

// ─── the scene ───────────────────────────────────────────────────────────────
function Scene({ model, selectedId, hoveredId, activeRoute, routeStep, onSelect, onHover }: CityCanvasProps) {
  const { buildings, districts, extent } = model.layout;

  const routeSet = useMemo(
    () => new Set(activeRoute?.buildingIds ?? []),
    [activeRoute]
  );
  const routePoints = useMemo(() => {
    if (!activeRoute) return [];
    return activeRoute.buildingIds
      .map((id) => model.buildingById.get(id))
      .filter((b): b is CityBuilding => !!b)
      .map((b) => new THREE.Vector3(b.x, b.height + 0.6, b.z));
  }, [activeRoute, model]);

  // Camera focus: a route stop, else the selection, else the whole city.
  const focus: CameraFocus = useMemo(() => {
    const focusOn = (b?: CityBuilding): CameraFocus | null =>
      b ? { center: [b.x, b.height / 2 + 1, b.z], dist: Math.max(14, b.height * 2 + 12) } : null;
    if (activeRoute && routeStep >= 0) {
      const id = activeRoute.buildingIds[routeStep];
      const f = focusOn(model.buildingById.get(id));
      if (f) return f;
    }
    if (selectedId) {
      const f = focusOn(model.buildingById.get(selectedId));
      if (f) return f;
    }
    return { center: [0, 0, 0], dist: extent * 2.4 + 20 };
  }, [activeRoute, routeStep, selectedId, model, extent]);

  const activeDistrict = useMemo(() => {
    const id = selectedId ?? (routeStep >= 0 ? activeRoute?.buildingIds[routeStep] : undefined);
    return id ? model.buildingById.get(id)?.districtId : undefined;
  }, [selectedId, routeStep, activeRoute, model]);

  const routeFocusId = activeRoute && routeStep >= 0 ? activeRoute.buildingIds[routeStep] : null;

  return (
    <>
      <color attach="background" args={[CLEAR]} />
      <fog attach="fog" args={[CLEAR, extent * 1.6, extent * 4.2]} />

      <ambientLight intensity={0.42} color="#c4b5fd" />
      <directionalLight
        position={[extent * 0.7, extent * 1.1, extent * 0.5]}
        intensity={0.95}
        color="#fde6c4"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={extent * 4}
        shadow-camera-left={-extent}
        shadow-camera-right={extent}
        shadow-camera-top={extent}
        shadow-camera-bottom={-extent}
      />
      <pointLight position={[-extent * 0.6, extent, -extent]} intensity={0.25} color="#818cf8" />
      <hemisphereLight intensity={0.18} color="#c4b5fd" groundColor="#0e1020" />

      {/* base plane */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.1, 0]}
        receiveShadow
        onPointerMissed={() => onSelect(null)}
      >
        <planeGeometry args={[extent * 4, extent * 4]} />
        <meshStandardMaterial color={GROUND} roughness={0.96} metalness={0.04} />
      </mesh>

      {districts.map((d) => (
        <DistrictGround key={d.id} d={d} active={activeDistrict === d.id} />
      ))}

      {buildings.map((b) => {
        const routeActive = !!activeRoute;
        const inRoute = routeSet.has(b.id);
        const state: "idle" | "hover" | "selected" | "route" =
          b.id === selectedId
            ? "selected"
            : b.id === routeFocusId
              ? "route"
              : b.id === hoveredId
                ? "hover"
                : inRoute
                  ? "route"
                  : "idle";
        // Focus+context: when a route is active, everything off it recedes.
        const dim = routeActive && !inRoute && b.id !== selectedId && b.id !== hoveredId;
        return (
          <Building
            key={b.id}
            b={b}
            color={roleColor(b.role)}
            state={state}
            dim={dim}
            onSelect={onSelect}
            onHover={onHover}
          />
        );
      })}

      {routePoints.length >= 2 && (
        <RouteFlow points={routePoints} color={AMBER} />
      )}

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
      camera={{ position: [extent * 1.35, extent * 0.95, extent * 1.85], fov: 45, near: 0.1, far: extent * 12 }}
      gl={{ antialias: true, alpha: false }}
      onCreated={({ gl }) => {
        gl.setClearColor(CLEAR);
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.3;
      }}
    >
      <Scene {...props} />
    </Canvas>
  );
};

export default CityCanvas;
