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
