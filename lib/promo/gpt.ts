import "server-only";
import { createHmac, randomBytes } from "node:crypto";

const DEFAULT_GATEWAY = "https://www.16688.com.cn/openApi";

export interface GptPromoPrice {
  /** 对外展示价：货源成本价 × (1 + 加价百分比)，保留 1 位小数 */
  price: number;
  /** API 返回的货源 unit_price，仅服务端用于计算 */
  sourcePrice: number;
  goodsNo: string;
  fetchedAt: number;
}

interface PromoConfig {
  gateway: string;
  appId: string;
  secret: string;
  goodsNo: string;
  markupPercent: number;
  ttlMs: number;
}

let cached: GptPromoPrice | null = null;
let pending: Promise<GptPromoPrice | null> | null = null;

function numberEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function readConfig(): PromoConfig | null {
  const appId = process.env.GPT_PROMO_APP_ID?.trim();
  const secret = process.env.GPT_PROMO_APP_SECRET?.trim();
  const goodsNo = process.env.GPT_PROMO_GOODS_NO?.trim();
  if (!appId || !secret || !goodsNo) return null;

  const markupPercent = Math.min(1000, Math.max(0, numberEnv("GPT_PROMO_MARKUP_PERCENT", 20)));
  const ttlSeconds = Math.min(86_400, Math.max(60, numberEnv("GPT_PROMO_REFRESH_SECONDS", 600)));
  return {
    gateway: (process.env.GPT_PROMO_GATEWAY?.trim() || DEFAULT_GATEWAY).replace(/\/+$/, ""),
    appId,
    secret,
    goodsNo,
    markupPercent,
    ttlMs: ttlSeconds * 1000,
  };
}

function canonical(value: string): string {
  return value;
}

function signParams(config: PromoConfig, params: Record<string, string>): string {
  const parts = Object.keys(params)
    .sort()
    .map((key) => `${key}=${canonical(params[key])}`);
  const plain = `POST\ngoods\ndetail\n${parts.join("&")}`;
  return createHmac("sha256", config.secret).update(plain).digest("hex");
}

async function fetchPrice(config: PromoConfig): Promise<GptPromoPrice | null> {
  const params: Record<string, string> = {
    app_id: config.appId,
    timestamp: String(Math.floor(Date.now() / 1000)),
    nonce: randomBytes(8).toString("hex"),
    goods_no: config.goodsNo,
  };
  const body = JSON.stringify({ ...params, sign: signParams(config, params) });

  const res = await fetch(`${config.gateway}/goods/detail`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const json = (await res.json()) as { code?: number; msg?: string; data?: { unit_price?: unknown } };
  if (json.code !== 1) throw new Error(`API code ${String(json.code)}`);

  const sourcePrice = Number(json.data?.unit_price);
  if (!Number.isFinite(sourcePrice) || sourcePrice <= 0) throw new Error("invalid unit_price");

  const price = Math.round(sourcePrice * (1 + config.markupPercent / 100) * 10) / 10;
  return { price, sourcePrice, goodsNo: config.goodsNo, fetchedAt: Date.now() };
}

/**
 * Current displayed shop price. The API exposes the supply cost (`unit_price`); the storefront
 * price is cost plus the configured percentage. Cached for GPT_PROMO_REFRESH_SECONDS and falls
 * back to the last successful value when the API is temporarily unavailable.
 */
export async function getGptPromoPrice(): Promise<GptPromoPrice | null> {
  const config = readConfig();
  if (!config) return null;

  if (cached && Date.now() - cached.fetchedAt < config.ttlMs) return cached;
  if (pending) return pending;

  pending = fetchPrice(config)
    .then((price) => {
      if (price) cached = price;
      return price;
    })
    .catch((err: unknown) => {
      console.warn(`[gpt-promo] price refresh failed: ${err instanceof Error ? err.message : "unknown"}`);
      return null;
    })
    .finally(() => {
      pending = null;
    });

  return (await pending) ?? cached;
}
