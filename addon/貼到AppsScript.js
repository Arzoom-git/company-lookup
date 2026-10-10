// 公司統編查詢 — 整份貼進「擴充功能 → Apps Script」的程式碼.gs，存檔後即可在試算表使用
// =統編檢查(A2)　=統編查詢(A2)　=統編查詢(A2, "地址")　=統編查詢(A2, "全部")
// 資料：財政部「全國營業(稅籍)登記資料集」（公司），每日更新 https://arzoom-git.github.io/company-lookup/
// 此檔由 scripts/bundle-addon.mjs 產生，請改 src/taxid.js 或 addon/Lookup.js

// 統一編號格式與檢查碼驗證。Node 與 Apps Script 共用（不用 import/export，Apps Script 直接載入）。
//
// 規則（財政部，2023 起擴充號碼）：
//   權重 1,2,1,2,1,2,4,1；每位數字乘權重，乘積的十位數與個位數相加，再全部加總。
//   總和能被 5 整除即正確（舊號碼被 10 整除，自然也被 5 整除）。
//   第 7 碼是 7 時乘積為 28，2+8=10 可視為 1 或 0，所以總和加 1 能被 5 整除也算正確。

var TAXID_WEIGHTS = [1, 2, 1, 2, 1, 2, 4, 1];

// 把使用者輸入整理成 8 碼字串；整理不出來回傳 null。
// 試算表常把 04595257 存成數字 4595257，要補回前面的 0。
function normalizeTaxId(input) {
  if (input === null || input === undefined) return null;
  var s = String(input).trim();
  s = s.replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xfee0); });
  s = s.replace(/[\s\-－]/g, '');
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, '');
  if (!/^\d{1,8}$/.test(s)) return null;
  if (typeof input === 'number' || s.length === 8) return ('00000000' + s).slice(-8);
  return null;
}

function isValidTaxIdChecksum(id) {
  if (!/^\d{8}$/.test(id)) return false;
  var sum = 0;
  for (var i = 0; i < 8; i++) {
    var p = Number(id[i]) * TAXID_WEIGHTS[i];
    sum += Math.floor(p / 10) + (p % 10);
  }
  if (sum % 5 === 0) return true;
  return id[6] === '7' && (sum + 1) % 5 === 0;
}

// 回傳給使用者看的結果：'正確'、'檢查碼錯誤'、'不是 8 碼數字'，空白回傳空字串。
function checkTaxId(input) {
  if (input === '' || input === null || input === undefined) return '';
  var id = normalizeTaxId(input);
  if (!id) return '不是 8 碼數字';
  return isValidTaxIdChecksum(id) ? '正確' : '檢查碼錯誤';
}

// Google 試算表自訂函式：統編檢查、統編查詢。
// 資料來自 GitHub Pages 上依統編前 4 碼切好的小檔（scripts/build-shards.mjs 產生）。
// 需要 src/taxid.js（clasp 一起推送）。

var DATA_BASE_URL = 'https://arzoom-git.github.io/company-lookup/v1/';
var LOOKUP_FIELDS = ['名稱', '地址', '資本額', '設立日期', '組織別', '開發票', '總機構統編', '行業'];
var NOT_FOUND = '查無（可能不是公司或已不營業）';
var CACHE_SECONDS = 6 * 60 * 60;

/**
 * 檢查統一編號的格式與檢查碼。
 * @param {A2:A100} 統編 一格或一整欄
 * @return 正確／檢查碼錯誤／不是 8 碼數字
 * @customfunction
 */
function 統編檢查(統編) {
  return mapCells_(統編, checkTaxId);
}

/**
 * Checks a Taiwan business ID (統一編號) format and checksum.
 * @param {A2:A100} id one cell or a column
 * @customfunction
 */
function TAXID_CHECK(id) {
  return 統編檢查(id);
}

