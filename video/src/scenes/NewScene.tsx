import React from "react";
import { interpolate, useCurrentFrame, Easing } from "remotion";
import { NAME_ROWS, NEW_ROWS } from "../data";
import { C, clamp, easeOut, money } from "../theme";
import { Caption, Cell, Check, Cursor, Hl, PanelBox, PanelButton, PanelH, PanelTabs, SheetWindow, Stage } from "../ui";

// 19～26 秒：勾縣市、打行業 → 產生新公司名單（新工作表）
const WIN = { x: 120, y: 250, w: 1680, h: 800 };
const T = { city: 30, kw: 56, typeEnd: 84, btn: 104, sheet: 112, fill: 122, stagger: 5 };
const KEYWORD = "餐飲 咖啡 飲料";
const CITY_LIST = ["臺北市", "新北市", "桃園市", "臺中市", "臺南市", "高雄市"];

export const NewScene: React.FC = () => {
  const frame = useCurrentFrame();
  const typed = KEYWORD.slice(0, Math.round(interpolate(frame, [T.kw + 4, T.typeEnd], [0, KEYWORD.length], clamp)));
  const onNewSheet = frame >= T.sheet;
  const press = interpolate(frame, [T.btn, T.btn + 4, T.btn + 10], [0, 1, 0], clamp);
  const zoom = interpolate(frame, [150, 225], [1, 1.05], clamp);

  const cols = onNewSheet
    ? [
        { letter: "A", width: 140 },
        { letter: "B", width: 270 },
        { letter: "C", width: 120 },
        { letter: "D", width: 320 },
        { letter: "E", width: 130 },
        { letter: "F", width: 230 },
      ]
    : [{ letter: "A", width: 170 }, { letter: "B", width: 130 }, { letter: "C", width: 390 }, { letter: "D", width: 130 }];

  const rows: Cell[][] = onNewSheet
    ? [
        [{ v: <span style={{ color: C.muted, fontStyle: "italic" }}>臺北市｜最近 30 天設立｜行業或名稱含：餐飲 咖啡 飲料｜不含分公司｜共 23 家</span>, overflow: true }],
        ["設立日期", "公司名稱", "統編", "地址", "資本額", "行業"].map((v) => ({ v, bold: true, bg: C.accentSoft })),
        ...NEW_ROWS.slice(0, 9).map((r, i) => {
          const t = interpolate(frame, [T.fill + i * T.stagger, T.fill + i * T.stagger + 8], [0, 1], { ...clamp, easing: easeOut });
          const bg = i % 2 === 1 ? "#f3f3f3" : undefined;
          return [
            { v: r.date, opacity: t, bg },
            { v: r.name, opacity: t, bg },
            { v: r.id, opacity: t, bg },
            { v: r.address, opacity: t, bg },
            { v: money(r.capital), opacity: t, bg, align: "right" },
            { v: r.industry, opacity: t, bg },
          ] as Cell[];
        }),
      ]
    : [
        [{ v: "客戶名稱", bold: true }, { v: "統編", bold: true, bg: C.accentSoft }, { v: "正式名稱", bold: true, bg: C.accentSoft }, { v: "比對結果", bold: true, bg: C.accentSoft }],
        // 接續上一段：剛剛找好統編的客戶名單
        ...NAME_ROWS.map((r) => [{ v: r.q }, { v: r.id }, { v: r.name }, { v: r.status }] as Cell[]),
      ];

  const badge = interpolate(frame, [170, 182], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.8)) });

  const sidebar = (
    <div>
      <PanelTabs active={2} />
      <div style={{ padding: "4px 24px" }}>
        <PanelH>期間</PanelH>
        <PanelBox>最近 30 天 ▾</PanelBox>
        <PanelH>縣市</PanelH>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px 6px" }}>
          {CITY_LIST.map((c) => <Check key={c} on={c === "臺北市" && frame >= T.city + 2} label={c} />)}
        </div>
        <PanelH>行業或名稱</PanelH>
        <PanelBox focus={frame >= T.kw && frame < T.btn ? 1 : 0}>
          {typed || <span style={{ color: C.muted }}>例如：餐飲 咖啡 物流</span>}
          {frame >= T.kw && frame < T.typeEnd + 8 && Math.floor(frame / 8) % 2 === 0 && <span style={{ color: C.accent }}>|</span>}
        </PanelBox>
        <div style={{ marginTop: 16 }}><Check on label="不含分公司" /></div>
        <PanelButton label="產生名單" press={press} />
      </div>
    </div>
  );

  return (
    <Stage>
      <Caption from={0} to={110} sub="選區域、選行業，馬上產出名單">
        最近有<Hl>哪些新公司</Hl>？
      </Caption>
      <Caption from={114} sub="財政部資料每天自動更新，最右邊還留了備註欄">
        業務的<Hl>新商機名單</Hl>
      </Caption>
      <div style={{ position: "absolute", left: WIN.x, top: WIN.y, width: WIN.w, height: WIN.h, scale: String(zoom), transformOrigin: "30% 50%" }}>
        <SheetWindow
          title="客戶名單"
          cols={cols}
          rows={rows}
          cellRef={onNewSheet ? "A3" : "A1"}
          formula={onNewSheet ? NEW_ROWS[0].date : "客戶名稱"}
          frozenAfter={onNewSheet ? 2 : 1}
          tabs={[
            { name: "工作表1", on: !onNewSheet },
            ...(onNewSheet ? [{ name: "新公司 10/10", on: true, appear: interpolate(frame, [T.sheet, T.sheet + 10], [0, 1], { ...clamp, easing: easeOut }) }] : []),
          ]}
          sidebar={sidebar}
          sidebarWidth={430}
        />
        <Cursor
          path={[
            { f: 0, x: 900, y: 600 },
            { f: T.city - 2, x: 1286, y: 402 },
            { f: T.city + 10, x: 1286, y: 402 },
            { f: T.kw - 2, x: 1400, y: 542 },
            { f: T.btn - 18, x: 1400, y: 542 },
            { f: T.btn - 2, x: 1466, y: 664 },
            { f: 225, x: 1500, y: 700 },
          ]}
          clicks={[T.city, T.kw, T.btn]}
        />
        <div
          style={{
            position: "absolute", right: 470, bottom: 90, padding: "18px 28px", borderRadius: 14, background: C.bg, color: C.white,
            fontSize: 34, fontWeight: 700, boxShadow: "0 16px 40px rgba(0,0,0,.35)", opacity: badge, scale: String(0.8 + badge * 0.2),
          }}
        >
          臺北市・30 天內・餐飲咖啡　<span style={{ color: C.highlight }}>23 家新公司</span>
        </div>
      </div>
    </Stage>
  );
};
