import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { NAME_ROWS } from "../data";
import { C, clamp, easeInOut, easeOut } from "../theme";
import { Caption, Cell, Cursor, Hl, PanelBox, PanelButton, PanelH, PanelTabs, SheetWindow, Stage } from "../ui";

// 4～12 秒：貼上名稱 → 開面板 → 一鍵找統編
const WIN = { x: 120, y: 250, w: 1680, h: 800 };
const T = { menu: 38, open: 42, btn: 92, insert: 98, fill: 116, stagger: 7 };
const STATUS_BG: Record<string, string | undefined> = { 確定: undefined, 請確認: C.warnBg, 查無: C.badBg };

export const NameScene: React.FC = () => {
  const frame = useCurrentFrame();
  const sidebarW = interpolate(frame, [T.open, T.open + 18], [0, 430], { ...clamp, easing: easeOut });
  const grow = (w: number) => interpolate(frame, [T.insert, T.insert + 16], [0, w], { ...clamp, easing: easeInOut });
  const cols = [
    { letter: "A", width: 170 },
    { letter: "B", width: grow(130) },
    { letter: "C", width: grow(390) },
    { letter: "D", width: grow(130) },
  ];
  const headerIn = interpolate(frame, [T.insert + 10, T.insert + 18], [0, 1], clamp);
  const rows: Cell[][] = [
    [
      { v: "客戶名稱", bold: true },
      { v: "統編", bold: true, bg: C.accentSoft, opacity: headerIn },
      { v: "正式名稱", bold: true, bg: C.accentSoft, opacity: headerIn },
      { v: "比對結果", bold: true, bg: C.accentSoft, opacity: headerIn },
    ],
    ...NAME_ROWS.map((r, i) => {
      const t = interpolate(frame, [T.fill + i * T.stagger, T.fill + i * T.stagger + 8], [0, 1], { ...clamp, easing: easeOut });
      const bg = t > 0.3 ? STATUS_BG[r.status] : undefined;
      return [
        { v: r.q },
        { v: r.id, opacity: t, bg },
        { v: r.name, opacity: t, bg },
        { v: r.status, opacity: t, bg, color: r.status === "確定" ? C.ok : r.status === "查無" ? C.bad : "#b06000", bold: true },
      ] as Cell[];
    }),
  ];
  const done = interpolate(frame, [T.fill + NAME_ROWS.length * T.stagger, T.fill + NAME_ROWS.length * T.stagger + 10], [0, 1], clamp);
  const press = interpolate(frame, [T.btn, T.btn + 4, T.btn + 10], [0, 1, 0], clamp);
  // 結果出來後鏡頭往表格推近一點
  const zoom = interpolate(frame, [150, 200], [1, 1.07], { ...clamp, easing: easeInOut });

  const sidebar = (
    <div style={{ fontSize: 20 }}>
      <PanelTabs active={0} />
      <div style={{ padding: "4px 24px" }}>
        <PanelH>搜尋一家公司</PanelH>
        <PanelBox><span style={{ color: C.muted }}>例如：台積電、玉山銀行</span></PanelBox>
        <div style={{ borderTop: `1px solid ${C.line}`, margin: "26px 0 0" }} />
        <PanelH>整欄一起找</PanelH>
        <PanelBox>A 欄：客戶名稱 ▾</PanelBox>
        <PanelButton label={frame >= T.btn && done < 1 ? "找統編中…" : "開始找統編"} press={press} />
        <div style={{ marginTop: 18, padding: "14px 16px", background: C.soft, borderRadius: 8, fontSize: 19, lineHeight: 1.7, opacity: done }}>
          <b style={{ color: C.ok }}>完成</b>，插在 B–D 欄<br />確定 5 家<br />
          <span style={{ background: C.warnBg, padding: "0 6px" }}>請確認 2 家</span>　<span style={{ background: C.badBg, padding: "0 6px" }}>查無 1 家</span>
        </div>
      </div>
    </div>
  );

  return (
    <Stage>
      <Caption from={0} to={132} sub="貼上客戶名單，一鍵找出統編與正式名稱">
        知道名稱、<Hl>不知道統編？</Hl>
      </Caption>
      <Caption from={136} sub="看不準的標黃色、找不到的標紅色，不會默默填錯">
        連<Hl>簡稱</Hl>都找得到
      </Caption>
      <div style={{ position: "absolute", left: WIN.x, top: WIN.y, width: WIN.w, height: WIN.h, scale: String(zoom), transformOrigin: "30% 40%" }}>
        <SheetWindow
          title="客戶名單"
          cols={cols}
          rows={rows}
          cellRef="A2"
          formula="台積電"
          menuHot={interpolate(frame, [T.menu - 4, T.menu, T.menu + 14], [0, 1, 0], clamp)}
          frozenAfter={1}
          sidebar={sidebar}
          sidebarWidth={sidebarW}
        />
        <Cursor
          path={[
            { f: 0, x: 900, y: 640 },
            { f: 16, x: 900, y: 640 },
            { f: T.menu, x: 580, y: 70 },
            { f: T.open + 20, x: 580, y: 70 },
            { f: T.btn - 4, x: 1466, y: 520 },
            { f: 240, x: 1480, y: 545 },
          ]}
          clicks={[T.menu, T.btn]}
        />
      </div>
    </Stage>
  );
};
