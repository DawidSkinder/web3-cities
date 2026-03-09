export type CryptoCityMode = 'btc' | 'eth' | 'sol';
export type CityMode = 'top200' | CryptoCityMode;

const CITY_MODE_QUERY_PARAM = 'mode';
const CRYPTO_ASSET_QUERY_PARAM = 'asset';

export const CRYPTO_CITY_MODES = ['btc', 'eth', 'sol'] as const;

export function isCryptoCityMode(value: string | null | undefined): value is CryptoCityMode {
  const raw = (value ?? '').trim().toLowerCase();
  return raw === 'btc' || raw === 'eth' || raw === 'sol';
}

export function normalizeCityMode(
  value: string | null | undefined,
  cryptoAssetValue?: string | null | undefined
): CityMode | null {
  const raw = (value ?? '').trim().toLowerCase();
  if (raw === 'top200' || isCryptoCityMode(raw)) {
    return raw;
  }
  if (raw === 'crypto' && isCryptoCityMode(cryptoAssetValue)) {
    return cryptoAssetValue;
  }
  return null;
}

export function resolveCityMode(): CityMode {
  const urlMode = (() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    return normalizeCityMode(params.get(CITY_MODE_QUERY_PARAM), params.get(CRYPTO_ASSET_QUERY_PARAM));
  })();

  if (urlMode) {
    return urlMode;
  }

  const envMode = normalizeCityMode(import.meta.env.VITE_CITY_MODE, import.meta.env.VITE_CRYPTO_CITY_ASSET);
  return envMode ?? 'top200';
}

export function writeCityModeToUrl(mode: CityMode) {
  if (typeof window === 'undefined') return;

  const url = new URL(window.location.href);
  if (mode === 'top200') {
    url.searchParams.set(CITY_MODE_QUERY_PARAM, mode);
    url.searchParams.delete(CRYPTO_ASSET_QUERY_PARAM);
  } else {
    url.searchParams.set(CITY_MODE_QUERY_PARAM, 'crypto');
    url.searchParams.set(CRYPTO_ASSET_QUERY_PARAM, mode);
  }
  window.history.pushState({ mode }, '', url);
}
