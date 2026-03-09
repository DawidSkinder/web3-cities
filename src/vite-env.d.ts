/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TRADE_FEED_MODE?: 'live' | 'mock' | 'auto';
  readonly VITE_CITY_MODE?: 'top200' | 'crypto' | 'btc' | 'eth' | 'sol' | 'bnb' | 'xrp' | 'lunc';
  readonly VITE_CRYPTO_CITY_ASSET?: 'btc' | 'eth' | 'sol' | 'bnb' | 'xrp' | 'lunc';
  readonly VITE_TOP_COINS_POLL_MS?: string;
  readonly VITE_TOP_COINS_LIMIT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
