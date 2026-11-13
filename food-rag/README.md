# 食在北車

以台北車站中央大廳為中心的餐廳檢索與 RAG 問答網站。純靜態 HTML、CSS、JavaScript，可直接部署到 GitHub Pages，不需在網頁放 API Key。

目前收錄 **89 筆餐點／料理類型、22 家餐廳、9 種國家／地區風味、47 個來源**。查閱日：2026-11-13；查閱日不是來源更新日。菜單非即時庫存。料理國家指風味分類。

## 使用方式

開啟 `/food-rag/`，輸入「想吃韓式料理，有飯、不吃牛」或使用料理、主食、食材篩選。調整搜尋半徑及距離權重。問句能辨識「500 公尺」、「1 公里」、「不吃牛肉和豬肉」等條件；下一句會沿用目前篩選。建議問題按鈕會從預設條件重新開始。可切換相對位置示意圖、查看來源與收藏餐廳。

## 真正的 RAG 與預設摘要

預設使用**檢索摘要**：執行真實的知識檢索，再用程式整理資料，不是 LLM 生成。點「檢索摘要模式」→「下載並啟用 AI」後，才會啟用完整 **retrieval-augmented generation**：

1. 讀入獨立的 `data/knowledge.json`，每筆餐點為一個文件片段。
2. 以中文雙字與英文詞組建立稀疏 TF-IDF 向量，用餘弦相似度檢索。
3. 先套用國家／地區、主食、主要食材、排除食材與半徑條件。
4. 依相關度與距離加權排序，餐廳去重。
5. 將排序前 3 家餐廳的實際檢索片段與條件送入 Qwen2.5 1.5B，限制模型只根據資料回答，附參考來源。

AI 使用 [WebLLM](https://github.com/mlc-ai/web-llm) `0.2.88` 與 `Qwen2.5-1.5B-Instruct-q4f32_1-MLC`，透過專用 Worker 在瀏覽器本機推論。需 WebGPU、足夠 GPU 記憶體，首次約 1 GB 下載（實際以引擎下載量為準）。模型與引擎需外部連線，模型檔由 Hugging Face 提供；沒有 WebGPU 或載入失敗會保留摘要功能。模型生成文字仍可能出錯，卡片與檢索依據可核對原始資料。

### 推薦分數

`distanceScore = 1 / (1 + straightLineMeters / 500)`

`score = (1 - weight) * relevance + weight * distanceScore`

無文字查詢時，相關度為 1。有結構條件時，相關度為 `0.55 + 0.45 * normalizedCosineSimilarity`；沒有結構條件時只使用正規化文字相似度。正規化以上述條件篩選後候選的最高相似度為 1。距離權重預設 35%，可調 0–80%。顯示的是符合分數，不是星等或餐廳品質評分。「距離最近」排序直接使用距離。

距離以 Haversine 計算約略座標間直線距離，**不是步行距離或步行時間**。京站店家共用建物座標，示意圖為可讀性稍微分散同址標記。實際路線由 Google Maps 導航。

## 本機執行與驗證

在專案根目錄啟動任意靜態 HTTP 伺服器，例如 `python -m http.server 8765`，開啟 `http://localhost:8765/food-rag/`。不可直接雙擊 HTML，因模組與 JSON fetch 需要 HTTP。

推薦引擎測試：開啟 `http://localhost:8765/food-rag/tests/`，所有斷言結果會在頁面列出。測試頁不會複製到正式 Pages。

## GitHub Pages

沿用上層專案 `.github/workflows/pages.yml`。推送 `main`／`master` 會部署。Workflow 僅白名單複製網站資產與知識庫，避免發布工作目錄的 `.env`、本機憑證及其他未追蹤檔。部署網址以 GitHub 回傳為準，預期新頁路徑為 `https://lucas950219.github.io/-/food-rag/`。

## 更新資料

編輯 `data/knowledge.json` 的 `restaurants`、`foods`、`sources`，每個餐點保留來源 ID；更新查閱日與 `data/SOURCES.md`，再執行測試。`branch-menu` 表示分店公開資料，`brand-menu` 表示品牌參考品項、分店供應待確認。主要食材未知不能作為不含牛豬的保證；排除食材時會排除主要食材未知的餐點，但湯底、醬汁與交叉接觸仍須向店家確認。未收錄即時價格、營業時間、庫存、評價、訂位或飲食認證。

收藏只保存在瀏覽器 localStorage，無帳號、後端、分析追蹤與提問紀錄上傳。字型由 Google Fonts 載入，無連線時使用系統字型。
