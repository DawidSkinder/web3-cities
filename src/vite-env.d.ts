/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TRADE_FEED_MODE?: 'live' | 'mock' | 'auto';
  readonly VITE_CITY_MODE?: 'top200' | 'btc';
  readonly VITE_TOP_COINS_POLL_MS?: string;
  readonly VITE_TOP_COINS_LIMIT?: string;
  readonly VITE_TOP_COINS_QUOTE?: string;
  readonly VITE_TOP_COINS_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
