const palette = ["#75a2ff", "#ffd85a", "#8ee76e", "#ff8d75", "#c78cff", "#66e3d0"];
const defaultSymbols = ["NVDA", "AMZN", "MSFT", "AAPL", "TSLA"];

const form = document.querySelector("#stockForm");
const input = document.querySelector("#symbolInput");
const quickSymbols = document.querySelector("#quickSymbols");
const canvas = document.querySelector("#trendChart");
const ctx = canvas.getContext("2d");
const shareButton = document.querySelector("#shareButton");
const dataStatus = document.querySelector("#dataStatus");

const state = {
  activeSymbol: new URLSearchParams(window.location.search).get("symbol") || "NVDA",
  quotes: new Map(),
  symbols: [...defaultSymbols],
  isLoading: false,
};

function normalizeSymbol(symbol) {
  return symbol.trim().toUpperCase();
}

function getState(percentile) {
  if (!Number.isFinite(percentile)) return "观察";
  if (percentile < 30) return "低位";
  if (percentile < 70) return "中性";
  return "高位";
}

function getStatusClass(status) {
  if (status === "低位") return "status-low";
  if (status === "中性" || status === "观察") return "status-mid";
  return "status-high";
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return "--";
  return `${value.toFixed(1)}%`;
}

function formatPrice(value, currency) {
  if (!Number.isFinite(value)) return "--";
  return `${value.toFixed(2)}${currency ? ` ${currency}` : ""}`;
}

function setLoading(isLoading, message) {
  state.isLoading = isLoading;
  form.querySelector("button[type='submit']").disabled = isLoading;
  dataStatus.textContent = message;
}

function enrichQuote(quote, index) {
  const percentile = Number.isFinite(quote.percentile) ? quote.percentile : 50;
  return {
    ...quote,
    color: palette[index % palette.length],
    state: quote.state || getState(percentile),
    percentile,
    volatilityText: Number.isFinite(quote.volatility) ? `${quote.volatility.toFixed(1)}%` : "--",
    cap: quote.cap || "--",
    trend: quote.trend?.length ? quote.trend : [quote.price].filter(Number.isFinite),
  };
}

async function fetchQuotes(symbols) {
  const uniqueSymbols = [...new Set(symbols.map(normalizeSymbol).filter(Boolean))];
  const response = await fetch(
    `/api/quote?symbols=${encodeURIComponent(uniqueSymbols.join(","))}&t=${Date.now()}`,
    { cache: "no-store" },
  );
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "行情数据请求失败");
  }

  return payload;
}

