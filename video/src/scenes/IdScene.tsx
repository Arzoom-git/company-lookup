import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { ID_ROWS } from "../data";
import { C, clamp, easeInOut, easeOut, money } from "../theme";
import { Caption, Cell, Check, Cursor, Hl, PanelBox, PanelButton, PanelH, PanelTabs, SheetWindow, Stage } from "../ui";

// 12～19 秒：一欄統編 → 勾欄位 → 一鍵補齊公司資料；打錯的標紅
const WIN = { x: 120, y: 250, w: 1680, h: 800 };
const T = { tick: 34, btn: 70, insert: 76, fill: 94, stagger: 8 };

export const IdScene: React.FC = () => {
  const frame = useCurrentFrame();
  const grow = (w: number) => interpolate(frame, [T.insert, T.insert + 16], [0, w], { ...clamp, easing: easeInOut });
  const cols = [
    { letter: "A", width: 150 },
    { letter: "B", width: grow(130) },
    { letter: "C", width: grow(330) },
    { letter: "D", width: grow(370) },
    { letter: "E", width: grow(200) },
  ];
  const headerIn = interpolate(frame, [T.insert + 10, T.insert + 18], [0, 1], clamp);
  const head = (v: string): Cell => ({ v, bold: true, bg: C.accentSoft, opacity: headerIn });
  const rows: Cell[][] = [
    [{ v: "廠商統編", bold: true }, head("統編檢查"), head("名稱"), head("地址"), head("資本額")],
    ...ID_ROWS.map((r, i) => {
      const t = interpolate(frame, [T.fill + i * T.stagger, T.fill + i * T.stagger + 8], [0, 1], { ...clamp, easing: easeOut });
      const bad = r.check !== "正確";
      const bg = t > 0.3 && bad ? C.badBg : undefined;
      return [
        { v: r.input },
        { v: r.check, opacity: t, bg, color: bad ? C.bad : C.ok, bold: bad },
        { v: r.name, opacity: t, bg },
        { v: r.address, opacity: t, bg },
        { v: money(r.capital), opacity: t, bg, align: "right" },
      ] as Cell[];
    }),
  ];
  const capOn = frame >= T.tick + 2;
  const press = interpolate(frame, [T.btn, T.btn + 4, T.btn + 10], [0, 1, 0], clamp);
  const zoom = interpolate(frame, [140, 200], [1, 1.06], { ...clamp, easing: easeInOut });

  const sidebar = (
    <div>
      <PanelTabs active={1} />
      <div style={{ padding: "4px 24px" }}>
        <PanelH>統編在哪一欄？</PanelH>
        <PanelBox>A 欄：廠商統編 ▾</PanelBox>
        <div style={{ fontSize: 17, color: C.muted, marginTop: 6 }}>已自動選出看起來像統編的那一欄。</div>
        <PanelH>要填哪些資料？</PanelH>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 10px" }}>
          <Check on label="名稱" />
          <Check on label="地址" />
          <Check on={capOn} label="資本額" />
          <Check on={false} label="設立日期" />
          <Check on={false} label="組織別" />
          <Check on={false} label="行業" />
        </div>
        <div style={{ marginTop: 16 }}><Check on label="順便檢查統編有沒有打錯" /></div>
        <PanelButton label="開始填入" press={press} />
      </div>
    </div>
  );

  return (
    <Stage>
      <Caption from={0} to={118} sub="名稱、地址、資本額、行業，勾一勾就補齊">
        知道統編，<Hl>資料自動填好</Hl>
      </Caption>
      <Caption from={122} sub="「2209-9131」這種格式也認得，打錯的標紅色">
        <Hl>打錯一碼</Hl>也抓得出來
      </Caption>
      <div style={{ position: "absolute", left: WIN.x, top: WIN.y, width: WIN.w, height: WIN.h, scale: String(zoom), transformOrigin: "25% 35%" }}>
        <SheetWindow title="廠商資料" cols={cols} rows={rows} cellRef="A4" formula="2209-9131" frozenAfter={1} sidebar={sidebar} sidebarWidth={430} />
        <Cursor
          path={[
            { f: 0, x: 1100, y: 600 },
            { f: T.tick - 2, x: 1286, y: 466 },
            { f: T.tick + 12, x: 1286, y: 466 },
            { f: T.btn - 4, x: 1466, y: 612 },
            { f: 210, x: 1480, y: 640 },
          ]}
          clicks={[T.tick, T.btn]}
        />
      </div>
    </Stage>
  );
};
