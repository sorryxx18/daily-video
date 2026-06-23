---
task: Add per-segment user photo upload with Pexels fallback
slug: daily-video-photo-upload
effort: E3
phase: execute
progress: 0/36
mode: algorithm
project: daily-video
started: 2026-06-23T08:35:00Z
updated: 2026-06-23T08:35:00Z
---

## Problem

daily-video 影片生成系統目前每個段落都從 Pexels 抓隨機股票影片作為背景，用戶無法插入自己的照片。當用戶有貼合主題的個人照片時，影片更具個人特色但現在無法使用。

## Vision

用戶在 Step 2 段落編輯卡片中，可以為每個段落選擇性上傳自己的照片。點「生成影片」後，有照片的段落用照片（Ken Burns 動態縮放），沒照片的自動去 Pexels 找影片。整個流程感覺無縫，用戶看到的影片明顯比全素材庫照片更有個人風格。

## Out of Scope

- 影片上傳（只支援靜態圖片）
- 照片 resize/裁切 UI
- 多張照片輪播（每段只取一張）
- 照片永久儲存或圖庫功能
- 舊影片重新渲染時的照片管理

## Principles

- 有照片優先用照片，無照片不報錯直接走 Pexels 路徑
- 照片透過 GitHub Contents API commit 到 repo，讓 Actions runner 可以 checkout 到
- 瀏覽器端 base64 encode，Worker 端 commit，不放進 segments_json（避免 Actions input 字元限制）
- 延用現有 KenBurnsPhoto 元件，BackgroundSegment 已支援圖片副檔名偵測

## Constraints

- GitHub Contents API 單檔上限建議 <1MB（實際支援到 100MB 但 PAI 建議控制）
- GitHub Actions workflow_dispatch inputs 字元限制（photos 不能放進去）
- Cloudflare Worker 必須先 commit 照片再觸發 Actions（Sequential）
- Worker 已有 GITHUB_PAT，可直接呼叫 GitHub Contents API
- render.py 必須在 Actions runner 上執行，只能讀取 repo 檔案

## Goal

在 index.html Step 2 每個段落卡片加「上傳照片」按鈕；Worker POST / 先把照片 commit 到 public/user_bg_{i}.{ext}，再觸發 workflow；render.py 優先用 public/user_bg_{i}.* 照片，沒有才下載 Pexels 影片。全部改動 commit 到 sorryxx18/daily-video。

## Criteria

- [ ] ISC-1: index.html Step 2 每個段落卡片有「📷 上傳照片」按鈕/file input
- [ ] ISC-2: 點擊後出現圖片預覽縮圖（顯示確認已選）
- [ ] ISC-3: 預覽縮圖旁有「✕」可清除已選照片
- [ ] ISC-4: 無照片段落顯示預設「點擊上傳或拖拉照片」提示
- [ ] ISC-5: 選照片不影響 Step 2 其他欄位（文字、Pexels query）的編輯
- [ ] ISC-6: renderVideo() 函式收集所有段落的 File 物件
- [ ] ISC-7: 有照片的段落 base64 encode（FileReader.readAsDataURL）
- [ ] ISC-8: POST 到 Worker 的 body 新增 photos 欄位：`[{index, data, ext}]` 陣列
- [ ] ISC-9: 無照片段落不在 photos 陣列中出現
- [ ] ISC-10: worker.js POST / handler 解析 body.photos 欄位
- [ ] ISC-11: Worker 為每張照片呼叫 GitHub Contents API PUT /repos/.../contents/public/user_bg_{i}.{ext}
- [ ] ISC-12: GitHub Contents API 請求包含正確 Authorization Bearer GITHUB_PAT
- [ ] ISC-13: 若 public/user_bg_{i}.{ext} 已存在，Worker 先 GET 取得 sha 再 PUT（避免 422 conflict）
- [ ] ISC-14: commit message 為 "upload user photos for run #{timestamp}"
- [ ] ISC-15: 所有照片 commit 成功後才觸發 workflow_dispatch
- [ ] ISC-16: 若照片 commit 失敗，Worker 回傳錯誤而非繼續觸發 Actions
- [ ] ISC-17: render.py 在每個 segment loop 中，先 glob `public/user_bg_{i:02d}.*`
- [ ] ISC-18: 找到照片時，直接使用其路徑作為 bg_name（不呼叫 download_pexels_video）
- [ ] ISC-19: 找不到照片時，呼叫 download_pexels_video（現有行為保持不變）
- [ ] ISC-20: glob pattern 支援 .jpg / .jpeg / .png / .webp 四種副檔名
- [ ] ISC-21: VideoSkill.tsx 的 BackgroundSegment 元件支援圖片副檔名（已有 KenBurnsPhoto）— 驗證不需改
- [ ] ISC-22: render.py bg_names list 正確映射（有照片用照片名，無照片用 bg_{i:02d}.mp4）
- [ ] ISC-23: 所有修改後 render.py 語法正確（python3 -m py_compile）
- [ ] ISC-24: 所有修改後 worker.js 語法正確（node --check 或 eslint-free parse）
- [ ] ISC-25: index.html 修改後 <script> 無 SyntaxError（JS parse check）
- [ ] ISC-26: git diff 確認三個檔案都有修改
- [ ] ISC-27: git push 成功（exit 0）
- [ ] ISC-28: Anti: base64 資料不出現在 segments_json（防止 Actions input 超長）
- [ ] ISC-29: Anti: Worker 不在照片 commit 前觸發 workflow_dispatch
- [ ] ISC-30: Anti: render.py 不因找不到 user_bg 而拋出 exception（graceful fallback）
- [ ] ISC-31: Anti: index.html 修改後其他按鈕（生成腳本、生成影片）功能正常
- [ ] ISC-32: Antecedent: Worker 有 GITHUB_PAT secret 可呼叫 GitHub Contents API
- [ ] ISC-33: Antecedent: render.py 執行環境有 PUBLIC_DIR 路徑（已存在）
- [ ] ISC-34: Worker body parsing 支援 photos 為 undefined（所有段落都無照片時）
- [ ] ISC-35: photos 陣列為空或 undefined 時，Worker 直接觸發 Actions 不呼叫 GitHub Contents API
- [ ] ISC-36: index.html CSS 樣式：上傳區塊與現有卡片設計一致（灰色虛線框）

