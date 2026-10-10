import React from "react";
import { interpolate, useCurrentFrame, Easing } from "remotion";
import { C, clamp, easeOut } from "../theme";
import { Stage } from "../ui";

// 26～30 秒：產品名＋三個好處
const POINTS = [
  { big: "76 萬家", small: "全台公司資料" },
  { big: "每天", small: "自動更新" },
  { big: "免下載", small: "試算表裡直接用" },
];

export const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <Stage>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 70 }}>
        <div
          style={{
            display: "flex", alignItems: "center", gap: 34,
            opacity: interpolate(frame, [0, 14], [0, 1], { ...clamp, easing: easeOut }),
            scale: String(interpolate(frame, [0, 18], [0.85, 1], { ...clamp, easing: easeOut })),
          }}
        >
          <div style={{ width: 110, height: 138, borderRadius: 12, background: C.sheetsGreen, position: "relative" }}>
            <div style={{ position: "absolute", inset: "44px 24px 28px", border: "8px solid #fff", borderRadius: 4 }} />
          </div>
          <div style={{ fontSize: 132, fontWeight: 700, color: C.white, letterSpacing: 4 }}>公司統編查詢</div>
        </div>
        <div style={{ display: "flex", gap: 60 }}>
          {POINTS.map((p, i) => {
            const s = 18 + i * 10;
            return (
              <div
                key={p.big}
                style={{
                  width: 440, padding: "34px 0", borderRadius: 24, background: "rgba(255,255,255,.08)", border: "2px solid rgba(255,255,255,.18)", textAlign: "center",
                  opacity: interpolate(frame, [s, s + 12], [0, 1], { ...clamp, easing: easeOut }),
                  translate: interpolate(frame, [s, s + 16], ["0px 40px", "0px 0px"], { ...clamp, easing: Easing.out(Easing.back(1.6)) }),
                }}
              >
                <div style={{ fontSize: 96, fontWeight: 700, color: C.highlight }}>{p.big}</div>
                <div style={{ fontSize: 44, color: "#d6e0ee", marginTop: 4 }}>{p.small}</div>
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 56, color: C.white, fontWeight: 500, opacity: interpolate(frame, [60, 74], [0, 1], { ...clamp, easing: easeOut }) }}>
          貼上名單，<span style={{ color: C.highlight }}>一鍵完成</span>
        </div>
      </div>
    </Stage>
  );
};
