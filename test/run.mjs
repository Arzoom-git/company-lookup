// node test/run.mjs — 不連網、不用真資料：用 test/fixture.csv 建小檔，再模擬 Apps Script 跑自訂函式
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { buildShards, rocToIso } from '../scripts/build-shards.mjs';
import { parseCsvLine } from '../scripts/csv.mjs';

const require = createRequire(import.meta.url);
const { normalizeTaxId, isValidTaxIdChecksum, checkTaxId } = require('../src/taxid.js');
const root = path.dirname(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')));

test('統編檢查碼', () => {
  assert.equal(isValidTaxIdChecksum('22099131'), true);
  assert.equal(isValidTaxIdChecksum('22099132'), false);
  assert.equal(isValidTaxIdChecksum('04595257'), true);
  // 第 7 碼是 7：加 1 能被 5 整除也算對
  assert.equal(isValidTaxIdChecksum('42970576'), true); // 真實統編，總和 39
});

test('統編整理：補 0、全形、空白與橫線', () => {
  assert.equal(normalizeTaxId(4595257), '04595257');
  assert.equal(normalizeTaxId('０４５９５２５７'), '04595257');
  assert.equal(normalizeTaxId(' 2209-9131 '), '22099131');
  assert.equal(normalizeTaxId('4595257'), null); // 文字格式少一碼，不亂補
  assert.equal(normalizeTaxId('123456789'), null);
  assert.equal(checkTaxId(''), '');
  assert.equal(checkTaxId('abc'), '不是 8 碼數字');
  assert.equal(checkTaxId(22099132), '檢查碼錯誤');
});

test('CSV 解析與民國日期', () => {
  assert.deepEqual(parseCsvLine('"a,b",1,"x""y"'), ['a,b', '1', 'x"y']);
  assert.equal(rocToIso('1040413'), '2015-04-13');
  assert.equal(rocToIso('0760321'), '1987-03-21');
  assert.equal(rocToIso(''), '');
});

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'shards-'));
const built = await buildShards(path.join(root, 'test/fixture.csv'), out, { minCompanies: 1, today: '2026-10-10' });

test('切檔：只收公司，獨資不收', () => {
  assert.equal(built.companies, 12);
  assert.equal(built.dataDate, '10-OCT-26');
  const s = JSON.parse(fs.readFileSync(path.join(out, 'v1/2209.json'), 'utf8'));
  assert.deepEqual(s['22099131'].slice(0, 6), ['台灣積體電路製造股份有限公司', '新竹市東區科園里科學園區力行六路8號', 259323700670, '1987-03-21', '股份有限公司', true]);
  assert.equal(s['22099131'][7], '其他積體電路製造、矽晶圓製造');
  assert.equal(s['22099104'][6], '22099131');
  assert.equal(fs.existsSync(path.join(out, 'v1/3896.json')), false);
  const t = JSON.parse(fs.readFileSync(path.join(out, 'v1/0459.json'), 'utf8'));
  assert.equal(t['04595257'][0], '測試"引號"有限公司');
  assert.equal(t['04595257'][1], '台中市某路2號,三樓');
});

// 模擬 Apps Script：UrlFetchApp 讀剛剛建好的小檔，CacheService 放記憶體
// 假的工作表：grid 是二維陣列（第 1 列＝grid[0]），記錄寫入的值與底色
function fakeSheet(grid) {
  const bg = {};
  let frozen = 0;
  const width = () => Math.max(0, ...grid.map((r) => r.length));
  const range = (row, col, h = 1, w = 1) => ({
    getValues: () => Array.from({ length: h }, (_, i) => Array.from({ length: w }, (_, j) => grid[row - 1 + i]?.[col - 1 + j] ?? '')),
    setValues(v) { v.forEach((r, i) => r.forEach((x, j) => { (grid[row - 1 + i] ||= [])[col - 1 + j] = x; })); return this; },
    setValue(x) { (grid[row - 1] ||= [])[col - 1] = x; return this; },
    setBackgrounds(v) { v.forEach((r, i) => r.forEach((x, j) => { bg[`${row + i},${col + j}`] = x; })); return this; },
    setBackground() { return this; },
    setFontWeight() { return this; },
    setFontColor() { return this; },
    setFontStyle() { return this; },
    setNumberFormat() { return this; },
    applyRowBanding() { return this; },
  });
  const sheet = {
    name: '工作表1',
    getName() { return this.name; }, getLastRow: () => grid.length, getLastColumn: width, getRange: range,
    getColumnWidth: () => 100, setColumnWidth: () => {},
    insertRowBefore: (r) => { grid.splice(r - 1, 0, []); },
    insertColumnsAfter: (c, n) => { grid.forEach((row) => { if (row.length > c) row.splice(c, 0, ...Array(n).fill('')); }); },
    autoResizeColumns: () => {},
    getFrozenRows: () => frozen,
    setFrozenRows: (n) => { frozen = n; },
  };
  return { grid, bg, sheet };
}

