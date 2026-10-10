import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig, Easing } from "remotion";
import { clamp, fontFamily } from "../theme";

// 第二版（有活力）共用的動態元件。一拍＝15 影格（120 BPM），所有進場都對準拍點。
export const BEAT = 15;

export const L = {
  bg: "#f4f6fb",
  ink: "#0f172a",
  sub: "#475569",
  blue: "#1a73e8",
  blueSoft: "#d6e6ff",
  yellow: "#ffc83d",
  yellowSoft: "#fff1c2",
  red: "#ef4444",
  green: "#16a34a",
};

// 明亮背景：慢慢飄的兩團色塊＋淡淡的點陣
export const Backdrop: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <div style={{ position: "absolute", inset: 0, background: L.bg, overflow: "hidden" }}>
      <div style={{ position: "absolute", width: 1100, height: 1100, borderRadius: "50%", background: L.blueSoft, filter: "blur(120px)", left: 1100 + Math.sin(f / 50) * 120, top: -300 + Math.cos(f / 60) * 90 }} />
      <div style={{ position: "absolute", width: 900, height: 900, borderRadius: "50%", background: L.yellowSoft, filter: "blur(120px)", left: -250 + Math.cos(f / 45) * 110, top: 500 + Math.sin(f / 55) * 80 }} />
      <div style={{ position: "absolute", inset: -40, backgroundImage: "radial-gradient(rgba(15,23,42,.10) 1.6px, transparent 1.6px)", backgroundSize: "36px 36px", translate: `${(f * 0.3) % 36}px ${(f * 0.15) % 36}px` }} />
    </div>
  );
};

// 彈出來的字：在 at 影格用彈簧放大進場，out 之後縮小淡出
export const Pop: React.FC<{ at: number; out?: number; children: React.ReactNode; style?: React.CSSProperties; from?: "up" | "down" | "none"; bounce?: number }> = ({ at, out, children, style, from = "up", bounce = 11 }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f - at, fps, config: { damping: bounce, stiffness: 190, mass: 0.7 } });
  const o = out === undefined ? 1 : interpolate(f, [out, out + 8], [1, 0], { ...clamp, easing: Easing.in(Easing.cubic) });
  const dy = from === "up" ? 60 : from === "down" ? -60 : 0;
  return (
    <span style={{ display: "inline-block", fontFamily, opacity: Math.min(1, s * 1.4) * o, scale: String((0.4 + 0.6 * s) * (0.85 + 0.15 * o)), translate: `0 ${(1 - s) * dy}px`, ...style }}>
      {children}
    </span>
  );
};

// 蓋章：從很大砸下來，稍微歪一點
export const Stamp: React.FC<{ at: number; out?: number; rotate?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ at, out, rotate = -4, children, style }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f - at, fps, config: { damping: 14, stiffness: 260, mass: 0.6 } });
  const o = out === undefined ? 1 : interpolate(f, [out, out + 8], [1, 0], clamp);
  if (f < at) return null;
  const shake = f - at < 8 ? Math.sin((f - at) * 2.4) * (8 - (f - at)) * 0.6 : 0;
  return (
    <div style={{ position: "absolute", fontFamily, opacity: o, scale: String(2.2 - 1.2 * s), rotate: `${rotate + shake * 0.3}deg`, translate: `${shake}px 0`, ...style }}>
      {children}
    </div>
  );
};

// 數字快速跳上去
export const Counter: React.FC<{ at: number; dur: number; to: number; style?: React.CSSProperties }> = ({ at, dur, to, style }) => {
  const f = useCurrentFrame();
  const v = Math.round(interpolate(f, [at, at + dur], [0, to], { ...clamp, easing: Easing.out(Easing.cubic) }));
  return <span style={{ fontVariantNumeric: "tabular-nums", ...style }}>{v.toLocaleString("en-US")}</span>;
};

// 鏡頭：在指定影格把內容的某一點（x, y）放大 scale 倍、移到畫面上的（sx, sy）
export type Shot = { f: number; x: number; y: number; scale: number };
export const Camera: React.FC<{ shots: Shot[]; children: React.ReactNode; screen?: { x: number; y: number } }> = ({ shots, children, screen = { x: 960, y: 600 } }) => {
  const f = useCurrentFrame();
  const fs = shots.map((s) => s.f);
  const opts = { ...clamp, easing: Easing.bezier(0.7, 0, 0.2, 1) };
  const scale = interpolate(f, fs, shots.map((s) => s.scale), opts);
  const x = interpolate(f, fs, shots.map((s) => s.x), opts);
  const y = interpolate(f, fs, shots.map((s) => s.y), opts);
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, transformOrigin: "0 0", scale: String(scale), translate: `${screen.x - x * scale}px ${screen.y - y * scale}px` }}>
      {children}
    </div>
  );
};

// 視窗進場：從下方帶一點 3D 傾斜飛進來；離場往左甩出去
export const WindowIn: React.FC<{ at?: number; exit?: number; children: React.ReactNode; dir?: 1 | -1 }> = ({ at = 0, exit, children, dir = 1 }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f - at, fps, config: { damping: 16, stiffness: 120 } });
  const e = exit === undefined ? 0 : interpolate(f, [exit, exit + 12], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
  return (
    <div style={{ position: "absolute", inset: 0, perspective: 2200 }}>
      <div style={{ position: "absolute", inset: 0, transform: `translate(${-e * 2200 * dir}px, ${(1 - s) * 420}px) rotateX(${(1 - s) * 28}deg) rotateY(${e * 18 * dir}deg) scale(${0.86 + 0.14 * s})`, opacity: Math.min(1, s * 2), filter: e > 0 ? `blur(${e * 10}px)` : undefined }}>
        {children}
      </div>
    </div>
  );
};

// 字卡區：左上角一行大字，每個詞依拍點彈出來
// 底下墊一塊白色圓角卡，鏡頭推近到介面上時字還是讀得清楚
export const Headline: React.FC<{ words: { t: React.ReactNode; at: number; hl?: boolean }[]; out?: number; size?: number; top?: number }> = ({ words, out, size = 84, top = 44 }) => (
  <div style={{ position: "absolute", left: 100, top, zIndex: 20, fontFamily }}>
    <Pop at={words[0].at} out={out} from="none" bounce={14} style={{ background: "rgba(255,255,255,.94)", borderRadius: 28, padding: "14px 34px 18px", boxShadow: "0 16px 44px rgba(15,23,42,.16)" }}>
      <span style={{ fontSize: size, fontWeight: 700, color: L.ink, display: "flex", gap: 18, alignItems: "baseline" }}>
        {words.map((w, i) => (
          <Pop key={i} at={w.at} out={out} style={{ color: w.hl ? L.blue : L.ink }}>{w.t}</Pop>
        ))}
      </span>
    </Pop>
  </div>
);

export const Chip: React.FC<{ at: number; out?: number; bg: string; color?: string; children: React.ReactNode }> = ({ at, out, bg, color = L.ink, children }) => (
  <Pop at={at} out={out} style={{ background: bg, color, padding: "10px 24px", borderRadius: 999, fontSize: 36, fontWeight: 700, boxShadow: "0 10px 30px rgba(15,23,42,.12)" }}>{children}</Pop>
);
