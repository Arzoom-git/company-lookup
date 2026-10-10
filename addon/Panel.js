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
