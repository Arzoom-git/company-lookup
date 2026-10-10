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

if (typeof module !== 'undefined') {
  module.exports = { normalizeTaxId: normalizeTaxId, isValidTaxIdChecksum: isValidTaxIdChecksum, checkTaxId: checkTaxId };
}
