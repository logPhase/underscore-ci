import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PointerEventsGuard } from "./components/pointer-events-guard";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import SessionShell from "./components/layout/session-shell";
import NotFound from "./pages/NotFound";
import { CanvasWorldPage } from "./pages/canvas-world";
import ChapterPage from "./pages/chapter";
import JourneyPage from "./pages/journeys";
import FindingsPage from "./pages/findings";
import ArchitecturePage from "./pages/architecture";
import ReportLoader from "./pages/report-loader";
import SpecsPage from "./pages/specs";

const App = () => {
  return (
    <TooltipProvider>
      <Toaster />
      {/* Clears a leaked Radix `body { pointer-events: none }` lock so a
          modal whose close was interrupted can't kill all popups. */}
      <PointerEventsGuard />
      <HashRouter>
        <Routes>
          <Route path="/" element={<ReportLoader />} />
          {/* Session workspace — persistent left rail around the data
              routes; SessionShell redirects to the loader when no report
              is loaded. */}
          <Route element={<SessionShell />}>
            <Route path="/canvas" element={<CanvasWorldPage />} />
            <Route path="/architecture" element={<ArchitecturePage />} />
            <Route path="/journeys" element={<JourneyPage />} />
            <Route path="/journeys/:chapterSlug" element={<ChapterPage />} />
            <Route path="/specs" element={<SpecsPage />} />
            <Route path="/findings" element={<FindingsPage />} />
          </Route>
          {/* Legacy canvas path — kept working for old deep links. */}
          <Route path="/home" element={<Navigate to="/canvas" replace />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </HashRouter>
    </TooltipProvider>
  );
};

export default App;