## Test Strategy

| isc | type | check | threshold | tool |
|-----|------|-------|-----------|------|
| ISC-1 | functional | grep for file input in index.html | found | Grep |
| ISC-2 | functional | grep for img preview element in index.html | found | Grep |
| ISC-3 | functional | grep for clear button/handler | found | Grep |
| ISC-7 | functional | grep for FileReader/readAsDataURL | found | Grep |
| ISC-8 | functional | grep for photos in fetch body | found | Grep |
| ISC-10 | functional | grep body.photos in worker.js | found | Grep |
| ISC-11 | functional | grep Contents API URL in worker.js | found | Grep |
| ISC-13 | functional | grep sha in worker.js | found | Grep |
| ISC-17 | functional | grep glob/user_bg in render.py | found | Grep |
| ISC-23 | build | python3 -m py_compile scripts/render.py | exit 0 | Bash |
| ISC-25 | build | node --input-type=module < index.html script tag check | no SyntaxError | Bash |
| ISC-26 | deploy | git diff --name-only | 3 files listed | Bash |
| ISC-27 | deploy | git push exit code | 0 | Bash |
| ISC-28 | anti | grep segments_json build pattern | no base64 data | Grep |
| ISC-32 | antecedent | Worker has GITHUB_PAT — already confirmed set | known | inspect |

## Features

| name | satisfies | depends_on | parallelizable |
|------|-----------|------------|----------------|
| UI photo upload cards | ISC-1,2,3,4,5,6,7,8,9,31,36 | none | no (single file) |
| Worker photo commit | ISC-10,11,12,13,14,15,16,28,29,34,35 | UI photo upload | no (sequential API calls) |
| render.py fallback | ISC-17,18,19,20,22,23,30,33 | Worker photo commit | parallel with Worker changes |
| Verification | ISC-24,25,26,27 | all above | no |

## Decisions

- 2026-06-23: Photos committed to `public/user_bg_{i:02d}.{ext}` — persistent in repo. Accept repo growth for simplicity; cleanup is out of scope.
- 2026-06-23: Delegation floor soft (≥2 at E3). Using only Forge for code. Show-your-math: all three files (index.html, worker.js, render.py) are independent edits that Forge handles in one pass; second delegation (e.g. Cato) adds no value at E3 on a pure code-addition task with no security model changes.
- 2026-06-23: GitHub Contents API GET-before-PUT for sha — required to avoid 422 on existing files from previous runs.

## Changelog

## Verification
