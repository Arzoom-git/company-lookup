// 試算表上方的「統編查詢」選單與側邊面板。
// 結果插在來源欄的右邊（插入新欄，不覆蓋既有資料），第 1 列放標題，填完自動調整欄寬。
// 需要 src/taxid.js、src/names.js、addon/Lookup.js、addon/NameSearch.js。

var PANEL_TITLE = '統編查詢';
var FILL_COLORS = { notFound: '#fff4c2', invalid: '#fde2e1' };
var HEADER_COLOR = '#e8f0fe';
var HEADER_RE = /名稱|公司名|客戶|廠商|企業|統編|統一編號|編號|name|id/i;

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

// 面板打開時要的資訊：每一欄的標題、猜哪一欄是統編／公司名稱、第一列是不是標題
function getSheetInfo() {
  var sheet = SpreadsheetApp.getActiveSheet();
  var lastRow = sheet.getLastRow(), lastCol = sheet.getLastColumn();
  if (lastRow === 0 || lastCol === 0) return { sheetName: sheet.getName(), columns: [], guess: null, nameGuess: null, hasHeader: false, fields: LOOKUP_FIELDS };
  var sample = sheet.getRange(1, 1, Math.min(lastRow, 21), lastCol).getValues();
  var hasHeader = looksLikeHeaderRow_(sample[0]);
  var columns = [], guess = null, best = 0, nameGuess = null, nameBest = 0;
  for (var c = 0; c < lastCol; c++) {
    var hits = 0, nameHits = 0;
    for (var r = hasHeader ? 1 : 0; r < sample.length; r++) {
      var v = sample[r][c];
      var id = normalizeTaxId(v);
      if (id && isValidTaxIdChecksum(id)) hits++;
      else if (typeof v === 'string' && /[一-鿿]{2,}/.test(v)) nameHits += /公司|企業|行$|社$/.test(v) ? 2 : 1;
    }
    var head = hasHeader ? String(sample[0][c] || '').trim() : '';
    // 標題加分只給內容真的有中文名稱的欄（「廠商統編」那種統編欄不算）
    if (nameHits > hits && /名稱|公司|廠商|客戶|企業/.test(head)) nameHits += 10;
    if (hits >= nameHits) nameHits = 0;
    var empty = sample.every(function (row, r) { return (hasHeader && r === 0) || row[c] === '' || row[c] === null; });
    if (empty) continue; // 空的欄不列出來
    columns.push({ index: c + 1, letter: columnLetter_(c + 1), header: head });
    if (hits > best) { best = hits; guess = c + 1; }
    if (nameHits > nameBest) { nameBest = nameHits; nameGuess = c + 1; }
  }
  return { sheetName: sheet.getName(), columns: columns, guess: guess, nameGuess: nameGuess, hasHeader: hasHeader, fields: LOOKUP_FIELDS };
}

// 第一列是標題：沒有任何一格像統編或公司名稱，而且至少一格像欄位名稱
function looksLikeHeaderRow_(row) {
  var headerish = false;
  for (var i = 0; i < row.length; i++) {
    var v = row[i];
    if (v === '' || v === null) continue;
    var id = normalizeTaxId(v);
    if (id && isValidTaxIdChecksum(id)) return false;
    var s = String(v);
    if (/公司$|公司.+分公司$|企業社$|商行$/.test(s)) return false;
    if (HEADER_RE.test(s) && s.length <= 12) headerish = true;
  }
  return headerish;
}

