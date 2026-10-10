import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { ID_ROWS, NAME_ROWS, NEW_ROWS } from "../data";
import { C, clamp, easeInOut, easeOut, fontFamily, money } from "../theme";
import { Cell, Check, Cursor, PanelBox, PanelButton, PanelH, PanelTabs, SheetWindow } from "../ui";
import { BEAT, Camera, Chip, Counter, Headline, L, Pop, Shot, Stamp, WindowIn } from "./motion";

// 視窗在畫面內容座標的位置（鏡頭以這個座標系運鏡）
const WX = 120, WY = 230;
const win = (x: number, y: number) => ({ x: x + WX, y: y + WY });
const FULL = (f: number, scale = 0.95): Shot => ({ f, x: 960, y: 640, scale });
const PANEL = (f: number, y = 700, scale = 1.7): Shot => ({ f, ...win(1465, y - WY), scale });
const BEATS = (n: number) => n * BEAT;

const Window: React.FC<React.ComponentProps<typeof SheetWindow> & { cursor?: React.ReactNode }> = ({ cursor, ...p }) => (
  <div style={{ position: "absolute", left: WX, top: WY, width: 1680, height: 800 }}>
    <SheetWindow {...p} />
    {cursor}
  </div>
);

// ── 0～6 秒：痛點 → 76 萬家 ─────────────────────────────────
export const HookV2: React.FC = () => {
  const f = useCurrentFrame();
  const center: React.CSSProperties = { position: "absolute", left: 0, right: 0, display: "flex", justifyContent: "center", alignItems: "baseline", gap: 28, fontFamily, fontWeight: 700 };
  const underline = interpolate(f, [45, 58], [0, 1], { ...clamp, easing: easeOut });
  return (
    <>
      <div style={{ ...center, top: 330, fontSize: 150, color: L.ink }}>
        <Pop at={0} out={105}>還在</Pop>
        <Pop at={BEATS(1)} out={105}>一家一家</Pop>
        <Pop at={BEATS(2)} out={105} style={{ color: L.blue, position: "relative" }}>
          查統編？
          <span style={{ position: "absolute", left: 0, bottom: 6, height: 22, width: `${underline * 100}%`, background: L.yellow, zIndex: -1, borderRadius: 6 }} />
        </Pop>
      </div>
      <div style={{ ...center, top: 560, fontSize: 96, color: L.sub }}>
        <Pop at={BEATS(4)} out={105}>一筆一筆</Pop>
        <Pop at={BEATS(5)} out={105}>複製、貼上？</Pop>
      </div>
      {/* 第 2 小節進拍：76 萬家 */}
      <div style={{ ...center, top: 190, fontSize: 250, color: L.blue }}>
        {f >= 120 && <Pop at={120} out={168} bounce={9}><Counter at={120} dur={24} to={764533} /></Pop>}
      </div>
      <div style={{ ...center, top: 620, fontSize: 100, color: L.ink }}>
        <Pop at={BEATS(9)} out={168}>家公司</Pop>
        <Pop at={BEATS(10)} out={168} style={{ background: L.yellow, padding: "0 28px", borderRadius: 20 }}>一鍵查完</Pop>
      </div>
    </>
  );
};
// ── 6～12 秒：名稱找統編 ─────────────────────────────────────
export const NameV2: React.FC = () => {
  const f = useCurrentFrame();
  const grow = (w: number) => interpolate(f, [64, 80], [0, w], { ...clamp, easing: easeInOut });
  const headerIn = interpolate(f, [72, 80], [0, 1], clamp);
  const STATUS_BG: Record<string, string | undefined> = { 請確認: C.warnBg, 查無: C.badBg };
  const rows: Cell[][] = [
    [{ v: "客戶名稱", bold: true }, { v: "統編", bold: true, bg: C.accentSoft, opacity: headerIn }, { v: "正式名稱", bold: true, bg: C.accentSoft, opacity: headerIn }, { v: "比對結果", bold: true, bg: C.accentSoft, opacity: headerIn }],
    ...NAME_ROWS.map((r, i) => {
      const t = interpolate(f, [78 + i * 4, 84 + i * 4], [0, 1], { ...clamp, easing: easeOut });
      const bg = t > 0.3 ? STATUS_BG[r.status] : undefined;
      return [{ v: r.q }, { v: r.id, opacity: t, bg }, { v: r.name, opacity: t, bg }, { v: r.status, opacity: t, bg, bold: true, color: r.status === "確定" ? C.ok : r.status === "查無" ? C.bad : "#b06000" }] as Cell[];
    }),
  ];
  const press = interpolate(f, [60, 64, 70], [0, 1, 0], clamp);
  const done = interpolate(f, [110, 118], [0, 1], clamp);
  const sidebar = (
    <div>
      <PanelTabs active={0} />
      <div style={{ padding: "4px 24px" }}>
        <PanelH>搜尋一家公司</PanelH>
        <PanelBox><span style={{ color: C.muted }}>例如：台積電、玉山銀行</span></PanelBox>
        <div style={{ borderTop: `1px solid ${C.line}`, margin: "26px 0 0" }} />
        <PanelH>整欄一起找</PanelH>
        <PanelBox>A 欄：客戶名稱 ▾</PanelBox>
        <PanelButton label={f >= 60 && done < 1 ? "找統編中…" : "開始找統編"} press={press} />
        <div style={{ marginTop: 18, padding: "14px 16px", background: C.soft, borderRadius: 8, fontSize: 19, lineHeight: 1.7, opacity: done }}>
          <b style={{ color: C.ok }}>完成</b>　確定 5 家<br />
          <span style={{ background: C.warnBg, padding: "0 6px" }}>請確認 2 家</span>　<span style={{ background: C.badBg, padding: "0 6px" }}>查無 1 家</span>
        </div>
      </div>
    </div>
  );
  return (
    <>
      <Camera shots={[FULL(0), FULL(30), PANEL(45, 750), PANEL(64, 750), { f: 80, ...win(560, 330), scale: 1.32 }, { f: 165, ...win(560, 330), scale: 1.38 }]}>
        <WindowIn exit={165}>
          <Window
            title="客戶名單" cellRef="A2" formula="台積電" frozenAfter={1} sidebarWidth={430} sidebar={sidebar} rows={rows}
            cols={[{ letter: "A", width: 170 }, { letter: "B", width: grow(130) }, { letter: "C", width: grow(390) }, { letter: "D", width: grow(130) }]}
            cursor={<Cursor path={[{ f: 0, x: 900, y: 640 }, { f: 40, x: 1466, y: 520 }, { f: 64, x: 1466, y: 520 }, { f: 90, x: 1500, y: 600 }]} clicks={[60]} />}
          />
        </WindowIn>
      </Camera>
      <Headline out={163} words={[{ t: "只知道", at: 0 }, { t: "公司名稱？", at: 15, hl: true }]} />
      <Stamp at={120} out={165} rotate={-5} style={{ right: 130, top: 520, background: L.yellow, color: L.ink, fontSize: 76, fontWeight: 800, padding: "18px 40px", borderRadius: 18, boxShadow: "0 18px 40px rgba(15,23,42,.25)" }}>簡稱也找得到！</Stamp>
      <div style={{ position: "absolute", left: 120, bottom: 70, display: "flex", gap: 20, zIndex: 20 }}>
        <Chip at={135} out={165} bg={C.warnBg}>不確定 → 標黃色</Chip>
        <Chip at={150} out={165} bg={C.badBg}>找不到 → 標紅色</Chip>
      </div>
    </>
  );
};