/**
 * 用統一編號查公司資料。
 * @param {A2:A100} 統編 一格或一整欄
 * @param {"名稱"} 欄位 名稱、地址、資本額、設立日期、組織別、開發票、總機構統編、行業，或「全部」；不填＝名稱
 * @return 查到的資料
 * @customfunction
 */
function 統編查詢(統編, 欄位) {
  var field = 欄位 === undefined || 欄位 === '' ? '名稱' : String(欄位).trim();
  var all = field === '全部';
  var idx = LOOKUP_FIELDS.indexOf(field);
  if (!all && idx < 0) throw new Error('欄位要填：' + LOOKUP_FIELDS.join('、') + '，或「全部」');

  var cells = Array.isArray(統編) ? 統編 : [[統編]];
  var ids = [];
  cells.forEach(function (row) { row.forEach(function (v) { var id = normalizeTaxId(v); if (id) ids.push(id); }); });
  var found = fetchCompanies_(ids);

  function lookupOne(v) {
    if (v === '' || v === null) return all ? padRow_([]) : '';
    var id = normalizeTaxId(v);
    if (!id || !isValidTaxIdChecksum(id)) return all ? padRow_(['統編格式錯誤']) : '統編格式錯誤';
    var rec = found[id];
    if (!rec) return all ? padRow_([NOT_FOUND]) : NOT_FOUND;
    return all ? rec.map(displayValue_) : displayValue_(rec[idx]);
  }

  // 「全部」：每個統編展開成一整列（8 欄），所以只看每列的第一格
  if (all) return cells.map(function (row) { return lookupOne(row[0]); });
  if (!Array.isArray(統編)) return lookupOne(統編);
  return cells.map(function (row) { return row.map(lookupOne); });
}

/**
 * Looks up a Taiwan company by business ID.
 * @param {A2:A100} id one cell or a column
 * @param {"名稱"} field 名稱, 地址, 資本額, 設立日期, 組織別, 開發票, 總機構統編, 行業, or 全部
 * @customfunction
 */
function COMPANY_LOOKUP(id, field) {
  return 統編查詢(id, field);
}

// 依前 4 碼分組，同一個小檔只抓一次；查過的公司放快取。
// 名單很長時分批抓、分批寫快取，避免一次送出太多請求。
var FETCH_BATCH = 50;
var CACHE_BATCH = 500;

function fetchCompanies_(ids) {
  var cache = CacheService.getScriptCache();
  var result = {};
  var seen = {};
  var unique = ids.filter(function (id) { if (seen[id]) return false; seen[id] = true; return true; });
  var missing = {};
  chunk_(unique, CACHE_BATCH).forEach(function (part) {
    var cached = cache.getAll(part.map(function (id) { return 'c:' + id; }));
    part.forEach(function (id) {
      var hit = cached['c:' + id];
      if (hit) { var rec = JSON.parse(hit); if (rec) result[id] = rec; }
      else (missing[id.slice(0, 4)] = missing[id.slice(0, 4)] || []).push(id);
    });
  });

  var toCache = {};
  chunk_(Object.keys(missing), FETCH_BATCH).forEach(function (prefixes) {
    var responses = UrlFetchApp.fetchAll(prefixes.map(function (p) {
      return { url: DATA_BASE_URL + p + '.json', muteHttpExceptions: true };
    }));
    prefixes.forEach(function (p, i) {
      var code = responses[i].getResponseCode();
      if (code !== 200 && code !== 404) throw new Error('資料服務暫時連不上（' + code + '），請稍後再試');
      var shard = code === 200 ? JSON.parse(responses[i].getContentText()) : {};
      missing[p].forEach(function (id) {
        var rec = shard[id] || null;
        if (rec) result[id] = rec;
        toCache['c:' + id] = JSON.stringify(rec);
      });
    });
  });
  var keys = Object.keys(toCache);
  chunk_(keys, CACHE_BATCH).forEach(function (part) {
    var obj = {};
    part.forEach(function (k) { obj[k] = toCache[k]; });
    cache.putAll(obj, CACHE_SECONDS);
  });
  return result;
}

