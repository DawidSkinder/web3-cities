export type CityMode = 'top200' | 'btc';

const CITY_MODE_QUERY_PARAM = 'mode';

export function normalizeCityMode(value: string | null | undefined): CityMode | null {
  const raw = (value ?? '').trim().toLowerCase();
  if (raw === 'top200' || raw === 'btc') {
    return raw;
  }
  return null;
}

export function resolveCityMode(): CityMode {
  const urlMode =
    typeof window !== 'undefined'
      ? normalizeCityMode(new URLSearchParams(window.location.search).get(CITY_MODE_QUERY_PARAM))
      : null;

  if (urlMode) {
    return urlMode;
  }

  const envMode = normalizeCityMode(import.meta.env.VITE_CITY_MODE);
  return envMode ?? 'top200';
}

export function writeCityModeToUrl(mode: CityMode) {
  if (typeof window === 'undefined') return;

  const url = new URL(window.location.href);
  url.searchParams.set(CITY_MODE_QUERY_PARAM, mode);
  window.history.pushState({ mode }, '', url);
}