// ── 12～18 秒：統編查公司 ─────────────────────────────────────
export const IdV2: React.FC = () => {
  const f = useCurrentFrame();
  const grow = (w: number) => interpolate(f, [64, 78], [0, w], { ...clamp, easing: easeInOut });
  const headerIn = interpolate(f, [70, 78], [0, 1], clamp);
  const head = (v: string): Cell => ({ v, bold: true, bg: C.accentSoft, opacity: headerIn });
  const rows: Cell[][] = [
    [{ v: "廠商統編", bold: true }, head("統編檢查"), head("名稱"), head("地址"), head("資本額")],
    ...ID_ROWS.map((r, i) => {
      const t = interpolate(f, [74 + i * 6, 80 + i * 6], [0, 1], { ...clamp, easing: easeOut });
      const bad = r.check !== "正確";
      const bg = t > 0.3 && bad ? C.badBg : undefined;
      return [{ v: r.input }, { v: r.check, opacity: t, bg, color: bad ? C.bad : C.ok, bold: bad }, { v: r.name, opacity: t, bg }, { v: r.address, opacity: t, bg }, { v: money(r.capital), opacity: t, bg, align: "right" }] as Cell[];
    }),
  ];
  const press = interpolate(f, [60, 64, 70], [0, 1, 0], clamp);
  const sidebar = (
    <div>
      <PanelTabs active={1} />
      <div style={{ padding: "4px 24px" }}>
        <PanelH>統編在哪一欄？</PanelH>
        <PanelBox>A 欄：廠商統編 ▾</PanelBox>
        <PanelH>要填哪些資料？</PanelH>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 10px" }}>
          <Check on label="名稱" /><Check on label="地址" /><Check on={f >= 47} label="資本額" /><Check on={false} label="設立日期" /><Check on={false} label="組織別" /><Check on={false} label="行業" />
        </div>
        <div style={{ marginTop: 16 }}><Check on label="順便檢查統編有沒有打錯" /></div>
        <PanelButton label="開始填入" press={press} />
      </div>
    </div>
  );
  return (
    <>
      <Camera shots={[FULL(0), FULL(22), PANEL(36, 790), PANEL(64, 790), { f: 80, ...win(620, 300), scale: 1.25 }, { f: 112, ...win(620, 300), scale: 1.25 }, { f: 124, ...win(560, 344), scale: 1.65 }, { f: 165, ...win(560, 344), scale: 1.7 }]}>
        <WindowIn exit={165}>
          <Window
            title="廠商資料" cellRef="A4" formula="2209-9131" frozenAfter={1} sidebarWidth={430} sidebar={sidebar} rows={rows}
            cols={[{ letter: "A", width: 150 }, { letter: "B", width: grow(130) }, { letter: "C", width: grow(330) }, { letter: "D", width: grow(370) }, { letter: "E", width: grow(200) }]}
            cursor={<Cursor path={[{ f: 0, x: 1100, y: 600 }, { f: 38, x: 1286, y: 466 }, { f: 48, x: 1286, y: 466 }, { f: 57, x: 1466, y: 612 }, { f: 90, x: 1500, y: 680 }]} clicks={[45, 60]} />}
          />
        </WindowIn>
      </Camera>
      <Headline out={163} words={[{ t: "知道統編？", at: 0, hl: true }, { t: "資料", at: 15 }, { t: "自動填好", at: 30 }]} />
      <Stamp at={120} out={165} rotate={4} style={{ right: 150, top: 780, background: L.red, color: "#fff", fontSize: 72, fontWeight: 800, padding: "18px 40px", borderRadius: 18, boxShadow: "0 18px 40px rgba(15,23,42,.25)" }}>打錯一碼也抓到！</Stamp>
    </>
  );
};

