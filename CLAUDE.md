# 公司統編查詢

Google 試算表工具：用統編查公司資料、用公司名稱（含簡稱）找統編。資料是財政部「全國營業(稅籍)登記資料集」裡的**公司**（獨資、合夥、其他先不收），每天由 GitHub Actions 下載、切檔，發布到 GitHub Pages（https://arzoom-git.github.io/company-lookup/ ，公開儲存庫 Arzoom-git/company-lookup）。試算表只抓需要的那幾個小檔。

背景與決策（2026-10-10）：使用者想要不用宣傳的被動收入；國外有同類外掛（美國、英國公司查詢），台灣沒有。使用者自己最常遇到的是「知道名稱、不知道統編」，所以名稱找統編是主功能，面板預設開這一頁。獨資商號有個資法疑慮，先不做。下一步：使用者在真的 Google 試算表用工作名單試（大名單速度還沒在 Google 環境量過）→ 找會計／行政朋友試用 → 上架 Google Workspace 市集 → 收費（Gumroad 授權碼或台灣金流，要先查台灣收款）。

## 結構
- `src/taxid.js`：統編整理與檢查碼（Node 與 Apps Script 共用，不用 import/export）
- `src/names.js`：名稱整理、比對（字依序出現即符合）、排名、「確定／請確認」判斷（共用）
- `scripts/build-shards.mjs`：CSV → `v1/<統編前4碼>.json`（統編查詢）＋ `v1/n/<字的16進位碼>.json` 與 `v1/n/chars.json`（名稱索引）＋ `meta.json`。顯示用文字經 `tidyText` 全形轉半形。欄位順序見 `FIELDS`，改了要同步 `addon/Lookup.js` 的 `LOOKUP_FIELDS`，並把路徑升到 `v2`（舊版還在讀 v1）
- `addon/`：Apps Script。`Lookup.js`（=統編查詢、=統編檢查）、`NameSearch.js`（=名稱找統編）、`Panel.js`（選單、側邊面板的伺服器端）、`Sidebar.html`（面板畫面）
- `addon/貼到AppsScript.js`：`node scripts/bundle-addon.mjs` 產生的單一檔，使用者整份貼進試算表的 Apps Script（面板 HTML 也包在裡面）。**改了 src/ 或 addon/ 都要重新產生並 commit**
- `.github/workflows/update-data.yml`：每天台灣時間 05:00 下載、切檔、發布（Pages artifact，資料不進 git）
- `demo/`：本機預覽（`index.html` 模擬試算表、`/panel` 面板預覽、`result.html` 畫 `data/snapshot.json`），由 `scripts/serve-demo.mjs` 提供
- `public/index.html`：Pages 首頁與資料出處（授權條款要求註明出處）

## 指令
- `node test/run.mjs`：測試（`test/fixture.csv`，不連網；模擬 UrlFetchApp、CacheService、試算表）
- `node scripts/build-shards.mjs data/raw/BGMOPEN1.csv data/out`：本機用真資料建置（`data/` 不進 git）
- `node scripts/bundle-addon.mjs`：產生 `addon/貼到AppsScript.js`
- `gh workflow run update-data.yml --repo Arzoom-git/company-lookup`：手動重建線上資料（只有 build-shards 或資料格式改了才需要）

## 規則
- 統編檢查碼：權重 1,2,1,2,1,2,4,1，乘積位數相加，總和被 5 整除；第 7 碼是 7 時總和加 1 被 5 整除也算對。2026-10-10 用 171 萬筆真實統編驗證全部通過。
- 試算表把 04595257 存成數字 4595257：數字型別補 0；文字型別少一碼不補。
- 名稱排名權重（`src/names.js`）是用 40 個常見簡稱調的：第一名對 38/40、標「確定」的全對。改權重要重跑同一批比對，「確定」不能出錯（寧可多標請確認）。
- 面板寫結果：插在來源欄右邊、沒有標題列就補一列、再按一次只更新同一組欄、選錯欄或空欄要報錯不插欄。
- 公司少於 50 萬家或欄位名稱不對就建置失敗、不發布（財政部改格式時保護舊資料）。
- 建立公開儲存庫、開 Pages 這類對外公開的動作，自動模式會擋，要使用者自己做。
