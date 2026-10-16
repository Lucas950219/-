# 小島食堂排隊點餐

## 發布到 GitHub Pages

1. 在 GitHub 建立一個 repository，並將此專案推送到 `main` 或 `master` 分支。請勿提交 `credentials.json`。
2. 到 repository 的 **Settings → Pages**，將 **Build and deployment → Source** 設為 **GitHub Actions**。
3. 推送變更後，至 **Actions** 確認 `Deploy static site to GitHub Pages` 完成；部署網址會顯示在 workflow 執行結果中。

部署流程會將 `index.html`、`tree.html`、`max_heap.html`、`hash_table.html` 和 `BFS/DFS.html` 放入 Pages 網站，不會發布其他專案檔案。最大堆積互動展示網址為 `https://lucas950219.github.io/-/max_heap.html`；雜湊表鏈結法互動展示網址為 `https://lucas950219.github.io/-/hash_table.html`；BFS／DFS 圖形搜尋展示網址為 `https://lucas950219.github.io/-/BFS/DFS.html`。雜湊表使用 13 個桶，可輸入至少 15 個整數，碰撞時以鏈結法處理。`.gitignore` 會排除本機的 `credentials.json`。

## 資料儲存

目前版本以瀏覽器 `localStorage` 儲存候位紀錄。同一個瀏覽器可在重新整理後保留資料，但不同手機或電腦之間不會同步。要讓店員與客人共用即時隊列，需再接上後端資料庫與存取權限控制；GitHub Pages 本身是靜態網站，不能提供這項服務。