// ── 18～26 秒：新公司名單 ─────────────────────────────────────
const KEYWORD = "餐飲 咖啡 飲料";
export const NewV2: React.FC = () => {
  const f = useCurrentFrame();
  const typed = KEYWORD.slice(0, Math.round(interpolate(f, [47, 75], [0, KEYWORD.length], clamp)));
  const onNew = f >= 95;
  const press = interpolate(f, [90, 94, 100], [0, 1, 0], clamp);
  const rows: Cell[][] = onNew
    ? [
        [{ v: <span style={{ color: C.muted, fontStyle: "italic" }}>臺北市｜最近 30 天設立｜行業或名稱含：餐飲 咖啡 飲料｜不含分公司｜共 23 家</span>, overflow: true }],
        ["設立日期", "公司名稱", "統編", "地址", "資本額", "行業"].map((v) => ({ v, bold: true, bg: C.accentSoft })),
        ...NEW_ROWS.slice(0, 9).map((r, i) => {
          const t = interpolate(f, [100 + i * 5, 107 + i * 5], [0, 1], { ...clamp, easing: easeOut });
          const bg = i % 2 === 1 ? "#f3f3f3" : undefined;
          return [{ v: r.date, opacity: t, bg }, { v: r.name, opacity: t, bg }, { v: r.id, opacity: t, bg }, { v: r.address, opacity: t, bg }, { v: money(r.capital), opacity: t, bg, align: "right" }, { v: r.industry, opacity: t, bg }] as Cell[];
        }),
      ]
    : [[{ v: "客戶名稱", bold: true }, { v: "統編", bold: true, bg: C.accentSoft }, { v: "正式名稱", bold: true, bg: C.accentSoft }, { v: "比對結果", bold: true, bg: C.accentSoft }], ...NAME_ROWS.map((r) => [{ v: r.q }, { v: r.id }, { v: r.name }, { v: r.status }] as Cell[])];
  const cols = onNew
    ? [{ letter: "A", width: 140 }, { letter: "B", width: 270 }, { letter: "C", width: 120 }, { letter: "D", width: 320 }, { letter: "E", width: 130 }, { letter: "F", width: 230 }]
    : [{ letter: "A", width: 170 }, { letter: "B", width: 130 }, { letter: "C", width: 390 }, { letter: "D", width: 130 }];
  const sidebar = (
    <div>
      <PanelTabs active={2} />
      <div style={{ padding: "4px 24px" }}>
        <PanelH>期間</PanelH>
        <PanelBox>最近 30 天 ▾</PanelBox>
        <PanelH>縣市</PanelH>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px 6px" }}>
          {["臺北市", "新北市", "桃園市", "臺中市", "臺南市", "高雄市"].map((c) => <Check key={c} on={c === "臺北市" && f >= 32} label={c} />)}
        </div>
        <PanelH>行業或名稱</PanelH>
        <PanelBox focus={f >= 45 && f < 90 ? 1 : 0}>
          {typed || <span style={{ color: C.muted }}>例如：餐飲 咖啡 物流</span>}
          {f >= 45 && f < 82 && Math.floor(f / 6) % 2 === 0 && <span style={{ color: C.accent }}>|</span>}
        </PanelBox>
        <div style={{ marginTop: 16 }}><Check on label="不含分公司" /></div>
        <PanelButton label="產生名單" press={press} />
      </div>
    </div>
  );
  const card = interpolate(f, [225, 233], [1, 0], clamp);
  return (
    <>
      <Camera shots={[FULL(0), FULL(14), PANEL(26, 760, 1.6), PANEL(92, 760, 1.6), FULL(108, 1), { f: 225, x: 960, y: 640, scale: 1.04 }]}>
        <WindowIn exit={225}>
          <Window
            title="客戶名單" cellRef={onNew ? "A3" : "A1"} formula={onNew ? NEW_ROWS[0].date : "客戶名稱"} frozenAfter={onNew ? 2 : 1} sidebarWidth={430} sidebar={sidebar} rows={rows} cols={cols}
            tabs={[{ name: "工作表1", on: !onNew }, ...(onNew ? [{ name: "新公司 10/10", on: true, appear: interpolate(f, [95, 103], [0, 1], { ...clamp, easing: easeOut }) }] : [])]}
            cursor={<Cursor path={[{ f: 0, x: 900, y: 600 }, { f: 26, x: 1286, y: 402 }, { f: 33, x: 1286, y: 402 }, { f: 42, x: 1400, y: 542 }, { f: 76, x: 1400, y: 542 }, { f: 87, x: 1466, y: 664 }, { f: 120, x: 1520, y: 740 }]} clicks={[30, 45, 90]} />}
          />
        </WindowIn>
      </Camera>
      <Headline out={223} words={[{ t: "最近開了", at: 0 }, { t: "哪些公司？", at: 15, hl: true }]} />
      {f >= 165 && (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 70, display: "flex", justifyContent: "center", zIndex: 20, opacity: card }}>
          <Pop at={165} bounce={9} style={{ display: "flex", alignItems: "center", gap: 30, background: L.ink, color: "#fff", padding: "22px 44px", borderRadius: 28, boxShadow: "0 24px 60px rgba(15,23,42,.35)" }}>
            <span style={{ fontSize: 110, fontWeight: 800, color: L.yellow, lineHeight: 1 }}><Counter at={165} dur={14} to={23} /></span>
            <span style={{ fontSize: 48, fontWeight: 700, lineHeight: 1.3 }}>家新公司<br /><span style={{ fontSize: 30, color: "#cbd5e1", fontWeight: 500 }}>臺北市・30 天內・餐飲咖啡</span></span>
          </Pop>
        </div>
      )}
      <div style={{ position: "absolute", right: 140, top: 210, zIndex: 20 }}>
        <Chip at={195} out={225} bg={L.blue} color="#fff">每天自動更新</Chip>
      </div>
    </>
  );
};

