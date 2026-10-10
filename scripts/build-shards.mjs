// 把財政部全國營業(稅籍)登記 CSV 轉成依統編前 4 碼分組的小 JSON 檔。
// 只收公司（有限公司、股份有限公司、分公司…），獨資、合夥、其他先不收。
//
// 用法：node scripts/build-shards.mjs <BGMOPEN1.csv> <輸出資料夾>
// 輸出：<輸出>/v1/<前4碼>.json  { "<統編>": [名稱, 地址, 資本額, 設立日期, 組織別, 開發票, 總機構統編, 行業] }
//       <輸出>/v1/meta.json     欄位說明、資料日期、筆數、出處
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { createRequire } from 'node:module';
import { parseCsvLine } from './csv.mjs';

const names = createRequire(import.meta.url)('../src/names.js');

export const COMPANY_TYPES = new Set([
  '有限公司', '股份有限公司', '本國公司設立之分公司', '外國公司在台之分公司',
  '外國公司在台之辦事處', '無限公司', '兩合公司',
]);
export const FIELDS = ['名稱', '地址', '資本額', '設立日期', '組織別', '開發票', '總機構統編', '行業'];

// 民國 yyyMMdd（例 1040413）→ 西元 2015-04-13；格式不對就原樣留著
export function rocToIso(s) {
  const m = /^(\d{2,3})(\d{2})(\d{2})$/.exec(s);
  if (!m) return s;
  return `${Number(m[1]) + 1911}-${m[2]}-${m[3]}`;
}

// 顯示用的整理：全形英數與符號轉半形（「１段２１－３」→「1段21-3」），去掉字中間的全形空白（「東　區」→「東區」）
export function tidyText(s) {
  return String(s ?? '')
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/　+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function toRecord(f) {
  const industries = [];
  for (let i = 9; i <= 15; i += 2) if (f[i]) industries.push(tidyText(f[i]));
  return [
    tidyText(f[3]), tidyText(f[0]), f[4] === '' ? null : Number(f[4]), rocToIso(f[5]), f[6],
    f[7] === 'Y', f[2] || null, industries.join('、'),
  ];
}

// 名稱索引：每個字一個檔 n/<16進位碼>.json＝[[統編, 名稱, 資本額, 分公司?1:0], …]，
// 另有 n/chars.json＝{ 字: 公司數 } 讓查詢端挑最少公司用到的字。太常見的字不建檔。
export function writeNameIndex(shards, nameDir, max = names.NAME_INDEX_MAX) {
  const byChar = new Map();
  for (const obj of shards.values()) {
    for (const [id, r] of Object.entries(obj)) {
      const entry = [id, r[0], r[2] ?? 0, r[6] ? 1 : 0];
      for (const ch of new Set(Array.from(names.normalizeName(r[0])))) {
        if (!byChar.has(ch)) byChar.set(ch, []);
        byChar.get(ch).push(entry);
      }
    }
  }
  fs.mkdirSync(nameDir, { recursive: true });
  const counts = {};
  for (const [ch, list] of byChar) {
    if (list.length > max) continue;
    counts[ch] = list.length;
    fs.writeFileSync(path.join(nameDir, `${names.nameIndexKey(ch)}.json`), JSON.stringify(list));
  }
  fs.writeFileSync(path.join(nameDir, 'chars.json'), JSON.stringify(counts));
  return Object.keys(counts).length;
}

// 新設立公司：設立日期在最近 RECENT_DAYS 天內的公司，存成 new/recent.json。
// 財政部資料會晚 2～3 週才出現，所以另外記「第一次出現在資料裡的日期」（seen）：
// 從前一天發布的 recent.json 接續，沒出現過的就是今天。
// rows：[統編, 名稱, 地址, 資本額, 設立日期, 行業, 分公司?1:0, 首次出現日期|null]
export const RECENT_DAYS = 180;
export const RECENT_FIELDS = ['統編', '名稱', '地址', '資本額', '設立日期', '行業', '分公司', '首次出現'];

export function taiwanToday(now = new Date()) {
  return new Date(now.getTime() + 8 * 3600e3).toISOString().slice(0, 10);
}

function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function buildRecent(shards, today, prev) {
  const cutoff = addDays(today, -RECENT_DAYS);
  const prevSeen = new Map((prev?.rows || []).map((r) => [r[0], r[7]]));
  // 第一次建這份清單時，所有公司都是「之前就有了」，seen 記 null；之後新冒出來的才記日期
  const trackingSince = prev?.trackingSince || today;
  const rows = [];
  for (const obj of shards.values()) {
    for (const [id, r] of Object.entries(obj)) {
      if (!/^\d{4}-\d\d-\d\d$/.test(r[3]) || r[3] < cutoff || r[3] > today) continue;
      const seen = prevSeen.has(id) ? prevSeen.get(id) : prev ? today : null;
      rows.push([id, r[0], r[1], r[2], r[3], r[7], r[6] ? 1 : 0, seen]);
    }
  }
  rows.sort((a, b) => (b[4] < a[4] ? -1 : b[4] > a[4] ? 1 : a[0] < b[0] ? -1 : 1));
  return { fields: RECENT_FIELDS, today, days: RECENT_DAYS, trackingSince, rows };
}

// 抓前一天發布的清單；抓不到（第一次、網站暫時掛掉）就回 null，「首次出現」會從今天重新開始追蹤
async function fetchPrevRecent(url) {
  if (!url) return null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(url);
      if (r.status === 404) return null;
      if (r.ok) {
        const j = await r.json();
        return Array.isArray(j.rows) ? j : null;
      }
    } catch { /* 重試 */ }
    await new Promise((ok) => setTimeout(ok, 5000 * attempt));
  }
  console.warn('抓不到前一天的新公司清單，「首次出現」從今天重新追蹤');
  return null;
}