function loadAddon(grid = []) {
  const fetched = [];
  const store = new Map();
  const fake = fakeSheet(grid);
  const serve = (url) => {
    fetched.push(url);
    const f = path.join(out, 'v1', url.split('/v1/')[1]);
    const ok = fs.existsSync(f);
    return { getResponseCode: () => (ok ? 200 : 404), getContentText: () => (ok ? fs.readFileSync(f, 'utf8') : '') };
  };
  const sheets = [fake];
  const ss = {
    insertSheet: (name) => { const s = fakeSheet([]); s.sheet.name = name; sheets.push(s); return s.sheet; },
    getSheetByName: (name) => sheets.find((s) => s.sheet.getName() === name)?.sheet ?? null,
    setActiveSheet: () => {},
  };
  const ctx = {
    SpreadsheetApp: { getActiveSheet: () => fake.sheet, getActiveSpreadsheet: () => ss, BandingTheme: { LIGHT_GREY: 'LIGHT_GREY' } },
    UrlFetchApp: {
      fetch: (url) => serve(url),
      fetchAll: (reqs) => reqs.map(({ url }) => serve(url)),
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => store.get(k) ?? null,
        put: (k, v) => { store.set(k, v); },
        getAll: (keys) => Object.fromEntries(keys.filter((k) => store.has(k)).map((k) => [k, store.get(k)])),
        putAll: (obj) => { for (const [k, v] of Object.entries(obj)) store.set(k, v); },
      }),
    },
  };
  vm.createContext(ctx);
  for (const f of ['src/taxid.js', 'src/names.js', 'addon/Lookup.js', 'addon/NameSearch.js', 'addon/NewCompanies.js', 'addon/Panel.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
  return { ctx, fetched, fake, sheets };
}

test('面板：猜統編欄、結果插在統編欄右邊、查無與格式錯誤上色', () => {
  const grid = [
    ['廠商', '統編', '備註'],
    ['台積電', '22099131', ''],
    ['亂打', '22099132', ''],
    ['小店', '38965019', 'x'],
    ['空白', '', ''],
    ['數字型', 4595257, ''],
  ];
  const { ctx, fake } = loadAddon(grid);
  const info = ctx.getSheetInfo();
  assert.equal(info.guess, 2);
  assert.equal(info.columns[1].header, '統編');

  assert.equal(info.hasHeader, true);

  const s = ctx.fillCompanyData({ column: 2, fields: ['名稱', '資本額'], check: true });
  assert.deepEqual({ ...s }, { found: 2, notFound: 1, invalid: 1, blank: 1, firstColumn: 'C', lastColumn: 'E', addedHeaderRow: false, updated: false });
  assert.deepEqual(grid[0], ['廠商', '統編', '統編檢查', '名稱', '資本額', '備註']);
  assert.deepEqual(grid[1], ['台積電', '22099131', '正確', '台灣積體電路製造股份有限公司', 259323700670, '']);
  assert.deepEqual(grid[2].slice(2, 5), ['檢查碼錯誤', '', '']);
  assert.deepEqual(grid[3], ['小店', '38965019', '正確', '查無（可能不是公司或已不營業）', '', 'x']);
  assert.deepEqual(grid[5].slice(2, 5), ['正確', '測試"引號"有限公司', 1000000]);
  assert.equal(fake.bg['3,3'], '#fde2e1');
  assert.equal(fake.bg['4,4'], '#fff4c2');
  assert.equal(fake.bg['2,3'], null);
});

test('面板：第一列就是資料時，在最上面補一列標題', () => {
  const grid = [['22099131'], ['22099104']];
  const { ctx } = loadAddon(grid);
  assert.equal(ctx.getSheetInfo().hasHeader, false);
  const s = ctx.fillCompanyData({ column: 1, fields: ['名稱'], check: false });
  assert.equal(s.found, 2);
  assert.equal(s.addedHeaderRow, true);
  assert.deepEqual(grid, [
    ['統編', '名稱'],
    ['22099131', '台灣積體電路製造股份有限公司'],
    ['22099104', '台灣積體電路製造股份有限公司台北分公司'],
  ]);
});

test('面板：沒勾任何欄位要報錯', () => {
  const { ctx } = loadAddon([['22099131']]);
  assert.throws(() => ctx.fillCompanyData({ column: 1, fields: [], check: false }), /至少勾一個/);
});

test('統編查詢：單格、欄位、查無、格式錯誤', () => {
  const { ctx } = loadAddon();
  assert.equal(ctx.統編查詢('22099131'), '台灣積體電路製造股份有限公司');
  assert.equal(ctx.統編查詢(22099131, '資本額'), 259323700670);
  assert.equal(ctx.統編查詢('22099131', '開發票'), '是');
  assert.equal(ctx.統編查詢(4595257, '地址'), '台中市某路2號,三樓');
  assert.equal(ctx.統編查詢('38965019'), '查無（可能不是公司或已不營業）');
  assert.equal(ctx.統編查詢('22099132'), '統編格式錯誤');
  assert.equal(ctx.統編查詢(''), '');
  assert.throws(() => ctx.統編查詢('22099131', '電話'), /欄位要填/);
  assert.equal(ctx.COMPANY_LOOKUP('22099131'), '台灣積體電路製造股份有限公司');
});

test('統編查詢：一整欄，同一個小檔只抓一次，第二次走快取', () => {
  const { ctx, fetched } = loadAddon();
  const col = [['22099131'], ['22099104'], [''], ['04595257']];
  assert.deepEqual(ctx.統編查詢(col), [['台灣積體電路製造股份有限公司'], ['台灣積體電路製造股份有限公司台北分公司'], [''], ['測試"引號"有限公司']]);
  assert.equal(fetched.length, 2);
  ctx.統編查詢(col, '地址');
  assert.equal(fetched.length, 2);
});

test('統編查詢「全部」：每個統編展開成一列', () => {
  const { ctx } = loadAddon();
  const rows = ctx.統編查詢([['22099131'], ['38965019']], '全部');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].length, 8);
  assert.equal(rows[0][0], '台灣積體電路製造股份有限公司');
  assert.equal(rows[1][0], '查無（可能不是公司或已不營業）');
  assert.equal(ctx.統編查詢('22099131', '全部').length, 1);
});

