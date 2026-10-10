import React from "react";
import { interpolate, useCurrentFrame, Easing } from "remotion";
import { C, clamp, easeInOut, easeOut, fontFamily } from "./theme";

// ── 試算表視窗 ───────────────────────────────────────────────
export type Cell = {
  v?: React.ReactNode;
  bg?: string;
  bold?: boolean;
  align?: "left" | "right";
  color?: string;
  opacity?: number;
  overflow?: boolean; // 像試算表一樣，文字可以溢出到右邊的空格
};
export type Col = { letter: string; width: number };

export const ROW_H = 40;
export const HEAD_H = 34;
export const ROWNUM_W = 52;

export const SheetWindow: React.FC<{
  title: string;
  cols: Col[];
  rows: Cell[][];
  tabs?: { name: string; on?: boolean; appear?: number }[];
  formula?: string;
  cellRef?: string;
  menuHot?: number; // 0~1：上方「統編查詢」選單被點的高亮
  frozenAfter?: number; // 第幾列下面畫凍結線
  children?: React.ReactNode; // 側邊面板等疊在上面的東西
  sidebar?: React.ReactNode;
  sidebarWidth?: number;
}> = ({ title, cols, rows, tabs = [{ name: "工作表1", on: true }], formula = "", cellRef = "A1", menuHot = 0, frozenAfter, sidebar, sidebarWidth = 0, children }) => {
  return (
    <div style={{ width: "100%", height: "100%", background: C.white, borderRadius: 18, overflow: "hidden", display: "flex", flexDirection: "column", fontFamily, color: C.ink, boxShadow: "0 40px 120px rgba(0,0,0,.45)" }}>
      {/* 標題列 */}
      <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "16px 24px 10px" }}>
        <div style={{ width: 36, height: 46, borderRadius: 4, background: C.sheetsGreen, position: "relative", flex: "none" }}>
          <div style={{ position: "absolute", inset: "15px 8px 10px", border: "3px solid #fff", borderRadius: 2 }} />
        </div>
        <div>
          <div style={{ fontSize: 26 }}>{title}</div>
          <div style={{ display: "flex", gap: 22, fontSize: 19, color: C.muted, marginTop: 2 }}>
            {["檔案", "編輯", "查看", "插入", "格式", "資料", "擴充功能"].map((m) => <span key={m}>{m}</span>)}
            <span style={{ color: C.ink, fontWeight: 500, padding: "0 8px", borderRadius: 6, background: `rgba(26,115,232,${0.14 + menuHot * 0.3})`, outline: menuHot > 0.01 ? `2px solid rgba(26,115,232,${menuHot})` : "none" }}>統編查詢</span>
          </div>
        </div>
      </div>
      {/* 公式列 */}
      <div style={{ display: "flex", alignItems: "center", borderTop: `1px solid ${C.grid}`, borderBottom: `1px solid ${C.grid}`, fontSize: 19, height: 44 }}>
        <div style={{ width: 100, padding: "0 14px", color: C.muted, borderRight: `1px solid ${C.grid}` }}>{cellRef}</div>
        <div style={{ padding: "0 14px", color: C.muted, fontStyle: "italic", borderRight: `1px solid ${C.grid}` }}>fx</div>
        <div style={{ padding: "0 14px" }}>{formula}</div>
      </div>
      {/* 表格＋側邊面板 */}
      <div style={{ flex: 1, display: "flex", minHeight: 0, position: "relative" }}>
        <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
          <Grid cols={cols} rows={rows} frozenAfter={frozenAfter} />
          {children}
        </div>
        {sidebarWidth > 0 && (
          <div style={{ width: sidebarWidth, borderLeft: `1px solid ${C.line}`, background: C.white, overflow: "hidden", flex: "none" }}>
            <div style={{ width: 430 }}>{sidebar}</div>
          </div>
        )}
      </div>
      {/* 工作表分頁 */}
      <div style={{ height: 50, background: C.head, borderTop: `1px solid ${C.grid}`, display: "flex", alignItems: "center", gap: 6, padding: "0 18px", fontSize: 19 }}>
        <span style={{ color: C.muted, fontSize: 26, marginRight: 10 }}>＋</span>
        {tabs.map((t) => (
          <span key={t.name} style={{ padding: "8px 18px", color: t.on ? C.accent : C.muted, background: t.on ? C.white : "transparent", borderBottom: t.on ? `3px solid ${C.accent}` : "3px solid transparent", opacity: t.appear ?? 1, translate: `0 ${(1 - (t.appear ?? 1)) * 20}px` }}>{t.name}</span>
        ))}
      </div>
    </div>
  );
};