// ── 26～30 秒：三個重點 → 產品名 ─────────────────────────────
export const OutroV2: React.FC = () => {
  const f = useCurrentFrame();
  const pts = [{ big: "76 萬家", small: "全台公司" }, { big: "每天", small: "自動更新" }, { big: "免下載", small: "試算表直接用" }];
  return (
    <>
      <div style={{ position: "absolute", inset: 0, display: "flex", justifyContent: "center", alignItems: "center", gap: 50 }}>
        {pts.map((p, i) => (
          <Pop key={p.big} at={i * 15} out={52} style={{ width: 480, padding: "46px 0", borderRadius: 32, background: "#fff", textAlign: "center", boxShadow: "0 24px 60px rgba(15,23,42,.14)" }}>
            <div style={{ fontSize: 110, fontWeight: 800, color: L.blue, lineHeight: 1.1 }}>{p.big}</div>
            <div style={{ fontSize: 46, color: L.sub, fontWeight: 700, marginTop: 6 }}>{p.small}</div>
          </Pop>
        ))}
      </div>
      {f >= 60 && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 44, fontFamily }}>
          <Pop at={60} bounce={8} style={{ display: "flex", alignItems: "center", gap: 36 }}>
            <span style={{ width: 120, height: 150, borderRadius: 14, background: C.sheetsGreen, position: "relative", display: "inline-block" }}>
              <span style={{ position: "absolute", inset: "48px 26px 30px", border: "9px solid #fff", borderRadius: 4 }} />
            </span>
            <span style={{ fontSize: 150, fontWeight: 800, color: L.ink, letterSpacing: 6 }}>公司統編查詢</span>
          </Pop>
          <Pop at={75} style={{ fontSize: 66, fontWeight: 700, color: L.ink }}>
            貼上名單，<span style={{ background: L.yellow, padding: "0 18px", borderRadius: 14 }}>一鍵完成</span>
          </Pop>
        </div>
      )}
    </>
  );
};

