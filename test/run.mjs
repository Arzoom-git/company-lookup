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
const built = await buildShards(path.join(root, 'test/fixture.csv'), out, { minCompanies: 1 });

test('切檔：只收公司，獨資不收', () => {
  assert.equal(built.companies, 3);
  assert.equal(built.dataDate, '10-OCT-26');
  const s = JSON.parse(fs.readFileSync(path.join(out, 'v1/2209.json'), 'utf8'));
  assert.deepEqual(s['22099131'].slice(0, 6), ['台灣積體電路製造股份有限公司', '新竹市東　區科園里科學園區力行六路８號', 259323700670, '1987-03-21', '股份有限公司', true]);
  assert.equal(s['22099131'][7], '其他積體電路製造、矽晶圓製造');
  assert.equal(s['22099104'][6], '22099131');
  assert.equal(fs.existsSync(path.join(out, 'v1/3896.json')), false);
  const t = JSON.parse(fs.readFileSync(path.join(out, 'v1/0459.json'), 'utf8'));
  assert.equal(t['04595257'][0], '測試"引號"有限公司');
  assert.equal(t['04595257'][1], '台中市某路２號，三樓');
});

// 模擬 Apps Script：UrlFetchApp 讀剛剛建好的小檔，CacheService 放記憶體
function loadAddon() {
  const fetched = [];
  const store = new Map();
  const ctx = {
    UrlFetchApp: {
      fetchAll: (reqs) => reqs.map(({ url }) => {
        fetched.push(url);
        const f = path.join(out, 'v1', url.split('/v1/')[1]);
        const ok = fs.existsSync(f);
        return { getResponseCode: () => (ok ? 200 : 404), getContentText: () => (ok ? fs.readFileSync(f, 'utf8') : '') };
      }),
    },
    CacheService: {
      getScriptCache: () => ({
        getAll: (keys) => Object.fromEntries(keys.filter((k) => store.has(k)).map((k) => [k, store.get(k)])),
        putAll: (obj) => { for (const [k, v] of Object.entries(obj)) store.set(k, v); },
      }),
    },
  };
  vm.createContext(ctx);
  for (const f of ['src/taxid.js', 'addon/Lookup.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
  return { ctx, fetched };
}

test('統編查詢：單格、欄位、查無、格式錯誤', () => {
  const { ctx } = loadAddon();
  assert.equal(ctx.統編查詢('22099131'), '台灣積體電路製造股份有限公司');
  assert.equal(ctx.統編查詢(22099131, '資本額'), 259323700670);
  assert.equal(ctx.統編查詢('22099131', '開發票'), '是');
  assert.equal(ctx.統編查詢(4595257, '地址'), '台中市某路２號，三樓');
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
