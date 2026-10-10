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

// 依前 4 碼分組，同一個小檔只抓一次；查過的公司放快取
function fetchCompanies_(ids) {
  var cache = CacheService.getScriptCache();
  var result = {};
  var unique = ids.filter(function (id, i) { return ids.indexOf(id) === i; });
  var cached = cache.getAll(unique.map(function (id) { return 'c:' + id; }));
  var missing = {};
  unique.forEach(function (id) {
    var hit = cached['c:' + id];
    if (hit) { var rec = JSON.parse(hit); if (rec) result[id] = rec; }
    else (missing[id.slice(0, 4)] = missing[id.slice(0, 4)] || []).push(id);
  });

  var prefixes = Object.keys(missing);
  if (!prefixes.length) return result;
  var responses = UrlFetchApp.fetchAll(prefixes.map(function (p) {
    return { url: DATA_BASE_URL + p + '.json', muteHttpExceptions: true };
  }));
  var toCache = {};
  prefixes.forEach(function (p, i) {
    var res = responses[i];
    var code = res.getResponseCode();
    if (code !== 200 && code !== 404) throw new Error('資料服務暫時連不上（' + code + '），請稍後再試');
    var shard = code === 200 ? JSON.parse(res.getContentText()) : {};
    missing[p].forEach(function (id) {
      var rec = shard[id] || null;
      if (rec) result[id] = rec;
      toCache['c:' + id] = JSON.stringify(rec);
    });
  });
  cache.putAll(toCache, CACHE_SECONDS);
  return result;
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
