// 新設立公司名單：依期間、縣市、行業關鍵字、資本額篩選，開一張新工作表列出來。
// 資料是 v1/new/recent.json（scripts/build-shards.mjs 的 buildRecent）。
// 需要 addon/Lookup.js（DATA_BASE_URL）。

var RECENT_URL = DATA_BASE_URL + 'new/recent.json';
var NEW_COMPANY_MAX_ROWS = 5000;
var CITIES = ['臺北市', '新北市', '桃園市', '臺中市', '臺南市', '高雄市', '基隆市', '新竹市', '新竹縣', '苗栗縣', '彰化縣',
  '南投縣', '雲林縣', '嘉義市', '嘉義縣', '屏東縣', '宜蘭縣', '花蓮縣', '臺東縣', '澎湖縣', '金門縣', '連江縣'];
var NEW_SHEET_HEADERS = ['設立日期', '公司名稱', '統編', '縣市', '地址', '資本額', '行業', '備註'];

function cityOf_(address) {
  var head = String(address || '').replace(/^台/, '臺').slice(0, 3);
  return CITIES.indexOf(head) >= 0 ? head : '';
}

function addDaysIso_(iso, n) {
  var d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// options = { basis: 'setup'|'seen', days: 30, cities: ['臺北市'], keyword: '餐飲 咖啡', minCapital: 1000000, excludeBranch: true }
// 回傳 { rows: [[...], ...], total, truncated, data: { today, trackingSince } }
function filterNewCompanies_(recent, options) {
  var basis = options.basis === 'seen' ? 'seen' : 'setup';
  var days = Math.max(1, Math.min(Number(options.days) || 30, recent.days || 180));
  var since = addDaysIso_(recent.today, -(days - 1));
  var cities = (options.cities || []).filter(function (c) { return CITIES.indexOf(c) >= 0; });
  var words = String(options.keyword || '').split(/[\s,，、]+/).filter(function (w) { return w; });
  var minCapital = Number(options.minCapital) || 0;

  var out = [];
  recent.rows.forEach(function (r) {
    // r = [統編, 名稱, 地址, 資本額, 設立日期, 行業, 分公司, 首次出現]
    var date = basis === 'seen' ? r[7] : r[4];
    if (!date || date < since) return;
    if (options.excludeBranch !== false && r[6]) return;
    var city = cityOf_(r[2]);
    if (cities.length && cities.indexOf(city) < 0) return;
    if (minCapital && !(Number(r[3]) >= minCapital)) return;
    if (words.length && !words.some(function (w) { return r[1].indexOf(w) >= 0 || String(r[5]).indexOf(w) >= 0; })) return;
    out.push({ date: date, row: [r[4], r[1], r[0], city, r[2], r[3], r[5], ''], seen: r[7] });
  });
  out.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
  return {
    rows: out.slice(0, NEW_COMPANY_MAX_ROWS),
    total: out.length,
    truncated: out.length > NEW_COMPANY_MAX_ROWS,
    basis: basis, days: days, since: since,
    today: recent.today, trackingSince: recent.trackingSince,
  };
}

function fetchRecent_() {
  var res = UrlFetchApp.fetch(RECENT_URL, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('資料服務暫時連不上（' + res.getResponseCode() + '），請稍後再試');
  return JSON.parse(res.getContentText());
}

// 面板「新公司」分頁按「產生名單」：開一張新工作表
function makeNewCompanySheet(options) {
  var result = filterNewCompanies_(fetchRecent_(), options || {});
  var showSeen = result.basis === 'seen';
  var headers = showSeen ? NEW_SHEET_HEADERS.slice(0, 7).concat(['首次出現', '備註']) : NEW_SHEET_HEADERS;
  var rows = result.rows.map(function (x) { return showSeen ? x.row.slice(0, 7).concat([x.seen, '']) : x.row; });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.insertSheet(uniqueSheetName_(ss, '新公司 ' + result.today.slice(5).replace('-', '/')));
  var summary = describeNewCompanyFilter_(options || {}, result);
  sheet.getRange(1, 1).setValue(summary).setFontColor('#5f6368').setFontStyle('italic');
  sheet.getRange(2, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground(HEADER_COLOR);
  sheet.setFrozenRows(2);
  if (rows.length) {
    sheet.getRange(3, 3, rows.length, 1).setNumberFormat('@'); // 統編保留開頭的 0
    sheet.getRange(3, 1, rows.length, headers.length).setValues(rows);
    sheet.getRange(3, 6, rows.length, 1).setNumberFormat('#,##0');
    sheet.getRange(2, 1, rows.length + 1, headers.length).applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false);
  }
  sheet.autoResizeColumns(1, headers.length);
  // 地址、行業可能很長，限制欄寬，其餘照內容
  [5, 7].forEach(function (c) { if (sheet.getColumnWidth(c) > 320) sheet.setColumnWidth(c, 320); });
  sheet.setColumnWidth(headers.length, 160); // 備註欄留給業務自己寫
  ss.setActiveSheet(sheet);

  return {
    sheetName: sheet.getName(), count: rows.length, total: result.total, truncated: result.truncated,
    basis: result.basis, trackingSince: result.trackingSince, today: result.today,
  };
}

// 第一列的篩選說明，例如「臺北市、新北市｜最近 30 天設立｜行業或名稱含：餐飲｜資本額 100 萬以上｜共 123 家（資料日期 2026-10-10）」
function describeNewCompanyFilter_(options, result) {
  var parts = [];
  var cities = options.cities || [];
  parts.push(cities.length ? cities.join('、') : '全台');
  parts.push('最近 ' + result.days + ' 天' + (result.basis === 'seen' ? '新出現在資料裡' : '設立'));
  if (String(options.keyword || '').trim()) parts.push('行業或名稱含：' + String(options.keyword).trim());
  if (Number(options.minCapital)) parts.push('資本額 ' + formatMoney_(Number(options.minCapital)) + '以上');
  if (options.excludeBranch !== false) parts.push('不含分公司');
  parts.push('共 ' + result.total + ' 家' + (result.truncated ? '（只列前 ' + NEW_COMPANY_MAX_ROWS + ' 家）' : '') + '（資料日期 ' + result.today + '）');
  return parts.join('｜');
}

function formatMoney_(n) {
  if (n >= 1e8) return (n / 1e8) + ' 億';
  if (n >= 1e4) return (n / 1e4) + ' 萬';
  return n + ' 元';
}

function uniqueSheetName_(ss, base) {
  var name = base, i = 2;
  while (ss.getSheetByName(name)) name = base + ' (' + (i++) + ')';
  return name;
}