test('統編檢查：一整欄', () => {
  const { ctx } = loadAddon();
  assert.deepEqual(ctx.統編檢查([['22099131'], ['22099132'], ['abc']]), [['正確'], ['檢查碼錯誤'], ['不是 8 碼數字']]);
  assert.equal(ctx.TAXID_CHECK(4595257), '正確');
});

test('名稱索引：常見字不建檔、臺台視為同一字', () => {
  const counts = JSON.parse(fs.readFileSync(path.join(out, 'v1/n/chars.json'), 'utf8'));
  assert.equal(counts['碩'], 2);
  assert.equal(counts['台'], 3); // 台積電、台積電台北分公司、臺灣銀行
  assert.equal(counts['臺'], undefined);
  const tsmc = JSON.parse(fs.readFileSync(path.join(out, 'v1/n/7a4d.json'), 'utf8')); // 積
  assert.deepEqual(tsmc.map((r) => r[0]).sort(), ['22099104', '22099131']);
});

test('名稱找統編：簡稱、大公司優先、分公司排後面、太籠統、查無', () => {
  const { ctx } = loadAddon();
  assert.equal(ctx.名稱找統編('台積電'), '22099131');
  assert.equal(ctx.名稱找統編('華碩'), '23638777');
  assert.equal(ctx.名稱找統編('鴻海'), '04541302');
  assert.equal(ctx.名稱找統編('台灣銀行'), '03557311');
  assert.equal(ctx.名稱找統編('華碩電腦股份有限公司', '名稱'), '華碩電腦股份有限公司');
  assert.deepEqual([...ctx.名稱找統編('有限公司', '全部')[0]], ['', '', '名稱太籠統']);
  assert.equal(ctx.名稱找統編('不存在的龘公司'), '');
  assert.deepEqual(ctx.名稱找統編([['台積電'], [''], ['鴻海']]).map((r) => r[0]), ['22099131', '', '04541302']);
  assert.equal(ctx.COMPANY_ID_BY_NAME('長榮航空', '比對結果'), '查無');
});

