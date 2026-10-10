# 公司統編查詢

Google 試算表自訂函式：`=統編檢查(A2)`、`=統編查詢(A2, "地址")`。資料是財政部「全國營業(稅籍)登記資料集」裡的**公司**（獨資、合夥、其他先不收），每天由 GitHub Actions 切成依統編前 4 碼分組的小 JSON 檔，發布到 GitHub Pages。試算表只抓需要的那幾個小檔。

背景與決策（2026-10-10）：使用者想要不用宣傳的被動收入；國外有同類外掛（美國、英國公司查詢），台灣沒有。順序：①統編檢查 → ②每日切檔 → ③試算表外掛 → ④上架 Google Workspace 市集 → ⑤收費（Gumroad 授權碼）。獨資商號有個資法疑慮，先不做。

## 結構
- `src/taxid.js`：統編整理與檢查碼（Node 與 Apps Script 共用，不用 import/export）
- `scripts/build-shards.mjs`：CSV → `<輸出>/v1/<前4碼>.json` 與 `meta.json`。欄位順序見 `FIELDS`，改了要同步 `addon/Lookup.js` 的 `LOOKUP_FIELDS`，並把路徑升到 `v2`（舊版外掛還在讀 v1）
- `addon/`：Apps Script（`Lookup.js`＋`appsscript.json`；推送時要連同 `src/taxid.js`）
- `.github/workflows/update-data.yml`：每天台灣時間 05:00 下載、切檔、發布（用 Pages artifact，不把資料 commit 進 git）
- `public/index.html`：Pages 首頁與資料出處（授權條款要求註明出處）

## 指令
- `node test/run.mjs`：測試（用 `test/fixture.csv`，不連網；模擬 UrlFetchApp 與 CacheService）
- `node scripts/build-shards.mjs data/raw/BGMOPEN1.csv data/out`：本機用真資料建置（`data/` 不進 git）

## 規則
- 統編檢查碼：權重 1,2,1,2,1,2,4,1，乘積位數相加，總和被 5 整除；第 7 碼是 7 時總和加 1 被 5 整除也算對。2026-10-10 用 171 萬筆真實統編驗證全部通過。
- 試算表把 04595257 存成數字 4595257：數字型別補 0；文字型別少一碼不補。
- 公司少於 50 萬家或欄位名稱不對就建置失敗、不發布（財政部改格式時保護舊資料）。
