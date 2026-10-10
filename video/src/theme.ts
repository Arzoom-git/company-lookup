import { loadFont } from "@remotion/google-fonts/NotoSansTC";
import { Easing } from "remotion";

export const { fontFamily } = loadFont("normal", { weights: ["400", "500", "700"], ignoreTooManyRequestsWarning: true });

// 跟產品裡的面板（addon/Sidebar.html）、Google 試算表同一組顏色
export const C = {
  bg: "#0f1c2e",
  bgGlow: "#1a3a63",
  ink: "#202124",
  muted: "#5f6368",
  line: "#dadce0",
  grid: "#e1e3e6",
  head: "#f8f9fa",
  soft: "#f1f3f4",
  accent: "#1a73e8",
  accentSoft: "#e8f0fe",
  ok: "#188038",
  bad: "#c5221f",
  warnBg: "#fff4c2",
  badBg: "#fde2e1",
  sheetsGreen: "#0f9d58",
  white: "#ffffff",
  highlight: "#ffd54a",
};

export const FPS = 30;

// 進場：快出慢停；位移：平順
export const easeOut = Easing.bezier(0.16, 1, 0.3, 1);
export const easeInOut = Easing.bezier(0.65, 0, 0.35, 1);

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export const money = (n: number | null) => (n == null ? "" : n.toLocaleString("en-US"));