test('面板：整欄用名稱找統編，請確認上黃色，查無上紅色', () => {
  const grid = [['客戶名稱'], ['華碩電腦'], ['鴻海'], ['龘龘'], [''], ['台積電']];
  const { ctx, fake } = loadAddon(grid);
  assert.equal(ctx.getSheetInfo().nameGuess, 1);
  const s = ctx.fillCompanyIds({ column: 1, hasHeader: true });
  assert.equal(s.notFound, 1);
  assert.equal(s.blank, 1);
  assert.deepEqual(grid[0].slice(1), ['統編', '正式名稱', '比對結果', '其他可能']);
  assert.deepEqual(grid[1].slice(1, 4), ['23638777', '華碩電腦股份有限公司', '確定']);
  assert.equal(grid[2][1], '04541302');
  assert.equal(grid[2][3], '確定');
  assert.equal(grid[2][4], ''); // 確定的列不列其他可能
  assert.equal(grid[3][3], '查無');
  assert.equal(fake.bg['4,2'], '#fde2e1');
  const r = ctx.searchCompanyName('華碩');
  assert.equal(r.candidates[0].id, '23638777');
  assert.equal(r.candidates.length, 2);
});

test('面板：名稱欄第一列就是公司名稱，不會被當成標題', () => {
  const grid = [['華碩電腦'], ['鴻海']];
  const { ctx } = loadAddon(grid);
  const s = ctx.fillCompanyIds({ column: 1 });
  assert.equal(s.addedHeaderRow, true);
  assert.deepEqual(grid[0], ['公司名稱', '統編', '正式名稱', '比對結果', '其他可能']);
  assert.deepEqual(grid[1].slice(0, 3), ['華碩電腦', '23638777', '華碩電腦股份有限公司']);
  assert.equal(grid[2][1], '04541302');
});

test('顯示用整理：全形英數轉半形、去掉全形空白', async () => {
  const { tidyText } = await import('../scripts/build-shards.mjs');
  assert.equal(tidyText('臺北市中正區信義路１段２１－３號'), '臺北市中正區信義路1段21-3號');
  assert.equal(tidyText('新竹市東　區'), '新竹市東區');
  assert.equal(tidyText('ＡＢＣ（台灣）有限公司'), 'ABC(台灣)有限公司');
});

test('面板：按了好幾次只會更新同一組欄，不會一直多插', () => {
  const grid = [['統編', '備註'], ['22099131', 'a'], ['96979933', 'b']];
  const { ctx } = loadAddon(grid);
  ctx.fillCompanyData({ column: 1, fields: ['名稱'], check: false });
  const again = ctx.fillCompanyData({ column: 1, fields: ['名稱'], check: false });
  assert.equal(again.updated, true);
  assert.deepEqual(grid[0], ['統編', '名稱', '備註']);
  assert.equal(grid[2][1], '查無（可能不是公司或已不營業）');
});

test('面板：選錯欄或選到空欄會講清楚，不會亂插欄', () => {
  const grid = [['96979933', ''], ['22099131', '']];
  const { ctx } = loadAddon(grid);
  const info = ctx.getSheetInfo();
  assert.deepEqual([...info.columns].map((c) => c.letter), ['A']); // 空的 B 欄不列
  assert.equal(info.guess, 1);
  assert.equal(info.nameGuess, null);
  assert.throws(() => ctx.fillCompanyIds({ column: 1 }), /這一欄是統編/);
  assert.throws(() => ctx.fillCompanyIds({ column: 2 }), /B 欄是空的/);
  assert.equal(grid[0].length, 2); // 什麼都沒插
  const names = loadAddon([['公司'], ['華碩電腦']]);
  assert.throws(() => names.ctx.fillCompanyData({ column: 1, fields: ['名稱'] }), /看起來是公司名稱/);
});