export async function buildShards(csvFile, outDir, { minCompanies = 500000, nameIndexMax, today = taiwanToday(), prevRecent, prevRecentUrl } = {}) {
  const rl = readline.createInterface({ input: fs.createReadStream(csvFile, 'utf8'), crlfDelay: Infinity });
  const shards = new Map();
  let header = null, dataDate = null, rows = 0, kept = 0;
  for await (const raw of rl) {
    const line = raw.replace(/^﻿/, '');
    if (!header) { header = parseCsvLine(line); continue; }
    if (!dataDate && /^\d\d-[A-Z]{3}-\d\d,/.test(line)) { dataDate = line.slice(0, 9); continue; }
    rows++;
    const f = parseCsvLine(line);
    if (f.length !== header.length) throw new Error(`第 ${rows} 筆欄位數不對：${f.length}`);
    if (!COMPANY_TYPES.has(f[6]) || !/^\d{8}$/.test(f[1])) continue;
    const key = f[1].slice(0, 4);
    if (!shards.has(key)) shards.set(key, {});
    shards.get(key)[f[1]] = toRecord(f);
    kept++;
  }
  if (header?.[1] !== '統一編號' || header?.[3] !== '營業人名稱') throw new Error('CSV 欄位跟預期不同，財政部可能改了格式：' + header);
  if (kept < minCompanies) throw new Error(`公司只有 ${kept} 家，少得不正常，不發布`);

  const dir = path.join(outDir, 'v1');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (const [key, obj] of shards) fs.writeFileSync(path.join(dir, `${key}.json`), JSON.stringify(obj));
  const nameFiles = writeNameIndex(shards, path.join(dir, 'n'), nameIndexMax);
  const prev = prevRecent ?? await fetchPrevRecent(prevRecentUrl);
  const recent = buildRecent(shards, today, prev);
  fs.mkdirSync(path.join(dir, 'new'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'new', 'recent.json'), JSON.stringify(recent));
  const newToday = recent.rows.filter((r) => r[7] === today).length;
  const meta = {
    fields: FIELDS, dataDate, builtAt: new Date().toISOString(), companies: kept, shards: shards.size, nameFiles,
    recent: recent.rows.length, newToday, trackingSince: recent.trackingSince,
    source: '財政部財政資訊中心「全國營業(稅籍)登記資料集」，依政府資料開放授權條款－第1版使用',
  };
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 1));
  return { rows, ...meta };
}

if (process.argv[1]?.endsWith('build-shards.mjs')) {
  const [csv, out] = process.argv.slice(2);
  if (!csv || !out) { console.error('用法：node scripts/build-shards.mjs <csv> <輸出資料夾>'); process.exit(1); }
  // 在 GitHub Actions 上接續前一天發布的新公司清單；本機不接（除非有設 PREV_RECENT_URL）
  const prevRecentUrl = process.env.PREV_RECENT_URL
    || (process.env.GITHUB_ACTIONS ? 'https://arzoom-git.github.io/company-lookup/v1/new/recent.json' : null);
  const r = await buildShards(csv, out, { prevRecentUrl });
  console.log(`讀 ${r.rows} 筆，收公司 ${r.companies} 家，${r.shards} 個檔，名稱索引 ${r.nameFiles} 個字，資料日期 ${r.dataDate}`);
  console.log(`近 ${RECENT_DAYS} 天新設立 ${r.recent} 家，今天新出現 ${r.newToday} 家（從 ${r.trackingSince} 開始追蹤）`);
}
