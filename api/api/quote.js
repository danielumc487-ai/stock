const DEFAULT_SYMBOLS = ["NVDA", "AMZN", "MSFT", "AAPL", "TSLA"];
const MAX_SYMBOLS = 8;

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store, max-age=0");
  res.end(JSON.stringify(payload));
}

function normalizeSymbols(input) {
  const source = String(input || DEFAULT_SYMBOLS.join(","));
  return source
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter((symbol) => /^[A-Z0-9.^=-]{1,16}$/.test(symbol))
    .slice(0, MAX_SYMBOLS);
}

function compactNumber(value) {
  if (!Number.isFinite(value)) return null;
  if (Math.abs(value) >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
  if (Math.abs(value) >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (Math.abs(value) >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  return value.toLocaleString("en-US");
}

function percentileRank(values, current) {
  const clean = values.filter((value) => Number.isFinite(value));
  if (!clean.length || !Number.isFinite(current)) return null;
  const lowerOrEqual = clean.filter((value) => value <= current).length;
  return Number(((lowerOrEqual / clean.length) * 100).toFixed(1));
}

function volatility(values) {
  const returns = values
    .map((value, index) => {
      if (index === 0 || !Number.isFinite(value) || !Number.isFinite(values[index - 1])) return null;
      return value / values[index - 1] - 1;
    })
    .filter((value) => Number.isFinite(value));

  if (returns.length < 2) return null;
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance =
    returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
  return Number((Math.sqrt(variance) * Math.sqrt(252) * 100).toFixed(1));
}

function getState(percentile) {
  if (!Number.isFinite(percentile)) return "观察";
  if (percentile < 30) return "低位";
  if (percentile < 70) return "中性";
  return "高位";
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  let response;
  try {
    response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "Mozilla/5.0 StockLens/1.0",
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Upstream responded with ${response.status}`);
  }

  return response.json();
}

async function fetchQuoteMap(symbols) {
  const urls = ["query1", "query2"].map(
    (host) =>
      `https://${host}.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(
        symbols.join(","),
      )}`,
  );

  try {
    const data = await Promise.any(urls.map((url) => fetchJson(url)));
    const results = data.quoteResponse?.result || [];
    return new Map(results.map((quote) => [quote.symbol, quote]));
  } catch {
    return new Map();
  }
}

async function fetchChart(symbol, quote) {
  const path = `/v8/finance/chart/${encodeURIComponent(symbol)}?range=3mo&interval=1d`;
  const data = await Promise.any(
    ["query1", "query2"].map((host) => fetchJson(`https://${host}.finance.yahoo.com${path}`)),
  );
  const result = data.chart?.result?.[0];
  if (!result) throw new Error(`No chart data for ${symbol}`);

  const closes = (result.indicators?.quote?.[0]?.close || []).filter((value) =>
    Number.isFinite(value),
  );
  const meta = result.meta || {};
  const current = Number(meta.regularMarketPrice ?? quote?.regularMarketPrice ?? closes.at(-1));
  const previous = Number(meta.chartPreviousClose ?? quote?.regularMarketPreviousClose);
  const change = Number.isFinite(previous) && previous !== 0 ? ((current - previous) / previous) * 100 : null;
  const percentile = percentileRank(closes, current);

  return {
    symbol,
    name: quote?.shortName || quote?.longName || meta.shortName || symbol,
    price: Number(current.toFixed(2)),
    change: Number.isFinite(change) ? Number(change.toFixed(2)) : null,
    percentile,
    state: getState(percentile),
    cap: compactNumber(quote?.marketCap),
    currency: meta.currency || quote?.currency || "",
    exchange: meta.exchangeName || quote?.fullExchangeName || quote?.exchange || "",
    sourceDelay: meta.currentTradingPeriod ? "交易所行情可能存在延迟" : "行情可能存在延迟",
    updatedAt: new Date((meta.regularMarketTime || Date.now() / 1000) * 1000).toISOString(),
    volatility: volatility(closes),
    trend: closes.slice(-48).map((value) => Number(value.toFixed(2))),
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const url = new URL(req.url, "http://localhost");
  const symbols = normalizeSymbols(url.searchParams.get("symbols"));

  if (!symbols.length) {
    sendJson(res, 400, { error: "请输入有效股票代码" });
    return;
  }

  try {
    const quoteMap = await fetchQuoteMap(symbols);
    const settledQuotes = await Promise.allSettled(
      symbols.map((symbol) => fetchChart(symbol, quoteMap.get(symbol))),
    );
    const quotes = settledQuotes
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value);

    if (!quotes.length) {
      throw new Error("No quote data returned");
    }

    sendJson(res, 200, {
      provider: "Yahoo Finance chart/quote endpoints",
      note: "免费行情通常存在延迟，仅供观察和产品原型使用。",
      updatedAt: new Date().toISOString(),
      quotes,
    });
  } catch (error) {
    sendJson(res, 502, {
      error: "暂时无法获取行情数据",
      detail: error.message,
    });
  }
};
