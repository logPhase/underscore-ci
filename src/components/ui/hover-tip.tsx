import { Tooltip as TooltipPrimitive } from "radix-ui";
import { cn } from "@/lib/misc-utils";
import { memo } from "react";

/**
 * HoverTip — drop-in replacement for native `title=`. Wraps a single child
 * (asChild, no extra DOM) and shows a styled tooltip matching the canvas
 * aesthetic. Keep `tip` short; multi-line allowed via "\n".
 */
interface HoverTipProps {
  tip: React.ReactNode;
  children: React.ReactElement;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  delayMs?: number;
  className?: string;
}

const HoverTip: React.FC<HoverTipProps> = ({
  tip,
  children,
  side = "top",
  align = "center",
  delayMs = 250,
  className,
}) => {
  if (tip == null || tip === "") return children;
  // For dotted/slashed strings (FQNs, paths) insert zero-width spaces so the
  // browser prefers breaking at segment boundaries over mid-identifier when
  // [overflow-wrap:anywhere] kicks in. No-op for non-string tips.
  const tipContent =
    typeof tip === "string" ? tip.replace(/([./\\])/g, "$1​") : tip;
  return (
    <TooltipPrimitive.Root delayDuration={delayMs}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          className={cn(
            "z-100 max-w-xs rounded-md px-2.5 py-1.5 font-mono text-[11px] leading-snug " +
              "wrap-anywhere whitespace-pre-line shadow-lg shadow-black/40 select-none " +
              "animate-in fade-in-0 zoom-in-95 " +
              "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 " +
              "data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1 " +
              "data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 " +
              (className ?? "")
          )}
          style={{
            background: "hsl(220, 22%, 9%)",
            border: "1px solid hsl(210, 15%, 22%)",
            color: "hsl(210, 20%, 82%)",
            backdropFilter: "blur(6px)",
          }}
        >
          {tipContent}
          <TooltipPrimitive.Arrow
            width={10}
            height={5}
            style={{ fill: "hsl(220, 22%, 9%)" }}
          />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
};

export default memo(HoverTip);
