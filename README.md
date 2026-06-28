# Stock Lens

一个可分享的股票分析面板。前端是静态页面，`api/quote.js` 是 Vercel Serverless API，用于获取行情数据并避免浏览器跨域问题。

## 本地运行

```bash
npm start
```

打开 `http://127.0.0.1:4173/`。

## 部署到 Vercel

1. 把这个文件夹推送到 GitHub。
2. 在 Vercel 新建项目，选择这个 GitHub 仓库。
3. Framework Preset 选择 `Other`。
4. Build Command 留空。
5. Output Directory 留空或填 `.`。
6. 点击 Deploy。

部署完成后，把 Vercel 给你的网址分享给别人即可。股票代码会写入 URL，例如：

```text
https://your-project.vercel.app/?symbol=NVDA
```

如果不想先用 GitHub，也可以在 Vercel 控制台里直接导入这个项目文件夹。根目录需要包含：

- `index.html`
- `styles.css`
- `script.js`
- `api/quote.js`
- `package.json`
- `vercel.json`

## 数据说明

当前版本使用免费的 Yahoo Finance chart/quote 端点。免费行情通常存在延迟，仅适合观察、演示和产品原型，不构成投资建议。
如果遇到周末或美股休市日，页面显示的是最近一个交易日的数据。