test('面板：標題叫「廠商統編」的統編欄，不會被當成名稱欄', () => {
  const { ctx } = loadAddon([['廠商統編', '金額'], ['96979933', 1], ['22099131', 2]]);
  const info = ctx.getSheetInfo();
  assert.equal(info.guess, 1);
  assert.equal(info.nameGuess, null);
});

test('新公司清單：近半年、第一次建清單時首次出現是空的', async () => {
  const recent = JSON.parse(fs.readFileSync(path.join(out, 'v1/new/recent.json'), 'utf8'));
  assert.equal(recent.today, '2026-10-10');
  assert.equal(recent.trackingSince, '2026-10-10');
  assert.deepEqual(recent.rows.map((r) => r[0]), ['60000009', '60000004', '60000010']); // 新到舊，老公司不收
  assert.deepEqual(recent.rows[1], ['60000004', '晨曦咖啡有限公司', '臺北市大安區某路6號', 500000, '2026-09-30', '咖啡館', 0, null]);
});

test('新公司清單：接續前一天的清單，新冒出來的記今天', async () => {
  const { buildRecent } = await import('../scripts/build-shards.mjs');
  const shards = new Map([['6000', {
    60000004: ['晨曦咖啡有限公司', 'x', 1, '2026-09-30', '有限公司', true, null, '咖啡館'],
    60000010: ['鼎峰物流股份有限公司', 'y', 2, '2026-08-01', '股份有限公司', true, null, '倉儲'],
  }]]);
  const prev = { trackingSince: '2026-09-01', rows: [['60000004', '', '', 0, '', '', 0, '2026-10-01']] };
  const r = buildRecent(shards, '2026-10-11', prev);
  assert.equal(r.trackingSince, '2026-09-01');
  assert.deepEqual(Object.fromEntries(r.rows.map((x) => [x[0], x[7]])), { 60000004: '2026-10-01', 60000010: '2026-10-11' });
});

test('新公司名單：縣市（台＝臺）、關鍵字、資本額、期間、分公司', () => {
  const { ctx } = loadAddon();
  const recent = JSON.parse(fs.readFileSync(path.join(out, 'v1/new/recent.json'), 'utf8'));
  const ids = (o) => Array.from(ctx.filterNewCompanies_(recent, o).rows, (x) => x.row[2]);
  assert.deepEqual(ids({ days: 180 }), ['60000004', '60000010']); // 預設不含分公司
  assert.deepEqual(ids({ days: 180, excludeBranch: false }), ['60000009', '60000004', '60000010']);
  assert.deepEqual(ids({ days: 30 }), ['60000004']);
  assert.deepEqual(ids({ days: 180, cities: ['臺中市'] }), ['60000010']);
  assert.deepEqual(ids({ days: 180, keyword: '倉儲 冷凍' }), ['60000010']);
  assert.deepEqual(ids({ days: 180, keyword: '咖啡' }), ['60000004']);
  assert.deepEqual(ids({ days: 180, minCapital: 10000000 }), ['60000010']);
  assert.deepEqual(ids({ days: 180, basis: 'seen' }), []); // 第一天還沒有「新進」紀錄
});

test('新公司名單：開新工作表，第 1 列說明條件、第 2 列標題、留備註欄', () => {
  const { ctx, sheets } = loadAddon();
  const s = ctx.makeNewCompanySheet({ days: 90, cities: ['臺北市'], keyword: '咖啡', excludeBranch: true });
  assert.equal(s.sheetName, '新公司 10/10');
  assert.equal(s.total, 1);
  const g = sheets.at(-1).grid;
  assert.equal(g[0][0], '臺北市｜最近 90 天設立｜行業或名稱含：咖啡｜不含分公司｜共 1 家（資料日期 2026-10-10）');
  assert.deepEqual(g[1], ['設立日期', '公司名稱', '統編', '縣市', '地址', '資本額', '行業', '備註']);
  assert.deepEqual(g[2], ['2026-09-30', '晨曦咖啡有限公司', '60000004', '臺北市', '臺北市大安區某路6號', 500000, '咖啡館', '']);
  assert.equal(ctx.makeNewCompanySheet({ days: 90 }).sheetName, '新公司 10/10 (2)'); // 同一天再產一次不會撞名
});
