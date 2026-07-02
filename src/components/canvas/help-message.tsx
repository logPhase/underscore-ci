import { useUIStore } from "@/store/use-ui-store";
import { useEffect, useState } from "react";

export const HelpMessage = () => {
  const helpOpen = useUIStore((state) => state.helpOpen);
  const setHelpOpen = useUIStore((state) => state.setHelpOpen);

  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 6000);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      {helpOpen && (
        <div
          className="absolute inset-0 z-70 flex items-center justify-center"
          onClick={() => setHelpOpen(false)}
        >
          <div
            className="max-h-[85vh] w-[340px] overflow-auto rounded-xl p-5 font-mono text-xs"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "hsl(220, 22%, 9%)",
              border: "1px solid hsl(210, 15%, 22%)",
              boxShadow: "0 16px 48px hsl(220, 22%, 4%, 0.7)",
            }}
          >
            <div className="mb-3 flex items-center justify-between">
              <span
                className="text-sm font-semibold"
                style={{ color: "hsl(210, 20%, 80%)" }}
              >
                Keyboard Shortcuts
              </span>
              <button
                onClick={() => setHelpOpen(false)}
                style={{ color: "hsl(210, 15%, 45%)" }}
              >
                ESC
              </button>
            </div>
            {[
              ["\u2318K", "Search"],
              ["ESC", "Back one level"],
              ["\u2190 \u2192", "Navigate call chain"],
              ["?", "Toggle this help"],
            ].map(([key, desc]) => (
              <div
                key={key}
                className="flex justify-between py-1"
                style={{ borderBottom: "1px solid hsl(220, 15%, 14%)" }}
              >
                <span style={{ color: "hsl(180, 50%, 60%)" }}>{key}</span>
                <span style={{ color: "hsl(210, 15%, 55%)" }}>{desc}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {visible && (
        <div
          className="pointer-events-none absolute bottom-8 left-1/2 z-30 -translate-x-1/2 animate-fade-in rounded-lg px-4 py-2 font-mono text-xs"
          style={{
            background: "hsl(220, 22%, 10%, 0.9)",
            border: "1px solid hsl(210, 15%, 22%)",
            color: "hsl(210, 20%, 60%)",
            backdropFilter: "blur(8px)",
            transition: "opacity 0.5s ease",
          }}
        >
          Click a service to explore &middot; Scroll to zoom &middot; Press{" "}
          <span style={{ color: "hsl(180, 50%, 60%)" }}>?</span> for shortcuts
        </div>
      )}
    </>
  );
};
