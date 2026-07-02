import { useBlobPaths } from "@/hooks/canvas/use-blob-paths";
import { usePRAffectedData } from "@/hooks/canvas/use-pr-affected-data";
import { MonoService } from "@/types/analysis";
import { memo } from "react";

const PRGlowRing = ({ svc }: { svc: MonoService }) => {
  const { prFileCountByService } = usePRAffectedData();
  const blobPaths = useBlobPaths();
  const fileCount = prFileCountByService.get(svc.id) || 1;
  const ringWidth = Math.min(8, 2.5 + fileCount * 0.9);
  const path = blobPaths[svc.id];
  return (
    <g
      className="pointer-events-none"
      // removed temporarily due to high performance cost
      // style={{
      //   filter: "drop-shadow(0 0 6px hsla(35, 90%, 55%, 0.55))",
      // }}
    >
      {/* Soft outer halo */}
      <path
        d={path}
        fill="none"
        stroke="var(--cw-warn-glow-1)"
        strokeWidth={ringWidth + 4}
        opacity={0.18}
      />
      {/* Crisp inner ring with pulse */}
      <path
        d={path}
        fill="none"
        stroke="var(--cw-warn-glow-2)"
        strokeWidth={ringWidth}
        opacity={0.9}
      >
        <animate
          attributeName="opacity"
          values="0.65;1;0.65"
          dur="2.4s"
          repeatCount="indefinite"
        />
      </path>
    </g>
  );
};

export default memo(PRGlowRing);
