import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "data", "dashboard.json");
async function getJson(url) {
  const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 HSI-HK-Weather-Dashboard/1.0" } });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.json();
}
const [finance, weather] = await Promise.all([
  getJson("https://query2.finance.yahoo.com/v8/finance/chart/%5EHSI?range=1mo&interval=1d"),
  getJson("https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=fnd&lang=tc"),
]);
const result = finance?.chart?.result?.[0];
if (!result) throw new Error(finance?.chart?.error?.description || "恒指資料格式不正確");
const hktDate = timestamp => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(timestamp * 1000));
const round = value => Number(Number(value).toFixed(2));
const closes = result.indicators.quote[0].close;
const sessions = result.timestamp.map((timestamp, index) => ({ date: hktDate(timestamp), close: closes[index] })).filter(item => Number.isFinite(item.close));
const six = sessions.slice(-6);
const marketDays = six.slice(1).map((item, index) => {
  const previous = six[index].close, change = item.close - previous;
  return { date: item.date, close: round(item.close), change: round(change), changePct: round(change / previous * 100) };
});
if (marketDays.length < 5) throw new Error("恒指交易日資料不足五日");
const forecast = weather.weatherForecast.slice(0, 7).map(day => ({
  date: `${day.forecastDate.slice(0,4)}-${day.forecastDate.slice(4,6)}-${day.forecastDate.slice(6,8)}`,
  week: day.week, minTemp: +day.forecastMintemp.value, maxTemp: +day.forecastMaxtemp.value,
  weather: day.forecastWeather, wind: day.forecastWind, icon: +day.ForecastIcon, psr: day.PSR || "—"
}));
const payload = {
  updatedAt: new Date().toISOString(),
  market: { symbol: result.meta.symbol, name: "恒生指數", currency: result.meta.currency, days: marketDays },
  weather: { source: "香港天文台", generalSituation: weather.generalSituation, days: forecast }
};
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(payload, null, 2) + "\n", "utf8");
console.log(`Updated ${output}`);
