import { applyTheme, loadTheme } from "./lib/theme";
// Theme before first paint — dark by default, paper via the banner toggle.
applyTheme(loadTheme());

// Code font — JetBrains Mono, designed for source reading (tall
// x-height, unambiguous 0Oo/1lI). Applied via --code-font in index.css.
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
// Reading font — Literata, designed for long-form digital reading
// (Google Play Books face). The journey narratives are READ, at length —
// mono is for data, not prose. Applied via .prose-read in index.css.
import "@fontsource/literata/400.css";
import "@fontsource/literata/400-italic.css";
import "@fontsource/literata/600.css";
// BPMN diagram fonts — IBM Plex Mono is the engineering data voice of
// every --bpmn-font-mono surface; Fraunces (italic) is the display voice
// of diagram/journey titles via --bpmn-font-display. Bundled via
// @fontsource (not the network-only Google import) so the packaged
// Electron renderer has them offline, like JetBrains Mono and Literata.
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "@fontsource/fraunces/400.css";
import "@fontsource/fraunces/400-italic.css";
import "@fontsource/fraunces/500-italic.css";
import "@fontsource/fraunces/600-italic.css";

import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
