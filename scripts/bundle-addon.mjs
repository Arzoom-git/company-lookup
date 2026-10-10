// 把 src/taxid.js 與 addon/Lookup.js 合成一個檔，方便直接貼進試算表的 Apps Script 編輯器
// 用法：node scripts/bundle-addon.mjs → addon/貼到AppsScript.js
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
const shared = (f) => read(f).replace(/\nif \(typeof module[\s\S]*$/, '\n').trim();
const out = [
  '// 公司統編查詢 — 整份貼進「擴充功能 → Apps Script」的程式碼.gs，存檔後重新整理試算表',
  '// 選單「統編查詢 → 開啟面板」；公式：=統編檢查(A2)　=統編查詢(A2, "地址")　=名稱找統編(A2)',
  '// 資料：財政部「全國營業(稅籍)登記資料集」（公司），每日更新 https://arzoom-git.github.io/company-lookup/',
  '// 此檔由 scripts/bundle-addon.mjs 產生，請改 src/taxid.js 或 addon/Lookup.js',
  '',
  shared('src/taxid.js'),
  '',
  shared('src/names.js'),
  '',
  read('addon/Lookup.js').trim(),
  '',
  read('addon/NameSearch.js').trim(),
  '',
  read('addon/NewCompanies.js').trim(),
  '',
  read('addon/Panel.js').trim(),
  '',
  '// 側邊面板的畫面（原檔 addon/Sidebar.html）',
  'var SIDEBAR_HTML_ = ' + JSON.stringify(read('addon/Sidebar.html')) + ';',
  '',
].join('\n');
fs.writeFileSync(path.join(root, 'addon/貼到AppsScript.js'), out);
console.log('addon/貼到AppsScript.js', out.length, 'chars');