function drawChart(stock) {
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.floor(rect.width * ratio);
  canvas.height = Math.floor(rect.height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const values = stock.trend.filter(Number.isFinite);
  if (values.length < 2) {
    ctx.fillStyle = "rgba(214, 226, 255, 0.68)";
    ctx.font = "15px system-ui";
    ctx.fillText("暂无足够折线数据", 28, 42);
    return;
  }

  const padding = { top: 18, right: 18, bottom: 28, left: 44 };
  const min = Math.min(...values) * 0.98;
  const max = Math.max(...values) * 1.02;
  const range = max - min || 1;
  const width = rect.width - padding.left - padding.right;
  const height = rect.height - padding.top - padding.bottom;

  ctx.strokeStyle = "rgba(190, 210, 255, 0.16)";
  ctx.lineWidth = 1;

  for (let i = 0; i < 4; i += 1) {
    const y = padding.top + (height / 3) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(rect.width - padding.right, y);
    ctx.stroke();
  }

  const points = values.map((value, index) => {
    const x = padding.left + (width / (values.length - 1)) * index;
    const y = padding.top + height - ((value - min) / range) * height;
    return { x, y };
  });

  const gradient = ctx.createLinearGradient(0, padding.top, 0, rect.height - padding.bottom);
  gradient.addColorStop(0, `${stock.color}66`);
  gradient.addColorStop(1, `${stock.color}00`);

  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.lineTo(points.at(-1).x, rect.height - padding.bottom);
  ctx.lineTo(points[0].x, rect.height - padding.bottom);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.strokeStyle = stock.color;
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();

  points.forEach((point, index) => {
    const step = Math.max(1, Math.floor(points.length / 8));
    if (index % step !== 0 && index !== points.length - 1) return;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#eef4ff";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(point.x, point.y, 2.4, 0, Math.PI * 2);
    ctx.fillStyle = stock.color;
    ctx.fill();
  });
}

function renderChips() {
  quickSymbols.innerHTML = state.symbols
    .map(
      (symbol) =>
        `<button class="chip ${symbol === state.activeSymbol ? "active" : ""}" type="button" data-symbol="${symbol}">${symbol}</button>`,
    )
    .join("");
}

function renderComparison() {
  const stocks = [...state.quotes.values()].sort((a, b) => a.percentile - b.percentile);
  document.querySelector("#comparisonRows").innerHTML = stocks
    .map((stock) => {
      const isActive = stock.symbol === state.activeSymbol;
      return `
        <tr>
          <td>
            <div class="company-cell" style="color:${stock.color}">
              <span class="dot" style="background:${stock.color}"></span>
              ${stock.name}${isActive ? " · 当前" : ""}
            </div>
          </td>
          <td>${Number.isFinite(stock.price) ? stock.price.toFixed(2) : "--"}</td>
          <td class="percent">${formatPercent(stock.percentile)}</td>
          <td class="${getStatusClass(stock.state)}">${stock.state}</td>
        </tr>
      `;
    })
    .join("");
}

function renderAnalysis(stock) {
  const changeWord = stock.change >= 0 ? "上涨" : "下跌";
  const changeText = Number.isFinite(stock.change)
    ? `今日${changeWord} ${Math.abs(stock.change).toFixed(2)}%`
    : "今日涨跌幅暂不可用";
  const statusText =
    stock.state === "低位"
      ? "价格处在近 3 个月较低区间，适合继续观察是否有基本面催化。"
      : stock.state === "中性"
        ? "价格位于近 3 个月中性区域，更适合结合盈利增速和行业景气度判断。"
        : stock.state === "高位"
          ? "价格百分位偏高，短期需要更关注回撤风险和预期兑现。"
          : "当前数据不足，建议稍后刷新或换一个代码查看。";

  document.querySelector("#analysisText").textContent =
    `${stock.symbol} 当前价格为 ${formatPrice(stock.price, stock.currency)}，${changeText}。` +
    `价格百分位为 ${formatPercent(stock.percentile)}，状态为“${stock.state}”。${statusText}`;
  document.querySelector("#riskTag").textContent =
    stock.state === "高位" ? "风险偏高" : stock.state === "中性" ? "中性观察" : "低位观察";
}

function renderActiveStock() {
  const stock = state.quotes.get(state.activeSymbol);
  if (!stock) return;

  document.querySelector("#companyName").textContent = stock.name;
  document.querySelector("#symbolPill").textContent = stock.symbol;
  document.querySelector("#currentPrice").textContent = Number.isFinite(stock.price)
    ? stock.price.toFixed(2)
    : "--";
  const priceChange = document.querySelector("#priceChange");
  priceChange.textContent = Number.isFinite(stock.change)
    ? `${stock.change >= 0 ? "+" : ""}${stock.change.toFixed(2)}%`
    : "--";
  priceChange.classList.toggle("negative", stock.change < 0);
  document.querySelector("#percentile").textContent = formatPercent(stock.percentile);
  document.querySelector("#valuationState").textContent = stock.state;
  document.querySelector("#valuationState").className = getStatusClass(stock.state);
  document.querySelector("#marketCap").textContent = stock.cap;
  document.querySelector("#volatility").textContent = stock.volatilityText;
  document.querySelector("#todayLabel").textContent = new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
  }).format(new Date());

  renderChips();
  renderComparison();
  renderAnalysis(stock);
  drawChart(stock);
}

function syncUrl() {
  const url = new URL(window.location.href);
  url.searchParams.set("symbol", state.activeSymbol);
  window.history.replaceState({}, "", url);
}

async function loadDashboard(symbol) {
  const normalized = normalizeSymbol(symbol) || "NVDA";
  state.activeSymbol = normalized;

  if (!state.symbols.includes(normalized)) {
    state.symbols = [normalized, ...state.symbols].slice(0, 8);
  }

  input.value = normalized;
  syncUrl();
  renderChips();
  setLoading(true, "正在获取最新行情...");

  try {
    const symbols = [normalized, ...defaultSymbols].slice(0, 8);
    const payload = await fetchQuotes(symbols);
    state.quotes = new Map(
      payload.quotes.map((quote, index) => {
        const enriched = enrichQuote(quote, index);
        return [enriched.symbol, enriched];
      }),
    );
    if (!state.quotes.has(state.activeSymbol)) {
      throw new Error(`没有找到 ${state.activeSymbol} 的行情，请检查代码是否正确`);
    }
    state.symbols = [...state.quotes.keys()];
    renderActiveStock();

    const active = state.quotes.get(state.activeSymbol);
    const updatedAt = active?.updatedAt
      ? new Intl.DateTimeFormat("zh-CN", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }).format(new Date(active.updatedAt))
      : "--";
    setLoading(false, `已更新 ${updatedAt} · 免费行情可能存在延迟`);
  } catch (error) {
    setLoading(false, `行情获取失败：${error.message}`);
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  loadDashboard(input.value);
});

quickSymbols.addEventListener("click", (event) => {
  const button = event.target.closest("[data-symbol]");
  if (!button) return;
  loadDashboard(button.dataset.symbol);
});

shareButton.addEventListener("click", async () => {
  syncUrl();
  try {
    await navigator.clipboard.writeText(window.location.href);
    dataStatus.textContent = "分享链接已复制";
  } catch {
    dataStatus.textContent = window.location.href;
  }
});

window.addEventListener("resize", () => renderActiveStock());

input.value = state.activeSymbol;
loadDashboard(state.activeSymbol);
