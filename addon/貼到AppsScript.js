// 公司統編查詢 — 整份貼進「擴充功能 → Apps Script」的程式碼.gs，存檔後重新整理試算表
// 選單「統編查詢 → 開啟面板」；公式：=統編檢查(A2)　=統編查詢(A2, "地址")　=名稱找統編(A2)
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

// 用公司名稱找統編：名稱整理、比對、排名。Node（建索引）與 Apps Script（查詢）共用，不用 import/export。
//
// 索引：每個字一個檔（v1/n/<字的 16 進位碼>.json），內容是名稱含這個字的公司 [統編, 名稱, 資本額, 是否分公司]。
// 查詢時只抓輸入裡「最少公司用到的那個字」的檔，再用「每個字依序出現在名稱裡」篩選，所以「台積電」對得到「台灣積體電路」。
// 太常見的字（公、司、有、限、股、份…）不建檔，見 NAME_INDEX_MAX。

var NAME_INDEX_MAX = 100000;
var NAME_SUFFIX_RE = /(股份有限公司|有限公司|無限公司|兩合公司|公司).*$/;

// 比對用的名稱：全形英數轉半形、英文大寫、臺→台、去掉空白與標點
function normalizeName(s) {
  return String(s == null ? '' : s)
    .replace(/[！-～]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xfee0); })
    .replace(/　/g, ' ')
    .toUpperCase()
    .replace(/臺/g, '台')
    .replace(/[\s()（）［］\[\]「」『』、，,.。·・&＆'"-]/g, '');
}

// 名稱的主體：去掉「股份有限公司」之後的部分（分公司名稱也一起去掉）
function nameCore(normalized) {
  return normalized.replace(NAME_SUFFIX_RE, '');
}

function nameIndexKey(ch) {
  return ch.codePointAt(0).toString(16);
}

function isSubsequence(query, text) {
  var i = 0;
  for (var k = 0; k < text.length && i < query.length; k++) if (text[k] === query[i]) i++;
  return i === query.length;
}

// 從整理過的查詢字串挑出要抓的那個字；charCounts = { 字: 公司數 }（只有建了檔的字）。
// 回傳 null＝全部都是太常見的字；'' ＝有某個字沒有任何公司用過（一定查無）
function pickIndexChar(query, charCounts) {
  var best = null;
  var chars = Array.from(query);
  for (var i = 0; i < chars.length; i++) {
    var ch = chars[i];
    if (isCommonChar_(ch)) continue;
    var n = charCounts[ch];
    if (n === undefined) return '';
    if (best === null || n < charCounts[best]) best = ch;
  }
  return best;
}

var COMMON_CHARS_ = '公司有限股份業';
function isCommonChar_(ch) { return COMMON_CHARS_.indexOf(ch) >= 0; }

// 排名：分數越小越前面。完全同名 > 名稱包含 > 字依序出現；本公司 > 分公司；資本額大、名稱短的優先
var MATCH_EXACT = 0, MATCH_CONTAINS = 40, MATCH_IN_ORDER = 100;

function matchTier(query, rec) {
  var full = normalizeName(rec[1]);
  if (nameCore(full) === query || full === query) return MATCH_EXACT;
  return full.indexOf(query) >= 0 ? MATCH_CONTAINS : MATCH_IN_ORDER;
}

function scoreCandidate(query, rec) {
  return matchTier(query, rec) + (rec[3] ? 200 : 0)
    - 20 * Math.log(Number(rec[2] || 0) + 1) / Math.LN10 + nameCore(normalizeName(rec[1])).length;
}

// 查詢字串整理成比對用的樣子（去掉「股份有限公司」等字尾）
function nameQuery(raw) {
  var n = normalizeName(raw);
  return nameCore(n) || n;
}

// 在一個字的索引檔裡找候選，回傳 [{ id, name, capital, branch, exact, score }]，最多 limit 筆
function rankCandidates(rawQuery, records, limit) {
  var query = nameQuery(rawQuery);
  var out = [];
  for (var i = 0; i < records.length; i++) {
    var rec = records[i];
    if (!isSubsequence(query, normalizeName(rec[1]))) continue;
    out.push({
      id: rec[0], name: rec[1], capital: rec[2], branch: !!rec[3],
      exact: matchTier(query, rec) === MATCH_EXACT, score: scoreCandidate(query, rec),
    });
  }
  out.sort(function (a, b) { return a.score - b.score; });
  return out.slice(0, limit || 5);
}

// 第一名夠不夠確定：只有一個候選、完全同名而第二名不是，或跟第二名差距夠大
function isConfident(cands) {
  if (!cands.length) return false;
  if (cands.length === 1) return true;
  if (cands[0].exact && !cands[1].exact) return true;
  return cands[1].score - cands[0].score >= 40;
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

// 用公司名稱找統編：自訂函式＋面板用的查詢。比對規則在 src/names.js。
// 需要 src/taxid.js、src/names.js、addon/Lookup.js。

var NAME_DATA_URL = DATA_BASE_URL + 'n/';
var NAME_FETCH_BATCH = 8; // 單一字的檔最大約 4 MB，一次不要抓太多
var NAME_TOO_VAGUE = '名稱太籠統（只有「公司」「有限」這類字）';
var NAME_NOT_FOUND = '查無';
var NAME_RESULT_FIELDS = ['統編', '名稱', '比對結果'];

/**
 * 用公司名稱找統編（可以只打簡稱，例如「台積電」）。
 * @param {A2:A100} 名稱 一格或一整欄
 * @param {"統編"} 欄位 統編（不填）、名稱（正式名稱），或「全部」＝統編、正式名稱、比對結果三欄
 * @return 最可能的那一家
 * @customfunction
 */
function 名稱找統編(名稱, 欄位) {
  var field = 欄位 === undefined || 欄位 === '' ? '統編' : String(欄位).trim();
  var all = field === '全部';
  var idx = NAME_RESULT_FIELDS.indexOf(field);
  if (!all && idx < 0) throw new Error('欄位要填：統編、名稱，或「全部」');

  var cells = Array.isArray(名稱) ? 名稱 : [[名稱]];
  var queries = [];
  cells.forEach(function (row) { row.forEach(function (v) { if (v !== '' && v !== null) queries.push(String(v)); }); });
  var results = searchNames_(queries, 3);

  function one(v) {
    if (v === '' || v === null) return all ? ['', '', ''] : '';
    var r = describeNameResult_(results[String(v)]);
    return all ? r : r[idx];
  }
  if (all) return cells.map(function (row) { return one(row[0]); });
  if (!Array.isArray(名稱)) return one(名稱);
  return cells.map(function (row) { return row.map(one); });
}

/**
 * Finds a Taiwan business ID by company name (abbreviations work).
 * @param {A2:A100} name one cell or a column
 * @param {"統編"} field 統編, 名稱, or 全部
 * @customfunction
 */
function COMPANY_ID_BY_NAME(name, field) {
  return 名稱找統編(name, field);
}

// 一個查詢結果 → [統編, 正式名稱, 比對結果]
function describeNameResult_(res) {
  if (!res || res.status === 'notFound') return ['', NAME_NOT_FOUND, NAME_NOT_FOUND];
  if (res.status === 'vague') return ['', NAME_TOO_VAGUE, NAME_TOO_VAGUE];
  var top = res.candidates[0];
  return [top.id, top.name, res.confident ? '確定' : '請確認'];
}

// 查很多個名稱：同一個字的索引檔只抓一次，查過的名稱放快取。
// 回傳 { 原輸入: { status: 'ok'|'notFound'|'vague', confident, candidates: [...] } }
function searchNames_(queries, limit) {
  var cache = CacheService.getScriptCache();
  var out = {};
  var seen = {};
  var unique = queries.filter(function (q) { if (seen[q]) return false; seen[q] = true; return true; });
  if (!unique.length) return out;

  var pending = [];
  chunk_(unique, CACHE_BATCH).forEach(function (part) {
    var hit = cache.getAll(part.map(nameCacheKey_));
    part.forEach(function (q) {
      var c = hit[nameCacheKey_(q)];
      if (c) out[q] = JSON.parse(c); else pending.push(q);
    });
  });
  if (!pending.length) return out;

  var counts = nameCharCounts_();
  var byChar = {};
  pending.forEach(function (q) {
    var ch = pickIndexChar(nameQuery(q), counts);
    if (ch === null) out[q] = { status: 'vague', candidates: [] };
    else if (ch === '') out[q] = { status: 'notFound', candidates: [] };
    else (byChar[ch] = byChar[ch] || []).push(q);
  });

  chunk_(Object.keys(byChar), NAME_FETCH_BATCH).forEach(function (chars) {
    var responses = UrlFetchApp.fetchAll(chars.map(function (ch) {
      return { url: NAME_DATA_URL + nameIndexKey(ch) + '.json', muteHttpExceptions: true };
    }));
    chars.forEach(function (ch, i) {
      var code = responses[i].getResponseCode();
      if (code !== 200 && code !== 404) throw new Error('資料服務暫時連不上（' + code + '），請稍後再試');
      var records = code === 200 ? JSON.parse(responses[i].getContentText()) : [];
      byChar[ch].forEach(function (q) {
        var cands = rankCandidates(q, records, Math.max(limit || 3, 5));
        out[q] = cands.length
          ? { status: 'ok', confident: isConfident(cands), candidates: cands.slice(0, limit || 3) }
          : { status: 'notFound', candidates: [] };
      });
    });
  });

  var toCache = {};
  pending.forEach(function (q) { toCache[nameCacheKey_(q)] = JSON.stringify(out[q]); });
  chunk_(Object.keys(toCache), CACHE_BATCH).forEach(function (keys) {
    var obj = {};
    keys.forEach(function (k) { obj[k] = toCache[k]; });
    cache.putAll(obj, CACHE_SECONDS);
  });
  return out;
}

function nameCacheKey_(q) {
  return 'n:' + nameQuery(q).slice(0, 200);
}

// { 字: 公司數 }，約 70 KB，放快取
function nameCharCounts_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('n:chars');
  if (hit) return JSON.parse(hit);
  var res = UrlFetchApp.fetch(NAME_DATA_URL + 'chars.json', { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('資料服務暫時連不上（' + res.getResponseCode() + '），請稍後再試');
  var text = res.getContentText();
  try { cache.put('n:chars', text, CACHE_SECONDS); } catch (e) { /* 太大就不快取 */ }
  return JSON.parse(text);
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
  var columns = [], guess = null, best = 0, nameGuess = null, nameBest = 0;
  for (var c = 0; c < lastCol; c++) {
    var hits = 0, nameHits = 0;
    for (var r = 0; r < sample.length; r++) {
      var v = sample[r][c];
      var id = normalizeTaxId(v);
      if (id && isValidTaxIdChecksum(id)) hits++;
      else if (typeof v === 'string' && /[一-鿿]{2,}/.test(v)) nameHits += /公司|企業|行$|社$/.test(v) ? 2 : 1;
    }
    var head = String(sample[0][c] || '').trim();
    if (/名稱|公司|廠商|客戶|企業/.test(head)) nameHits += 10;
    columns.push({ index: c + 1, letter: columnLetter_(c + 1), header: head });
    if (hits > best) { best = hits; guess = c + 1; }
    if (nameHits > nameBest) { nameBest = nameHits; nameGuess = c + 1; }
  }
  return { sheetName: sheet.getName(), columns: columns, guess: guess, nameGuess: nameGuess, fields: LOOKUP_FIELDS };
}

// 用名稱批次找統編。options = { column: 1, hasHeader: true }
// 寫在最右邊的新欄：統編、正式名稱、比對結果、其他可能；請確認＝黃、查無＝紅
function fillCompanyIds(options) {
  var sheet = SpreadsheetApp.getActiveSheet();
  var col = Number(options.column);
  if (!col) throw new Error('請選公司名稱在哪一欄');
  var lastRow = sheet.getLastRow();
  var startRow = options.hasHeader ? 2 : 1;
  if (lastRow < startRow) throw new Error('名稱那一欄沒有資料');
  var cells = sheet.getRange(startRow, col, lastRow - startRow + 1, 1).getValues().map(function (r) { return r[0]; });
  var results = searchNames_(cells.filter(function (v) { return v !== '' && v !== null; }).map(String), 3);

  var headers = ['統編', '正式名稱', '比對結果', '其他可能'];
  var stats = { confident: 0, check: 0, notFound: 0, blank: 0 };
  var colors = [];
  var rows = cells.map(function (v) {
    if (v === '' || v === null) { stats.blank++; colors.push([null, null, null, null]); return ['', '', '', '']; }
    var res = results[String(v)];
    var d = describeNameResult_(res);
    var others = res && res.candidates ? res.candidates.slice(1).map(function (c) { return c.name + ' ' + c.id; }).join('；') : '';
    var color = null;
    if (!res || res.status !== 'ok') { stats.notFound++; color = FILL_COLORS.invalid; }
    else if (res.confident) stats.confident++;
    else { stats.check++; color = FILL_COLORS.notFound; }
    colors.push([color, color, color, color]);
    return [d[0], d[1], d[2], others];
  });

  var outCol = sheet.getLastColumn() + 1;
  if (options.hasHeader) sheet.getRange(1, outCol, 1, headers.length).setValues([headers]).setFontWeight('bold');
  var body = sheet.getRange(startRow, outCol, rows.length, headers.length);
  sheet.getRange(startRow, outCol, rows.length, 1).setNumberFormat('@'); // 統編保留開頭的 0
  body.setValues(rows);
  body.setBackgrounds(colors);
  stats.firstColumn = columnLetter_(outCol);
  stats.lastColumn = columnLetter_(outCol + headers.length - 1);
  return stats;
}

// 面板搜尋框：回傳候選清單
function searchCompanyName(query) {
  var q = String(query || '').trim();
  if (!q) return { status: 'empty', candidates: [] };
  var res = searchNames_([q], 5)[q];
  return res || { status: 'notFound', candidates: [] };
}

// 把選到的統編寫進目前選取的儲存格（文字格式，保留開頭的 0）
function writeToActiveCell(value) {
  var cell = SpreadsheetApp.getActiveSheet().getActiveCell();
  cell.setNumberFormat('@').setValue(String(value));
  return cell.getA1Notation();
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
var SIDEBAR_HTML_ = "<!doctype html>\n<html>\n<head>\n<base target=\"_top\">\n<style>\n  :root { --ink: #202124; --muted: #5f6368; --line: #dadce0; --soft: #f1f3f4; --accent: #1a73e8; --accent-soft: #e8f0fe; --accent-ink: #fff; --ok: #188038; --bad: #c5221f; --warn-bg: #fff4c2; --bad-bg: #fde2e1; }\n  * { box-sizing: border-box; }\n  body { margin: 0; font: 13px/1.5 Arial, \"Noto Sans TC\", sans-serif; color: var(--ink); }\n  .tabs { display: flex; border-bottom: 1px solid var(--line); }\n  .tab { flex: 1; padding: 10px 4px; text-align: center; border: 0; background: none; font: inherit; color: var(--muted); cursor: pointer; border-bottom: 2px solid transparent; }\n  .tab.on { color: var(--accent); border-bottom-color: var(--accent); font-weight: bold; }\n  .pane { display: none; padding: 16px; }\n  .pane.on { display: block; }\n  h2 { font-size: 14px; margin: 18px 0 8px; }\n  h2:first-child { margin-top: 0; }\n  select, input[type=search] { width: 100%; padding: 6px 8px; font: inherit; border: 1px solid var(--line); border-radius: 4px; background: #fff; color: var(--ink); }\n  .fields { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 8px; }\n  label { display: flex; align-items: center; gap: 6px; cursor: pointer; }\n  .check { margin-top: 10px; }\n  button.main { margin-top: 18px; width: 100%; padding: 9px; font: inherit; font-weight: bold; border: 0; border-radius: 4px; background: var(--accent); color: var(--accent-ink); cursor: pointer; }\n  button.main:disabled { opacity: .55; cursor: default; }\n  .hint { color: var(--muted); font-size: 12px; margin-top: 6px; }\n  .result { margin-top: 14px; padding: 10px 12px; border-radius: 4px; background: var(--soft); display: none; }\n  .result.show { display: block; }\n  .ok { color: var(--ok); font-weight: bold; }\n  .err { color: var(--bad); }\n  .chip { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 4px; vertical-align: -1px; border: 1px solid var(--line); }\n  .search { display: flex; gap: 6px; }\n  .search button { flex: none; padding: 0 12px; border: 1px solid var(--line); border-radius: 4px; background: #fff; font: inherit; cursor: pointer; }\n  .cands { margin-top: 10px; }\n  .cand { display: block; width: 100%; text-align: left; padding: 8px 10px; margin-bottom: 6px; border: 1px solid var(--line); border-radius: 6px; background: #fff; font: inherit; cursor: pointer; }\n  .cand:hover { border-color: var(--accent); background: var(--accent-soft); }\n  .cand b { display: block; }\n  .cand span { color: var(--muted); font-size: 12px; }\n  .badge { display: inline-block; font-size: 11px; padding: 0 6px; border-radius: 8px; background: var(--soft); color: var(--muted); margin-left: 4px; }\n  hr { border: 0; border-top: 1px solid var(--line); margin: 20px 0 16px; }\n  .foot { margin: 8px 16px 16px; color: var(--muted); font-size: 11px; }\n</style>\n</head>\n<body>\n  <div class=\"tabs\">\n    <button class=\"tab on\" data-pane=\"byName\">用名稱找統編</button>\n    <button class=\"tab\" data-pane=\"byId\">用統編查公司</button>\n  </div>\n\n  <div class=\"pane on\" id=\"byName\">\n    <h2>搜尋一家公司</h2>\n    <div class=\"search\">\n      <input type=\"search\" id=\"q\" placeholder=\"例如：台積電、玉山銀行\" aria-label=\"公司名稱\">\n      <button id=\"qGo\">找</button>\n    </div>\n    <div class=\"hint\">可以只打簡稱。點選結果，統編會填進目前選取的儲存格。</div>\n    <div class=\"cands\" id=\"cands\"></div>\n\n    <hr>\n\n    <h2>整欄一起找</h2>\n    <select id=\"nameCol\" aria-label=\"公司名稱在哪一欄\"><option>讀取中…</option></select>\n    <label class=\"check\"><input type=\"checkbox\" id=\"nameHeader\" checked> 第一列是標題</label>\n    <button class=\"main\" id=\"nameGo\" disabled>開始找統編</button>\n    <div class=\"hint\">會在最右邊新增：統編、正式名稱、比對結果、其他可能。<br>黃色＝請確認，紅色＝查無。</div>\n    <div class=\"result\" id=\"nameResult\"></div>\n  </div>\n\n  <div class=\"pane\" id=\"byId\">\n    <h2>統編在哪一欄？</h2>\n    <select id=\"col\" aria-label=\"統編在哪一欄\"><option>讀取中…</option></select>\n    <div class=\"hint\" id=\"colHint\"></div>\n\n    <h2>要填哪些資料？</h2>\n    <div class=\"fields\" id=\"fields\"></div>\n    <label class=\"check\"><input type=\"checkbox\" id=\"check\" checked> 順便檢查統編有沒有打錯</label>\n\n    <button class=\"main\" id=\"go\" disabled>開始填入</button>\n    <div class=\"hint\">結果會放在最右邊的新欄位，不會覆蓋原本的資料。</div>\n    <div class=\"result\" id=\"result\"></div>\n  </div>\n\n  <div class=\"foot\">資料來源：財政部全國營業(稅籍)登記資料集，每日更新，只含公司。</div>\n\n<script>\n  var DEFAULT_FIELDS = ['名稱', '地址', '組織別'];\n  var $ = function (id) { return document.getElementById(id); };\n  var run = function (ok, fail) { return google.script.run.withSuccessHandler(ok).withFailureHandler(fail); };\n\n  Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {\n    t.addEventListener('click', function () {\n      document.querySelectorAll('.tab').forEach(function (x) { x.classList.toggle('on', x === t); });\n      document.querySelectorAll('.pane').forEach(function (p) { p.classList.toggle('on', p.id === t.dataset.pane); });\n    });\n  });\n\n  function columnOptions(info, selected) {\n    return info.columns.map(function (c) {\n      var label = c.letter + ' 欄' + (c.header ? '：' + c.header : '');\n      return '<option value=\"' + c.index + '\"' + (c.index === selected ? ' selected' : '') + '>' + esc(label) + '</option>';\n    }).join('');\n  }\n\n  function render(info) {\n    if (!info.columns.length) {\n      $('col').innerHTML = $('nameCol').innerHTML = '<option>這個工作表是空的</option>';\n      $('colHint').textContent = '先在某一欄貼上資料，再重新開啟面板。';\n    } else {\n      $('col').innerHTML = columnOptions(info, info.guess);\n      $('nameCol').innerHTML = columnOptions(info, info.nameGuess);\n      $('colHint').textContent = info.guess ? '已自動選出看起來像統編的那一欄。' : '找不到像統編的欄位，請手動選。';\n      $('go').disabled = $('nameGo').disabled = false;\n    }\n    $('fields').innerHTML = info.fields.map(function (f) {\n      return '<label><input type=\"checkbox\" value=\"' + f + '\"' + (DEFAULT_FIELDS.indexOf(f) >= 0 ? ' checked' : '') + '> ' + f + '</label>';\n    }).join('');\n  }\n\n  // 搜尋一家\n  function search() {\n    var q = $('q').value.trim();\n    if (!q) return;\n    $('cands').innerHTML = '<div class=\"hint\">搜尋中…</div>';\n    run(showCands, function (e) { $('cands').innerHTML = '<div class=\"err\">' + esc(msg(e)) + '</div>'; }).searchCompanyName(q);\n  }\n  function showCands(res) {\n    if (res.status === 'vague') { $('cands').innerHTML = '<div class=\"err\">名稱太籠統，多打幾個字試試。</div>'; return; }\n    if (!res.candidates.length) { $('cands').innerHTML = '<div class=\"err\">查無，可能不是公司、已不營業，或名稱差太多。</div>'; return; }\n    $('cands').innerHTML = res.candidates.map(function (c, i) {\n      var tags = (i === 0 && res.confident ? '<span class=\"badge\">最可能</span>' : '') + (c.branch ? '<span class=\"badge\">分公司</span>' : '');\n      return '<button class=\"cand\" data-id=\"' + c.id + '\"><b>' + esc(c.name) + tags + '</b><span>' + c.id + (c.capital ? '　資本額 ' + money(c.capital) : '') + '</span></button>';\n    }).join('');\n  }\n  $('cands').addEventListener('click', function (e) {\n    var b = e.target.closest('.cand'); if (!b) return;\n    run(function (a1) {\n      b.querySelector('span').textContent = '✓ 已填入 ' + a1 + '：' + b.dataset.id;\n    }, function (e) { alert(msg(e)); }).writeToActiveCell(b.dataset.id);\n  });\n  $('qGo').addEventListener('click', search);\n  $('q').addEventListener('keydown', function (e) { if (e.key === 'Enter') search(); });\n\n  // 整欄用名稱找\n  $('nameGo').addEventListener('click', function () {\n    var btn = busy($('nameGo'), '找統編中…');\n    run(function (s) {\n      btn.done('開始找統編');\n      var lines = ['<span class=\"ok\">完成</span>，填在 ' + s.firstColumn + '–' + s.lastColumn + ' 欄', '確定 ' + s.confident + ' 家'];\n      if (s.check) lines.push('<span class=\"chip\" style=\"background:var(--warn-bg)\"></span>請確認 ' + s.check + ' 家（看「其他可能」那欄）');\n      if (s.notFound) lines.push('<span class=\"chip\" style=\"background:var(--bad-bg)\"></span>查無 ' + s.notFound + ' 家');\n      show('nameResult', lines.join('<br>'));\n    }, function (e) { btn.done('開始找統編'); show('nameResult', '<span class=\"err\">' + esc(msg(e)) + '</span>'); })\n      .fillCompanyIds({ column: Number($('nameCol').value), hasHeader: $('nameHeader').checked });\n  });\n\n  // 整欄用統編查\n  $('go').addEventListener('click', function () {\n    var fields = Array.prototype.map.call(document.querySelectorAll('#fields input:checked'), function (el) { return el.value; });\n    var btn = busy($('go'), '查詢中…');\n    run(function (s) {\n      btn.done('開始填入');\n      var lines = ['<span class=\"ok\">完成</span>，填在 ' + s.firstColumn + (s.lastColumn !== s.firstColumn ? '–' + s.lastColumn : '') + ' 欄', '查到 ' + s.found + ' 家'];\n      if (s.notFound) lines.push('<span class=\"chip\" style=\"background:var(--warn-bg)\"></span>查無 ' + s.notFound + ' 家（可能不是公司或已不營業）');\n      if (s.invalid) lines.push('<span class=\"chip\" style=\"background:var(--bad-bg)\"></span>統編格式錯誤 ' + s.invalid + ' 筆');\n      show('result', lines.join('<br>'));\n    }, function (e) { btn.done('開始填入'); show('result', '<span class=\"err\">' + esc(msg(e)) + '</span>'); })\n      .fillCompanyData({ column: Number($('col').value), fields: fields, check: $('check').checked });\n  });\n\n  function busy(btn, text) {\n    btn.disabled = true; btn.textContent = text;\n    return { done: function (t) { btn.disabled = false; btn.textContent = t; } };\n  }\n  function show(id, html) { $(id).innerHTML = html; $(id).className = 'result show'; }\n  function msg(e) { return e && e.message ? e.message : String(e); }\n  function money(n) { return n >= 1e8 ? (Math.round(n / 1e7) / 10) + ' 億' : n >= 1e4 ? Math.round(n / 1e4) + ' 萬' : n + ' 元'; }\n  function esc(s) {\n    return String(s).replace(/[&<>\"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', \"'\": '&#39;' }[c]; });\n  }\n\n  run(render, function (e) { show('nameResult', '<span class=\"err\">' + esc(msg(e)) + '</span>'); }).getSheetInfo();\n</script>\n</body>\n</html>\n";
