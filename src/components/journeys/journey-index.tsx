import HoverTip from "@/components/ui/hover-tip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { STATUS_DEFINITIONS } from "@/data/journeys";
import { copyToClipboard } from "@/lib/misc-utils";
import { Check, Copy, HelpCircle } from "lucide-react";
import { useState } from "react";

export const FqnRow: React.FC<{ fqn: string }> = ({ fqn }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      copyToClipboard(fqn, "Copied FQN to clipboard");
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard API unavailable — silently no-op.
    }
  };
  return (
    <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
      <HoverTip tip={fqn} side="bottom" align="start">
        <p
          className="min-w-0 flex-1 truncate text-left font-mono text-[10px] text-zinc-400"
          style={{ direction: "rtl" }}
        >
          <bdi>{fqn}</bdi>
        </p>
      </HoverTip>
      <HoverTip tip={copied ? "Copied" : "Copy FQN"}>
        <button
          type="button"
          onClick={handleCopy}
          onMouseDown={(e) => e.stopPropagation()}
          className="shrink-0 rounded p-0.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          aria-label="Copy FQN"
        >
          {copied ? (
            <Check className="h-3 w-3 text-emerald-400" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </button>
      </HoverTip>
    </div>
  );
};

export const StatusLegend: React.FC = () => (
  <Popover>
    <PopoverTrigger asChild>
      <button
        type="button"
        aria-label="What do these statuses mean?"
        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-zinc-700 text-zinc-400 transition-colors hover:border-zinc-500 hover:bg-zinc-800/60 hover:text-zinc-200"
      >
        <HelpCircle className="h-4 w-4" />
      </button>
    </PopoverTrigger>
    <PopoverContent
      align="start"
      sideOffset={8}
      className="w-96 border-zinc-800 bg-zinc-950 p-4 text-zinc-200"
    >
      <div className="mb-3 font-mono text-sm font-semibold text-zinc-100">
        PR journey statuses
      </div>
      <ul className="space-y-3">
        {STATUS_DEFINITIONS.map(({ key, label, dot, description }) => (
          <li key={key} className="flex gap-3 text-[12.5px] leading-snug">
            <span className={`${dot} mt-1.5 h-2 w-2 shrink-0 rounded-full`} />
            <div>
              <div className="font-mono font-semibold text-zinc-100">
                {label}
              </div>
              <div className="text-zinc-400">{description}</div>
            </div>
          </li>
        ))}
      </ul>
    </PopoverContent>
  </Popover>
);