const GRID_FILL_WIDTH = 1700;

const Grid: React.FC<{ cols: Col[]; rows: Cell[][]; frozenAfter?: number }> = ({ cols: allCols, rows: allRows, frozenAfter }) => {
  const line = `1px solid ${C.grid}`;
  // 還沒長出來（寬度 0）的欄不畫；右邊補空白欄，看起來像真的試算表
  const keep = allCols.map((c) => c.width >= 1);
  const cols = allCols.filter((_, i) => keep[i]);
  const rows = allRows.map((r) => r.filter((_, i) => keep[i] !== false));
  let used = cols.reduce((a, c) => a + c.width, 0);
  for (let code = 65 + cols.length; used < GRID_FILL_WIDTH; code++) {
    cols.push({ letter: String.fromCharCode(code), width: 130 });
    used += 130;
  }
  return (
    <div style={{ fontSize: 20 }}>
      <div style={{ display: "flex", height: HEAD_H, background: C.head, color: C.muted }}>
        <div style={{ width: ROWNUM_W, borderRight: line, borderBottom: line }} />
        {cols.map((c) => (
          <div key={c.letter} style={{ width: c.width, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", borderRight: line, borderBottom: line, overflow: "hidden" }}>{c.width > 20 ? c.letter : ""}</div>
        ))}
      </div>
      {Array.from({ length: Math.max(rows.length, 14) }, (_, r) => (
        <div key={r} style={{ display: "flex", height: ROW_H, borderBottom: frozenAfter === r + 1 ? `4px solid #c0c4c8` : undefined }}>
          <div style={{ width: ROWNUM_W, background: C.head, color: C.muted, display: "flex", alignItems: "center", justifyContent: "center", borderRight: line, borderBottom: line, flex: "none" }}>{r + 1}</div>
          {cols.map((c, ci) => {
            const cell = rows[r]?.[ci] ?? {};
            return (
              <div key={c.letter} style={{ width: c.width, flex: "none", display: "flex", alignItems: "center", justifyContent: cell.align === "right" ? "flex-end" : "flex-start", padding: c.width > 20 ? "0 10px" : 0, borderRight: line, borderBottom: line, background: cell.bg, fontWeight: cell.bold ? 700 : 400, color: cell.color, whiteSpace: "nowrap", overflow: cell.overflow ? "visible" : "hidden", position: "relative", zIndex: cell.overflow ? 2 : undefined }}>
                <span style={{ opacity: cell.opacity ?? 1 }}>{c.width > 20 ? cell.v : null}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};

// ── 側邊面板（照 addon/Sidebar.html） ─────────────────────────
export const PanelTabs: React.FC<{ active: 0 | 1 | 2 }> = ({ active }) => (
  <div style={{ display: "flex", borderBottom: `1px solid ${C.line}`, fontSize: 21 }}>
    {["名稱找統編", "統編查公司", "新公司"].map((t, i) => (
      <div key={t} style={{ flex: 1, textAlign: "center", padding: "16px 0 13px", color: i === active ? C.accent : C.muted, fontWeight: i === active ? 700 : 400, borderBottom: `3px solid ${i === active ? C.accent : "transparent"}` }}>{t}</div>
    ))}
  </div>
);

export const PanelH: React.FC<{ children: React.ReactNode }> = ({ children }) => <div style={{ fontSize: 22, fontWeight: 700, margin: "22px 0 10px" }}>{children}</div>;

export const PanelBox: React.FC<{ children: React.ReactNode; focus?: number }> = ({ children, focus = 0 }) => (
  <div style={{ border: `${focus > 0.5 ? 2 : 1}px solid ${focus > 0.5 ? C.accent : C.line}`, borderRadius: 8, padding: "10px 14px", fontSize: 21, background: C.white }}>{children}</div>
);

export const PanelButton: React.FC<{ label: string; press?: number }> = ({ label, press = 0 }) => (
  <div style={{ marginTop: 20, padding: "15px 0", textAlign: "center", borderRadius: 8, background: C.accent, color: C.white, fontSize: 22, fontWeight: 700, scale: String(1 - press * 0.05), filter: `brightness(${1 - press * 0.15})` }}>{label}</div>
);

export const Check: React.FC<{ on: boolean; label: string }> = ({ on, label }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 19 }}>
    <div style={{ width: 20, height: 20, borderRadius: 4, border: `2px solid ${on ? C.accent : C.muted}`, background: on ? C.accent : C.white, color: C.white, fontSize: 15, lineHeight: "16px", textAlign: "center" }}>{on ? "✓" : ""}</div>
    {label}
  </div>
);

// ── 滑鼠游標：依關鍵影格移動，點擊時有一圈漣漪 ─────────────────
export const Cursor: React.FC<{ path: { f: number; x: number; y: number }[]; clicks?: number[] }> = ({ path, clicks = [] }) => {
  const frame = useCurrentFrame();
  const fs = path.map((p) => p.f);
  const x = interpolate(frame, fs, path.map((p) => p.x), { ...clamp, easing: easeInOut });
  const y = interpolate(frame, fs, path.map((p) => p.y), { ...clamp, easing: easeInOut });
  const recent = clicks.filter((c) => frame >= c && frame < c + 18);
  return (
    <div style={{ position: "absolute", left: 0, top: 0, translate: `${x}px ${y}px`, pointerEvents: "none", zIndex: 50 }}>
      {recent.map((c) => {
        const t = (frame - c) / 18;
        return <div key={c} style={{ position: "absolute", left: -30, top: -30, width: 60, height: 60, borderRadius: "50%", border: `4px solid ${C.accent}`, opacity: 1 - t, scale: String(0.4 + t * 1.1) }} />;
      })}
      <svg width="44" height="54" viewBox="0 0 22 27" style={{ position: "absolute", left: -4, top: -2, filter: "drop-shadow(0 3px 4px rgba(0,0,0,.35))", scale: String(recent.length ? 0.9 : 1) }}>
        <path d="M2 2 L2 22 L7.5 17 L11 25 L14.5 23.5 L11 16 L18.5 16 Z" fill="#111" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    </div>
  );
};

// ── 字幕：上方大標題，逐段進場 ─────────────────────────────────
export const Caption: React.FC<{ from: number; to?: number; children: React.ReactNode; sub?: React.ReactNode }> = ({ from, to = 9999, children, sub }) => {
  const frame = useCurrentFrame();
  const inP = interpolate(frame, [from, from + 14], [0, 1], { ...clamp, easing: easeOut });
  const outP = interpolate(frame, [to - 10, to], [1, 0], { ...clamp, easing: Easing.in(Easing.quad) });
  const p = Math.min(inP, outP);
  return (
    <div style={{ position: "absolute", left: 120, right: 120, top: 56, fontFamily, color: C.white, opacity: p, translate: `0 ${(1 - inP) * 28}px` }}>
      <div style={{ fontSize: 76, fontWeight: 700, letterSpacing: 1, lineHeight: 1.15 }}>{children}</div>
      {sub && <div style={{ fontSize: 38, color: "#b8c7dc", marginTop: 12, fontWeight: 500 }}>{sub}</div>}
    </div>
  );
};

export const Hl: React.FC<{ children: React.ReactNode }> = ({ children }) => <span style={{ color: C.highlight }}>{children}</span>;

// 深色背景加一點光暈
export const Stage: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ position: "absolute", inset: 0, background: `radial-gradient(1200px 700px at 70% 75%, ${C.bgGlow}, ${C.bg})`, fontFamily, overflow: "hidden" }}>{children}</div>
);
