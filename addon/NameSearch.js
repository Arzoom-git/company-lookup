// 用公司名稱找統編：自訂函式＋面板用的查詢。比對規則在 src/names.js。
// 需要 src/taxid.js、src/names.js、addon/Lookup.js。

var NAME_DATA_URL = DATA_BASE_URL + 'n/';
var NAME_FETCH_BATCH = 8; // 單一字的檔最大約 4 MB，一次不要抓太多
var NAME_TOO_VAGUE = '名稱太籠統';
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

// 一個查詢結果 → [統編, 正式名稱, 比對結果]。找不到時原因只寫在「比對結果」，不重複
function describeNameResult_(res) {
  if (!res || res.status === 'notFound') return ['', '', NAME_NOT_FOUND];
  if (res.status === 'vague') return ['', '', NAME_TOO_VAGUE];
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
