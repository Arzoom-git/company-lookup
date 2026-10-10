// 本機預覽側邊面板用：假裝成 Apps Script 的 google.script.run。
// 搜尋用真的名稱索引（/v1/n/），其他動作回假資料。只給 scripts/serve-demo.mjs 的 /panel 用。
(function () {
  var chars = null;
  async function searchCompanyName(q) {
    chars = chars || await fetch('/v1/n/chars.json').then(function (r) { return r.json(); });
    var ch = pickIndexChar(nameQuery(q), chars);
    if (ch === null) return { status: 'vague', candidates: [] };
    if (ch === '') return { status: 'notFound', candidates: [] };
    var recs = await fetch('/v1/n/' + nameIndexKey(ch) + '.json').then(function (r) { return r.ok ? r.json() : []; });
    var c = rankCandidates(q, recs, 5);
    return c.length ? { status: 'ok', confident: isConfident(c), candidates: c } : { status: 'notFound', candidates: [] };
  }
  var fake = {
    getSheetInfo: function () {
      return {
        sheetName: '工作表1', guess: 2, nameGuess: 1, fields: ['名稱', '地址', '資本額', '設立日期', '組織別', '開發票', '總機構統編', '行業'],
        columns: [{ index: 1, letter: 'A', header: '客戶名稱' }, { index: 2, letter: 'B', header: '統編' }, { index: 3, letter: 'C', header: '備註' }],
      };
    },
    searchCompanyName: searchCompanyName,
    writeToActiveCell: function () { return 'B2'; },
    fillCompanyIds: function () { return { confident: 41, check: 6, notFound: 3, blank: 0, firstColumn: 'D', lastColumn: 'G' }; },
    fillCompanyData: function () { return { found: 47, notFound: 2, invalid: 1, blank: 0, firstColumn: 'D', lastColumn: 'G' }; },
    // 用真的 recent.json 與 addon/NewCompanies.js 的篩選，只是不真的開工作表
    makeNewCompanySheet: async function (o) {
      var recent = await fetch('/v1/new/recent.json').then(function (r) { return r.json(); });
      var res = filterNewCompanies_(recent, o);
      console.log('[stub] 第1列：' + describeNewCompanyFilter_(o, res));
      return { sheetName: '新公司 ' + recent.today.slice(5).replace('-', '/'), count: res.rows.length, total: res.total, truncated: res.truncated, basis: res.basis, trackingSince: res.trackingSince, today: res.today };
    },
  };
  function runner(ok, fail) {
    var r = {
      withSuccessHandler: function (f) { return runner(f, fail); },
      withFailureHandler: function (f) { return runner(ok, f); },
    };
    Object.keys(fake).forEach(function (name) {
      r[name] = function () {
        var args = arguments;
        setTimeout(function () {
          Promise.resolve().then(function () { return fake[name].apply(null, args); })
            .then(function (v) { ok && ok(v); }, function (e) { fail && fail(e); });
        }, 300);
      };
    });
    return r;
  }
  window.google = { script: { run: runner() } };
})();
