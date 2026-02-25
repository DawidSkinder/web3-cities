/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TRADE_FEED_MODE?: 'live' | 'mock' | 'auto';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