function chunk_(list, size) {
  var out = [];
  for (var i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function mapCells_(value, fn) {
  if (!Array.isArray(value)) return fn(value);
  return value.map(function (row) { return row.map(fn); });
}

function displayValue_(v) {
  if (v === true) return '是';
  if (v === false) return '否';
  return v === null ? '' : v;
}

function padRow_(head) {
  var row = head.slice();
  while (row.length < LOOKUP_FIELDS.length) row.push('');
  return row;
}

// 試算表上方的「統編查詢」選單與側邊面板：選統編在哪一欄、勾要的欄位，一鍵填進新的欄。
// 需要 src/taxid.js 與 addon/Lookup.js。

var PANEL_TITLE = '統編查詢';
var FILL_COLORS = { notFound: '#fff4c2', invalid: '#fde2e1' };

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu(PANEL_TITLE)
    .addItem('開啟面板', 'showPanel')
    .addToUi();
}

function onInstall() {
  onOpen();
}

function showPanel() {
  var html = typeof SIDEBAR_HTML_ === 'string'
    ? HtmlService.createHtmlOutput(SIDEBAR_HTML_)
    : HtmlService.createHtmlOutputFromFile('Sidebar');
  SpreadsheetApp.getUi().showSidebar(html.setTitle(PANEL_TITLE));
}

// 面板打開時要的資訊：每一欄的標題與前幾格，以及猜哪一欄是統編
function getSheetInfo() {
  var sheet = SpreadsheetApp.getActiveSheet();
  var lastRow = sheet.getLastRow(), lastCol = sheet.getLastColumn();
  if (lastRow === 0 || lastCol === 0) return { sheetName: sheet.getName(), columns: [], guess: null, fields: LOOKUP_FIELDS };
  var sample = sheet.getRange(1, 1, Math.min(lastRow, 21), lastCol).getValues();
  var columns = [], guess = null, best = 0;
  for (var c = 0; c < lastCol; c++) {
    var hits = 0;
    for (var r = 0; r < sample.length; r++) {
      var id = normalizeTaxId(sample[r][c]);
      if (id && isValidTaxIdChecksum(id)) hits++;
    }
    var head = String(sample[0][c] || '').trim();
    columns.push({ index: c + 1, letter: columnLetter_(c + 1), header: head });
    if (hits > best) { best = hits; guess = c + 1; }
  }
  return { sheetName: sheet.getName(), columns: columns, guess: guess, fields: LOOKUP_FIELDS };
}

// options = { column: 1, fields: ['名稱', '地址'], check: true }
// 結果寫在最右邊的新欄，第 1 列放標題；不覆蓋任何既有資料
function fillCompanyData(options) {
  var sheet = SpreadsheetApp.getActiveSheet();
  var col = Number(options.column);
  var fields = (options.fields || []).filter(function (f) { return LOOKUP_FIELDS.indexOf(f) >= 0; });
  if (!col) throw new Error('請選統編在哪一欄');
  if (!fields.length && !options.check) throw new Error('至少勾一個要填的資料');

  var lastRow = sheet.getLastRow();
  if (lastRow < 1) throw new Error('這個工作表是空的');
  var values = sheet.getRange(1, col, lastRow, 1).getValues().map(function (r) { return r[0]; });
  var first = normalizeTaxId(values[0]);
  var startRow = first && isValidTaxIdChecksum(first) ? 1 : 2; // 第一格不像統編＝標題列
  var hasHeader = startRow === 2;
  var cells = values.slice(startRow - 1);
  if (!cells.length) throw new Error('統編那一欄沒有資料');

  var ids = cells.map(function (v) { var id = normalizeTaxId(v); return id && isValidTaxIdChecksum(id) ? id : null; });
  var found = fetchCompanies_(ids.filter(function (id) { return id; }));

  var headers = (options.check ? ['統編檢查'] : []).concat(fields);
  var stats = { found: 0, notFound: 0, invalid: 0, blank: 0 };
  var colors = [];
  var rows = cells.map(function (v, i) {
    var row = [], color = null;
    if (options.check) row.push(checkTaxId(v));
    if (v === '' || v === null) {
      stats.blank++;
      fields.forEach(function () { row.push(''); });
    } else if (!ids[i]) {
      stats.invalid++; color = FILL_COLORS.invalid;
      fields.forEach(function (f, k) { row.push(k === 0 ? '統編格式錯誤' : ''); });
    } else if (!found[ids[i]]) {
      stats.notFound++; color = FILL_COLORS.notFound;
      fields.forEach(function (f, k) { row.push(k === 0 ? NOT_FOUND : ''); });
    } else {
      stats.found++;
      fields.forEach(function (f) { row.push(displayValue_(found[ids[i]][LOOKUP_FIELDS.indexOf(f)])); });
    }
    colors.push(headers.map(function () { return color; }));
    return row;
  });

  var outCol = sheet.getLastColumn() + 1;
  if (hasHeader) {
    sheet.getRange(1, outCol, 1, headers.length).setValues([headers]).setFontWeight('bold');
  }
  var body = sheet.getRange(startRow, outCol, rows.length, headers.length);
  body.setValues(rows);
  body.setBackgrounds(colors);
  // 資本額欄位用千分位；統編、日期維持文字，避免被試算表改格式
  var capIdx = headers.indexOf('資本額');
  if (capIdx >= 0) sheet.getRange(startRow, outCol + capIdx, rows.length, 1).setNumberFormat('#,##0');

  stats.firstColumn = columnLetter_(outCol);
  stats.lastColumn = columnLetter_(outCol + headers.length - 1);
  return stats;
}

function columnLetter_(n) {
  var s = '';
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

// 側邊面板的畫面（原檔 addon/Sidebar.html）
var SIDEBAR_HTML_ = "<!doctype html>\n<html>\n<head>\n<base target=\"_top\">\n<style>\n  :root { --ink: #202124; --muted: #5f6368; --line: #dadce0; --accent: #1a73e8; --accent-ink: #fff; --ok: #188038; --bad: #c5221f; --warn-bg: #fff4c2; --bad-bg: #fde2e1; }\n  * { box-sizing: border-box; }\n  body { margin: 0; padding: 16px; font: 13px/1.5 Arial, \"Noto Sans TC\", sans-serif; color: var(--ink); }\n  h2 { font-size: 14px; margin: 18px 0 8px; }\n  h2:first-child { margin-top: 0; }\n  select { width: 100%; padding: 6px 8px; font: inherit; border: 1px solid var(--line); border-radius: 4px; background: #fff; }\n  .fields { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 8px; }\n  label { display: flex; align-items: center; gap: 6px; cursor: pointer; }\n  .check { margin-top: 12px; }\n  button { margin-top: 18px; width: 100%; padding: 9px; font: inherit; font-weight: bold; border: 0; border-radius: 4px; background: var(--accent); color: var(--accent-ink); cursor: pointer; }\n  button:disabled { opacity: .55; cursor: default; }\n  .hint { color: var(--muted); font-size: 12px; margin-top: 6px; }\n  .result { margin-top: 16px; padding: 10px 12px; border-radius: 4px; background: #f1f3f4; display: none; }\n  .result.show { display: block; }\n  .result .ok { color: var(--ok); font-weight: bold; }\n  .result .err { color: var(--bad); }\n  .chip { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 4px; vertical-align: -1px; border: 1px solid var(--line); }\n  .foot { margin-top: 24px; color: var(--muted); font-size: 11px; }\n</style>\n</head>\n<body>\n  <h2>統編在哪一欄？</h2>\n  <select id=\"col\"><option>讀取中…</option></select>\n  <div class=\"hint\" id=\"colHint\"></div>\n\n  <h2>要填哪些資料？</h2>\n  <div class=\"fields\" id=\"fields\"></div>\n  <label class=\"check\"><input type=\"checkbox\" id=\"check\" checked> 順便檢查統編有沒有打錯</label>\n\n  <button id=\"go\" disabled>開始填入</button>\n  <div class=\"hint\">結果會放在最右邊的新欄位，不會覆蓋原本的資料。</div>\n\n  <div class=\"result\" id=\"result\"></div>\n\n  <div class=\"foot\">資料來源：財政部全國營業(稅籍)登記資料集，每日更新，只含公司。</div>\n\n<script>\n  var DEFAULT_FIELDS = ['名稱', '地址', '組織別'];\n  var $ = function (id) { return document.getElementById(id); };\n\n  function load() {\n    google.script.run.withSuccessHandler(render).withFailureHandler(showError).getSheetInfo();\n  }\n\n  function render(info) {\n    var col = $('col');\n    if (!info.columns.length) {\n      col.innerHTML = '<option>這個工作表是空的</option>';\n      $('colHint').textContent = '先在某一欄貼上統編，再重新開啟面板。';\n      return;\n    }\n    col.innerHTML = info.columns.map(function (c) {\n      var label = c.letter + ' 欄' + (c.header ? '：' + c.header : '');\n      return '<option value=\"' + c.index + '\"' + (c.index === info.guess ? ' selected' : '') + '>' + escapeHtml(label) + '</option>';\n    }).join('');\n    $('colHint').textContent = info.guess ? '已自動選出看起來像統編的那一欄。' : '找不到像統編的欄位，請手動選。';\n    $('fields').innerHTML = info.fields.map(function (f) {\n      return '<label><input type=\"checkbox\" value=\"' + f + '\"' + (DEFAULT_FIELDS.indexOf(f) >= 0 ? ' checked' : '') + '> ' + f + '</label>';\n    }).join('');\n    $('go').disabled = false;\n  }\n\n  $('go').addEventListener('click', function () {\n    var fields = Array.prototype.map.call(document.querySelectorAll('#fields input:checked'), function (el) { return el.value; });\n    var btn = $('go');\n    btn.disabled = true; btn.textContent = '查詢中…';\n    $('result').className = 'result';\n    google.script.run\n      .withSuccessHandler(function (s) {\n        btn.disabled = false; btn.textContent = '開始填入';\n        var lines = ['<span class=\"ok\">完成</span>，填在 ' + s.firstColumn + (s.lastColumn !== s.firstColumn ? '–' + s.lastColumn : '') + ' 欄', '查到 ' + s.found + ' 家'];\n        if (s.notFound) lines.push('<span class=\"chip\" style=\"background:var(--warn-bg)\"></span>查無 ' + s.notFound + ' 家（可能不是公司或已不營業）');\n        if (s.invalid) lines.push('<span class=\"chip\" style=\"background:var(--bad-bg)\"></span>統編格式錯誤 ' + s.invalid + ' 筆');\n        $('result').innerHTML = lines.join('<br>');\n        $('result').className = 'result show';\n      })\n      .withFailureHandler(function (e) { btn.disabled = false; btn.textContent = '開始填入'; showError(e); })\n      .fillCompanyData({ column: Number($('col').value), fields: fields, check: $('check').checked });\n  });\n\n  function showError(e) {\n    $('result').innerHTML = '<span class=\"err\">' + escapeHtml(e && e.message ? e.message : String(e)) + '</span>';\n    $('result').className = 'result show';\n  }\n\n  function escapeHtml(s) {\n    return String(s).replace(/[&<>\"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', \"'\": '&#39;' }[c]; });\n  }\n\n  load();\n</script>\n</body>\n</html>\n";
