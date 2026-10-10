import React from "react";
import { interpolate, useCurrentFrame, Easing } from "remotion";
import { C, clamp, easeOut } from "../theme";
import { Stage } from "../ui";

// 0～4 秒：業務每天遇到的三個問題
const QUESTIONS = [
  { q: "這家公司的統編是多少？", note: "只知道「台積電」「遠傳」這種簡稱" },
  { q: "這個統編是哪一家公司？", note: "廠商名單一長串，還可能打錯一碼" },
  { q: "最近有哪些新開的公司？", note: "想比別人早一步聯絡" },
];

export const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <Stage>
      <div
        style={{
          position: "absolute", left: 160, top: 190, fontSize: 64, fontWeight: 700, color: "#b8c7dc",
          opacity: interpolate(frame, [0, 12], [0, 1], { ...clamp, easing: easeOut }),
          translate: interpolate(frame, [0, 12], ["0px 24px", "0px 0px"], { ...clamp, easing: easeOut }),
        }}
      >
        業務、會計、行政，每天都在問：
      </div>
      {QUESTIONS.map((x, i) => {
        const start = 14 + i * 16;
        return (
          <div
            key={x.q}
            style={{
              position: "absolute", left: 160, top: 350 + i * 215, width: 1600, display: "flex", alignItems: "center", gap: 40,
              opacity: interpolate(frame, [start, start + 12], [0, 1], { ...clamp, easing: easeOut }),
              translate: interpolate(frame, [start, start + 14], ["-60px 0px", "0px 0px"], { ...clamp, easing: easeOut }),
            }}
          >
            <div
              style={{
                width: 120, height: 120, borderRadius: 60, background: C.highlight, color: C.bg, fontSize: 80, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center", flex: "none",
                scale: String(interpolate(frame, [start + 4, start + 14], [0.4, 1], { ...clamp, easing: Easing.out(Easing.back(2.2)) })),
              }}
            >
              ?
            </div>
            <div>
              <div style={{ fontSize: 84, fontWeight: 700, color: C.white, lineHeight: 1.15 }}>{x.q}</div>
              <div style={{ fontSize: 40, color: "#8fa3bf", marginTop: 6 }}>{x.note}</div>
            </div>
          </div>
        );
      })}
    </Stage>
  );
};
