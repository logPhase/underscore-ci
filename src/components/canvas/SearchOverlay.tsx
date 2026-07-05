import { getComponentFunctions, getRegionCenter } from "@/lib/canvas/get-data";
import { getAllFiles } from "@/lib/canvas/get-files";
import { useAnalysis } from "@/store/use-analysis-store";
import { useFocusStore } from "@/store/use-focus-store";
import { useUIStore } from "@/store/use-ui-store";
import { useViewportStore } from "@/store/use-viewport-store";
import { Search, X } from "lucide-react";
import { RefObject, useEffect, useMemo, useState } from "react";
import { Button } from "../ui/button";
import { cn } from "@/lib/misc-utils";

interface Props {
  containerRef: RefObject<HTMLDivElement>;
}

export function SearchOverlay({ containerRef }: Props) {
  const hasPrOverlay = useAnalysis((s) => s.transformedData?.prData);
  const services = useAnalysis((s) => s.transformedData?.services);
  const sharedLibs = useAnalysis((s) => s.transformedData?.sharedLibs);
  const zoomTo = useViewportStore((s) => s.zoomTo);

  const setFocusedPackageId = useFocusStore((s) => s.setFocusedPackageId);
  const setFocusedServiceId = useFocusStore((s) => s.setFocusedServiceId);
  const searchOpen = useUIStore((s) => s.searchOpen);
  const setSearchOpen = useUIStore((s) => s.setSearchOpen);

  const [query, setQuery] = useState("");

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Cmd+K belongs to the global command palette (command-palette.tsx);
      // search opens via the toolbar button.
      if (e.key === "Escape") {
        if (searchOpen) {
          setSearchOpen(false);
          setQuery("");
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [searchOpen, setSearchOpen]);

  const results = useMemo(() => {
    if (!query || query.length < 2) return [];
    const q = query.toLowerCase();
    const items: {
      id: string;
      label: string;
      type: string;
      regionId: string;
      description?: string;
    }[] = [];
    for (const svc of services) {
      if (
        svc.name.toLowerCase().includes(q) ||
        svc.id.toLowerCase().includes(q)
      ) {
        items.push({
          id: svc.id,
          label: svc.name,
          type: "service",
          regionId: svc.id,
        });
      }
    }
    for (const lib of sharedLibs) {
      if (lib.name.toLowerCase().includes(q)) {
        items.push({
          id: lib.id,
          label: lib.name,
          type: "shared",
          regionId: lib.id,
        });
      }
    }
    const allFiles = getAllFiles();
    for (const f of allFiles) {
      if (
        f.name.toLowerCase().includes(q) ||
        f.path.toLowerCase().includes(q)
      ) {
        items.push({
          id: f.id,
          label: f.name,
          type: f.service,
          regionId: f.service,
        });
      }
      if (items.length >= 50) break;
    }
    // Search methods/functions by name across all files
    if (items.length < 50) {
      for (const f of allFiles) {
        const fns = getComponentFunctions(f.id);
        for (const fn of fns) {
          if (fn.name.toLowerCase().includes(q)) {
            const preview =
              fn.description && fn.description.split(/\s+/).length > 5
                ? fn.description.slice(0, 60) +
                  (fn.description.length > 60 ? "..." : "")
                : f.name;
            items.push({
              id: f.id,
              label: `${fn.name}()`,
              type: f.service,
              regionId: f.service,
              description: preview,
            });
          }
          if (items.length >= 50) break;
        }
        if (items.length >= 50) break;
      }
    }
    return items.slice(0, 50);
  }, [query, services, sharedLibs]);

  const handleSelect = (item: (typeof results)[0]) => {
    const center = getRegionCenter(item.regionId);
    if (!center || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const isService = item.type === "service" || item.type === "shared";

    if (isService) {
      // Zoom to service overview
      setFocusedServiceId(item.regionId);
      zoomTo(center.cx, center.cy, 2.5, rect.width, rect.height);
    } else {
      // File or method result: drill down to the file
      const file = getAllFiles().find(
        (f) => f.id === item.id || f.name === item.label
      );
      if (file) {
        setFocusedServiceId(file.service);
        setFocusedPackageId(`${file.service}/${file.pkg}`);
        // Zoom deep enough to see files (L2+)
        zoomTo(center.cx, center.cy, 4.5, rect.width, rect.height);
      } else {
        zoomTo(center.cx, center.cy, 8, rect.width, rect.height);
      }
    }
    setSearchOpen(false);
  };

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  };

  const closeSearchOpen = () => {
    setSearchOpen(false);
  };

  if (!searchOpen) {
    return (
      <Button
        onClick={() => setSearchOpen(true)}
        onWheel={(e) => e.stopPropagation()}
        variant="ghost"
        className={cn(
          // One top-right cluster with the Groups chip: shared --cw-stats
          // tokens, the same quiet-at-rest treatment (bpmn-quiet-chrome),
          // matching z-index, and the SAME PR-banner offset so the two
          // never sit at mismatched heights under the banner.
          "bpmn-quiet-chrome absolute right-50 z-40 flex h-fit cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-xs",
          hasPrOverlay ? "top-4 mt-15" : "top-4"
        )}
        style={{
          background: "var(--cw-stats-bg)",
          backdropFilter: "blur(8px)",
          border: "1px solid var(--cw-stats-border)",
          color: "var(--cw-stats-text)",
        }}
      >
        {/* Cmd+K belongs to the command palette now — no shortcut hint */}
        <Search size={13} />
        <span className="font-mono">Search</span>
      </Button>
    );
  }

  return (
    <div
      className="absolute inset-0 z-60 flex items-start justify-center pt-[15vh]"
      onClick={closeSearchOpen}
    >
      <div
        className="w-[460px] animate-scale-in overflow-hidden rounded-xl shadow-2xl"
        style={{
          background: "hsl(220, 20%, 9%)",
          border: "1px solid hsl(220, 15%, 22%)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div
          className="flex items-center gap-2 border-b px-4 py-3"
          style={{ borderColor: "hsl(220, 15%, 18%)" }}
        >
          <Search size={15} style={{ color: "hsl(210, 15%, 45%)" }} />
          <input
            autoFocus
            value={query}
            onChange={handleQueryChange}
            placeholder="Search files, methods, services..."
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: "hsl(210, 20%, 88%)" }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setSearchOpen(false);
              if (e.key === "Enter" && results.length > 0)
                handleSelect(results[0]);
            }}
          />
          <button onClick={closeSearchOpen}>
            <X size={14} style={{ color: "hsl(210, 15%, 45%)" }} />
          </button>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="max-h-[300px] overflow-y-auto py-1">
            {results.map((item) => (
              <button
                key={item.id}
                onClick={() => handleSelect(item)}
                className="flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-white/5"
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{
                    background:
                      item.type === "shared"
                        ? "hsl(210, 20%, 45%)"
                        : `hsl(${services.findIndex((s) => s.id === item.regionId) * 60}, 50%, 50%)`,
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div
                    className="truncate text-xs font-medium"
                    style={{ color: "hsl(210, 20%, 82%)" }}
                  >
                    {item.label}
                  </div>
                  <div
                    className="truncate font-mono text-[10px]"
                    style={{ color: "hsl(210, 15%, 42%)" }}
                  >
                    {item.description || item.type}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {query.length >= 2 && results.length === 0 && (
          <div
            className="px-4 py-6 text-center text-xs"
            style={{ color: "hsl(210, 15%, 40%)" }}
          >
            No results found
          </div>
        )}
      </div>
    </div>
  );
}