// 用統編查公司。options = { column: 1, fields: ['名稱', '地址'], check: true }
function fillCompanyData(options) {
  var sheet = SpreadsheetApp.getActiveSheet();
  var col = Number(options.column);
  var fields = (options.fields || []).filter(function (f) { return LOOKUP_FIELDS.indexOf(f) >= 0; });
  if (!col) throw new Error('請選統編在哪一欄');
  if (!fields.length && !options.check) throw new Error('至少勾一個要填的資料');
  var src = readColumn_(sheet, col, options.hasHeader);
  if (columnKind_(src.cells) === 'names') throw new Error('這一欄看起來是公司名稱，請改用上面的「用名稱找統編」');

  var ids = src.cells.map(function (v) { var id = normalizeTaxId(v); return id && isValidTaxIdChecksum(id) ? id : null; });
  var found = fetchCompanies_(ids.filter(function (id) { return id; }));

  var headers = (options.check ? ['統編檢查'] : []).concat(fields);
  var stats = { found: 0, notFound: 0, invalid: 0, blank: 0 };
  var colors = [];
  var rows = src.cells.map(function (v, i) {
    var row = [], color = null;
    if (options.check) row.push(checkTaxId(v));
    if (v === '' || v === null) {
      stats.blank++;
      fields.forEach(function () { row.push(''); });
    } else if (!ids[i]) {
      // 有「統編檢查」欄時原因已經寫在那裡，資料欄留白就好
      stats.invalid++; color = FILL_COLORS.invalid;
      fields.forEach(function (f, k) { row.push(k === 0 && !options.check ? '統編有誤' : ''); });
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

  var formats = headers.map(function (h) { return h === '資本額' ? '#,##0' : h === '總機構統編' ? '@' : null; });
  return writeResults_(sheet, src, '統編', headers, rows, colors, formats, stats);
}

// 用名稱批次找統編。options = { column: 1, hasHeader: true|false|undefined（自動判斷） }
function fillCompanyIds(options) {
  var sheet = SpreadsheetApp.getActiveSheet();
  var col = Number(options.column);
  if (!col) throw new Error('請選公司名稱在哪一欄');
  var src = readColumn_(sheet, col, options.hasHeader);
  if (columnKind_(src.cells) === 'ids') throw new Error('這一欄是統編，請改用上面的「用統編查公司」');
  var results = searchNames_(src.cells.filter(function (v) { return v !== '' && v !== null; }).map(String), 6);

  var headers = ['統編', '正式名稱', '比對結果', '其他可能'];
  var stats = { confident: 0, check: 0, notFound: 0, blank: 0 };
  var colors = [];
  var rows = src.cells.map(function (v) {
    if (v === '' || v === null) { stats.blank++; colors.push([null, null, null, null]); return ['', '', '', '']; }
    var res = results[String(v)];
    var d = describeNameResult_(res);
    // 「其他可能」只給需要確認的列，而且不列分公司（同一家公司的分公司對選擇沒幫助）
    var others = res && res.status === 'ok' && !res.confident
      ? res.candidates.slice(1).filter(function (c) { return !c.branch; }).slice(0, 2)
        .map(function (c) { return c.name + ' ' + c.id; }).join('；')
      : '';
    var color = null;
    if (!res || res.status !== 'ok') { stats.notFound++; color = FILL_COLORS.invalid; }
    else if (res.confident) stats.confident++;
    else { stats.check++; color = FILL_COLORS.notFound; }
    colors.push([color, color, color, color]);
    return [d[0], d[1], d[2], others];
  });
  return writeResults_(sheet, src, '公司名稱', headers, rows, colors, ['@', null, null, null], stats);
}

// 讀來源欄。hasHeader 沒給就自動判斷
function readColumn_(sheet, col, hasHeader) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 1) throw new Error('這個工作表是空的');
  if (hasHeader === undefined || hasHeader === null) {
    hasHeader = looksLikeHeaderRow_(sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]);
  }
  var startRow = hasHeader ? 2 : 1;
  if (lastRow < startRow) throw new Error('那一欄沒有資料');
  var cells = sheet.getRange(startRow, col, lastRow - startRow + 1, 1).getValues().map(function (r) { return r[0]; });
  if (!cells.some(function (v) { return v !== '' && v !== null; })) throw new Error(columnLetter_(col) + ' 欄是空的，請選有資料的那一欄');
  return { col: col, hasHeader: hasHeader, startRow: startRow, cells: cells };
}

// 這一欄大多是統編（ids）、大多是中文名稱（names），或看不出來（mixed）
function columnKind_(cells) {
  var ids = 0, names = 0, n = 0;
  cells.forEach(function (v) {
    if (v === '' || v === null) return;
    n++;
    var id = normalizeTaxId(v);
    if (id && isValidTaxIdChecksum(id)) ids++;
    else if (/[一-鿿]/.test(String(v))) names++;
  });
  if (ids * 2 > n) return 'ids';
  if (names * 2 > n) return 'names';
  return 'mixed';
}

// 在來源欄右邊插入新欄寫結果。沒有標題列就在最上面插一列，來源欄也補上標題。
// 右邊已經是同一組結果欄（再按一次）就直接覆蓋更新，不再多插一組。
function writeResults_(sheet, src, sourceHeader, headers, rows, colors, formats, stats) {
  var startRow = src.startRow;
  var outCol = src.col + 1;
  var rerun = src.hasHeader && sheet.getLastColumn() >= src.col + headers.length &&
    sheet.getRange(1, outCol, 1, headers.length).getValues()[0].join('\t') === headers.join('\t');
  if (!src.hasHeader) {
    sheet.insertRowBefore(1);
    startRow += 1;
    sheet.getRange(1, src.col).setValue(sourceHeader).setFontWeight('bold').setBackground(HEADER_COLOR);
  }
  if (!rerun) sheet.insertColumnsAfter(src.col, headers.length);
  sheet.getRange(1, outCol, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground(HEADER_COLOR);
  formats.forEach(function (f, i) { if (f) sheet.getRange(startRow, outCol + i, rows.length, 1).setNumberFormat(f); });
  var body = sheet.getRange(startRow, outCol, rows.length, headers.length);
  body.setValues(rows);
  body.setBackgrounds(colors);
  sheet.autoResizeColumns(outCol, headers.length);
  if (sheet.getFrozenRows() === 0) sheet.setFrozenRows(1);

  stats.firstColumn = columnLetter_(outCol);
  stats.lastColumn = columnLetter_(outCol + headers.length - 1);
  stats.addedHeaderRow = !src.hasHeader;
  stats.updated = rerun;
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

function columnLetter_(n) {
  var s = '';
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
