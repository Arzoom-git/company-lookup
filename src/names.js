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

if (typeof module !== 'undefined') {
  module.exports = {
    NAME_INDEX_MAX: NAME_INDEX_MAX, normalizeName: normalizeName, nameCore: nameCore, nameIndexKey: nameIndexKey,
    isSubsequence: isSubsequence, pickIndexChar: pickIndexChar, scoreCandidate: scoreCandidate, nameQuery: nameQuery,
    rankCandidates: rankCandidates, isConfident: isConfident,
  };
}
