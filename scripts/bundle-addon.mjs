// 把 src/taxid.js 與 addon/Lookup.js 合成一個檔，方便直接貼進試算表的 Apps Script 編輯器
// 用法：node scripts/bundle-addon.mjs → addon/貼到AppsScript.js
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
const taxid = read('src/taxid.js').replace(/\nif \(typeof module[\s\S]*$/, '\n');
const out = [
  '// 公司統編查詢 — 整份貼進「擴充功能 → Apps Script」的程式碼.gs，存檔後即可在試算表使用',
  '// =統編檢查(A2)　=統編查詢(A2)　=統編查詢(A2, "地址")　=統編查詢(A2, "全部")',
  '// 資料：財政部「全國營業(稅籍)登記資料集」（公司），每日更新 https://arzoom-git.github.io/company-lookup/',
  '// 此檔由 scripts/bundle-addon.mjs 產生，請改 src/taxid.js 或 addon/Lookup.js',
  '',
  taxid.trim(),
  '',
  read('addon/Lookup.js').trim(),
  '',
].join('\n');
fs.writeFileSync(path.join(root, 'addon/貼到AppsScript.js'), out);
console.log('addon/貼到AppsScript.js', out.length, 'chars');
