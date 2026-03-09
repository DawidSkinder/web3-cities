import { useEffect, useMemo, useRef, useState } from 'react';
import { CRYPTO_CITY_MODES, isCryptoCityMode } from '../lib/cityMode';
import type { CryptoCityMode } from '../lib/cityMode';
import type { CityMode } from '../lib/cityMode';
import { CRYPTO_CITY_PRESETS } from '../data/cryptoCity/presets';
import type { UiMetricPanel } from './cityMetrics';
import web3CitiesLogoUrl from '../../dawidskinder_web3cities_logo_v1.svg';
import dawidPhotoUrl from '../../ds_photo.png';

type HelpKey = 'mouse' | 'keyboard' | null;
const MOBILE_BREAKPOINT_PX = 640;
const MOBILE_ZOOM_OUT_LABEL = 'Zoom out camera';
const MOBILE_ZOOM_IN_LABEL = 'Zoom in camera';
const MOBILE_NOTICE_STORAGE_KEY = 'web3-cities:mobile-notice-dismissed:v1';
const WEB3_CITIES_SITE_URL = 'https://web3cities.dawidskinder.pl';

const MODE_COPY: Record<
  CityMode,
  {
    title: string;
    description: string;
  }
> = {
  btc: CRYPTO_CITY_PRESETS.btc,
  eth: CRYPTO_CITY_PRESETS.eth,
  sol: CRYPTO_CITY_PRESETS.sol,
  bnb: CRYPTO_CITY_PRESETS.bnb,
  xrp: CRYPTO_CITY_PRESETS.xrp,
  lunc: CRYPTO_CITY_PRESETS.lunc,
  top200: {
    title: 'Market City',
    description:
      'A live skyline of the top traded coins, where each building tracks market performance, momentum, and relative scale across the broader crypto landscape.'
  }
};

const MOUSE_CONTROLS = [
  ['Left mouse drag', 'Orbit manually and enter user-control mode'],
  ['Mouse wheel', 'Zoom camera'],
  ['Mouse hover over a tower', 'Highlight tower and show floating HUD'],
  ['Mouse click on a tower', 'Focus camera on the selected tower and orbit around it automatically']
] as const;

const KEYBOARD_CONTROLS = [
  ['W / S', 'Raise and lower camera and look target'],
  ['A / D', 'Orbit camera horizontally'],
  ['Q / E', 'Zoom in and out'],
  ['R', 'Reset camera to automatic orbit mode and clear active tower focus']
] as const;

function MouseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="web3-ui__glyph">
      <rect x="6.5" y="2.5" width="11" height="19" rx="5.5" />
      <line x1="12" y1="3.5" x2="12" y2="9" />
    </svg>
  );
}

function KeyboardIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="web3-ui__glyph">
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <rect x="6" y="8" width="2.4" height="2.4" rx="0.6" />
      <rect x="10.8" y="8" width="2.4" height="2.4" rx="0.6" />
      <rect x="15.6" y="8" width="2.4" height="2.4" rx="0.6" />
      <rect x="6" y="12.2" width="12" height="2.4" rx="0.8" />
    </svg>
  );
}

function FlyoverIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="web3-ui__glyph">
      <path d="M6 16.5c2.1-5.1 8.4-8.5 13-6.1" />
      <path d="M8.2 19.1c4.1 0.9 7.8-0.7 10.4-4.2" />
      <path d="M18.8 5.8 20 9.6 16.2 8.4" />
      <circle cx="6.4" cy="9.2" r="1.1" />
    </svg>
  );
}

function HamburgerIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="web3-ui__glyph">
      <line x1="5" y1="7" x2="19" y2="7" />
      <line x1="5" y1="12" x2="19" y2="12" />
      <line x1="5" y1="17" x2="19" y2="17" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="web3-ui__glyph">
      <path d="M20 12a8 8 0 1 1-2.34-5.66" />
      <polyline points="20 4 20 10 14 10" />
    </svg>
  );
}

function ZoomOutIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="web3-ui__glyph">
      <circle cx="10.5" cy="10.5" r="5.5" />
      <line x1="7.75" y1="10.5" x2="13.25" y2="10.5" />
      <line x1="15.2" y1="15.2" x2="20" y2="20" />
    </svg>
  );
}

function ZoomInIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="web3-ui__glyph">
      <circle cx="10.5" cy="10.5" r="5.5" />
      <line x1="7.75" y1="10.5" x2="13.25" y2="10.5" />
      <line x1="10.5" y1="7.75" x2="10.5" y2="13.25" />
      <line x1="15.2" y1="15.2" x2="20" y2="20" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="web3-ui__tab-chevron">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function ControlsPopover({
  id,
  title,
  rows
}: {
  id: string;
  title: string;
  rows: ReadonlyArray<readonly [string, string]>;
}) {
  return (
    <div id={id} className="web3-ui__popover" role="tooltip">
      <div className="web3-ui__popover-title">{title}</div>
      <div className="web3-ui__popover-list">
        {rows.map(([label, detail]) => (
          <div key={label} className="web3-ui__popover-row">
            <span className="web3-ui__popover-key">{label}</span>
            <span className="web3-ui__popover-detail">{detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function detectDesktopSafari() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const vendor = navigator.vendor || '';
  const isSafariEngine = /Safari/i.test(ua) && /Apple/i.test(vendor);
  const isOtherBrowser = /(Chrome|Chromium|CriOS|EdgiOS|Edg|OPR|Opera|Firefox|FxiOS|DuckDuckGo)/i.test(ua);
  const isMobileViewport = window.matchMedia?.(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`).matches ?? false;
  return isSafariEngine && !isOtherBrowser && !isMobileViewport;
}

export function Web3CitiesUi({
  mode,
  cryptoSelection,
  onModeChange,
  metricPanel,
  onCinematicFlyover,
  cinematicFlyoverActive = false,
  onResetCamera,
  onZoomOut,
  onZoomIn
}: {
  mode: CityMode;
  cryptoSelection: CryptoCityMode;
  onModeChange?: (nextMode: CityMode) => void;
  metricPanel: UiMetricPanel;
  onCinematicFlyover?: () => void;
  cinematicFlyoverActive?: boolean;
  onResetCamera?: () => void;
  onZoomOut?: () => void;
  onZoomIn?: () => void;
}) {
  const [hoverPopover, setHoverPopover] = useState<HelpKey>(null);
  const [pinnedPopover, setPinnedPopover] = useState<HelpKey>(null);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`).matches : false
  );
  const [isDesktopSafari, setIsDesktopSafari] = useState(() => detectDesktopSafari());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileNoticeVisible, setMobileNoticeVisible] = useState(false);
  const [cryptoMenuOpen, setCryptoMenuOpen] = useState(false);
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);
  const desktopActionsRef = useRef<HTMLDivElement | null>(null);
  const hasShownMobileNoticeRef = useRef(false);
  const modeCopy = MODE_COPY[mode];
  const currentCryptoLabel = MODE_COPY[cryptoSelection].title;
  const currentCryptoLabelUpper = currentCryptoLabel.toUpperCase();

  useEffect(() => {
    setHoverPopover(null);
    setPinnedPopover(null);
    setCryptoMenuOpen(false);
  }, [mode]);

  useEffect(() => {
    if (!pinnedPopover) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (controlsRef.current?.contains(event.target as Node)) return;
      setPinnedPopover(null);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [pinnedPopover]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`);
    const syncMobileState = () => {
      setIsMobile(mediaQuery.matches);
      setIsDesktopSafari(detectDesktopSafari());
    };

    syncMobileState();
    mediaQuery.addEventListener('change', syncMobileState);
    return () => {
      mediaQuery.removeEventListener('change', syncMobileState);
    };
  }, []);

  useEffect(() => {
    if (isMobile && !hasShownMobileNoticeRef.current) {
      hasShownMobileNoticeRef.current = true;

      let dismissed = false;
      if (typeof window !== 'undefined') {
        try {
          dismissed = window.localStorage.getItem(MOBILE_NOTICE_STORAGE_KEY) === '1';
        } catch {
          dismissed = false;
        }
      }

      setMobileNoticeVisible(!dismissed);
    }

    if (!isMobile) {
      setMobileMenuOpen(false);
      setMobileNoticeVisible(false);
    }
  }, [isMobile]);

  useEffect(() => {
    if (!isMobile || !mobileMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (mobileMenuRef.current?.contains(event.target as Node)) return;
      setMobileMenuOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [isMobile, mobileMenuOpen]);

  useEffect(() => {
    if (isMobile || !cryptoMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (desktopActionsRef.current?.contains(event.target as Node)) return;
      setCryptoMenuOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [cryptoMenuOpen, isMobile]);

  const currentUrl = typeof window !== 'undefined' ? window.location.href : WEB3_CITIES_SITE_URL;
  const shareHref = useMemo(() => {
    const text =
      'Web3 Cities turns live crypto data into cinematic, explorable worlds that make complex Web3 systems feel clear and worth exploring.';
    const url = new URL('https://x.com/intent/tweet');
    url.searchParams.set('text', text);
    url.searchParams.set('url', currentUrl);
    return url.toString();
  }, [currentUrl]);

  const openPopover = pinnedPopover ?? hoverPopover;

  const handlePopoverToggle = (key: Exclude<HelpKey, null>) => {
    setPinnedPopover((current) => (current === key ? null : key));
  };

  const handleHelpMouseEnter = (key: Exclude<HelpKey, null>) => {
    if (isMobile) return;
    setHoverPopover(key);
  };

  const handleHelpMouseLeave = (key: Exclude<HelpKey, null>) => {
    if (isMobile) return;
    setHoverPopover((current) => (current === key ? null : current));
  };

  const handleDismissMobileNotice = () => {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(MOBILE_NOTICE_STORAGE_KEY, '1');
      } catch {
        // Ignore storage failures and just dismiss for this render.
      }
    }
    setMobileNoticeVisible(false);
  };

  const handleModeSelection = (nextMode: CityMode) => {
    setCryptoMenuOpen(false);
    setMobileMenuOpen(false);
    if (nextMode === mode) return;
    onModeChange?.(nextMode);
  };

  return (
    <div
      className={`web3-ui ${isMobile ? 'is-mobile' : 'is-desktop'}${isDesktopSafari ? ' is-desktop-safari' : ''}`}
      aria-live="polite"
    >
      <section className="web3-ui__corner web3-ui__corner--top-left">
        {isMobile ? (
          <div className="web3-ui__mobile-logo-wrap">
            <img className="web3-ui__logo web3-ui__logo--mobile" src={web3CitiesLogoUrl} alt="Web3 Cities" />
          </div>
        ) : (
          <div className="web3-ui__panel web3-ui__panel--brand">
            <img className="web3-ui__logo" src={web3CitiesLogoUrl} alt="Web3 Cities" />
            <h1 className="web3-ui__headline">Designing clarity for complex Web3 systems.</h1>
            <p className="web3-ui__body">
              Web3 Cities transforms live crypto data into interactive worlds - showing how brand, product thinking, and UX
              can make complex systems feel legible, alive, and worth exploring.
            </p>
          </div>
        )}
      </section>

      <section className="web3-ui__corner web3-ui__corner--top-right">
        {isMobile ? (
          <div ref={mobileMenuRef} className="web3-ui__mobile-menu-wrap">
            <button
              type="button"
              className="web3-ui__help-trigger web3-ui__mobile-menu-button"
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-navigation-panel"
              onClick={() => setMobileMenuOpen((current) => !current)}
            >
              <HamburgerIcon />
            </button>

            {mobileMenuOpen ? (
              <div id="mobile-navigation-panel" className="web3-ui__panel web3-ui__panel--mobile-menu">
                <h1 className="web3-ui__headline web3-ui__headline--mobile">Designing clarity for complex Web3 systems.</h1>
                <p className="web3-ui__body web3-ui__body--mobile-menu">
                  Web3 Cities transforms live crypto data into interactive worlds - showing how brand, product thinking, and
                  UX can make complex systems feel legible, alive, and worth exploring.
                </p>

                <div className="web3-ui__nav-stack">
                  <div className="web3-ui__tabs-wrap">
                    <div className="web3-ui__tabs" aria-label="City modes">
                      <button
                        type="button"
                        aria-pressed={mode === 'top200'}
                        className={`web3-ui__tab${mode === 'top200' ? ' is-active' : ''}`}
                        onClick={() => handleModeSelection('top200')}
                      >
                        Market City
                      </button>
                      <button
                        type="button"
                        aria-expanded={cryptoMenuOpen}
                        className={`web3-ui__tab web3-ui__tab--select${isCryptoCityMode(mode) ? ' is-active' : ''}`}
                        onClick={() => setCryptoMenuOpen((current) => !current)}
                      >
                        <span className="web3-ui__tab-select-copy">
                          <span>Crypto City</span>
                          <span className="web3-ui__tab-detail">{currentCryptoLabelUpper}</span>
                        </span>
                        <ChevronDownIcon />
                      </button>
                    </div>
                    {cryptoMenuOpen ? (
                      <div className="web3-ui__tab-menu web3-ui__tab-menu--overlay" role="listbox" aria-label="Crypto City options">
                        {CRYPTO_CITY_MODES.map((cryptoMode) => (
                          <button
                            key={cryptoMode}
                            type="button"
                            className={`web3-ui__tab-option${cryptoSelection === cryptoMode ? ' is-active' : ''}`}
                            onClick={() => handleModeSelection(cryptoMode)}
                          >
                            {CRYPTO_CITY_PRESETS[cryptoMode].selectorLabel}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="web3-ui__action-row">
                    <a
                      className="web3-ui__cta"
                      href="https://www.dawidskinder.pl"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <span>Build your web3 product with me</span>
                      <img className="web3-ui__cta-photo" src={dawidPhotoUrl} alt="" aria-hidden="true" />
                    </a>

                    <a className="web3-ui__text-action" href={shareHref} target="_blank" rel="noopener noreferrer">
                      Share on X
                    </a>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div ref={desktopActionsRef} className="web3-ui__panel web3-ui__panel--actions">
            <div className="web3-ui__nav-stack">
              <div className="web3-ui__tabs-wrap">
                <div className="web3-ui__tabs" aria-label="City modes">
                  <button
                    type="button"
                    aria-pressed={mode === 'top200'}
                    className={`web3-ui__tab${mode === 'top200' ? ' is-active' : ''}`}
                    onClick={() => handleModeSelection('top200')}
                  >
                    Market City
                  </button>
                  <button
                    type="button"
                    aria-expanded={cryptoMenuOpen}
                    className={`web3-ui__tab web3-ui__tab--select${isCryptoCityMode(mode) ? ' is-active' : ''}`}
                    onClick={() => setCryptoMenuOpen((current) => !current)}
                  >
                    <span className="web3-ui__tab-select-copy">
                      <span>Crypto City</span>
                      <span className="web3-ui__tab-detail">{currentCryptoLabelUpper}</span>
                    </span>
                    <ChevronDownIcon />
                  </button>
                </div>
                {cryptoMenuOpen ? (
                  <div className="web3-ui__tab-menu web3-ui__tab-menu--overlay" role="listbox" aria-label="Crypto City options">
                    {CRYPTO_CITY_MODES.map((cryptoMode) => (
                      <button
                        key={cryptoMode}
                        type="button"
                        className={`web3-ui__tab-option${cryptoSelection === cryptoMode ? ' is-active' : ''}`}
                        onClick={() => handleModeSelection(cryptoMode)}
                      >
                        {CRYPTO_CITY_PRESETS[cryptoMode].selectorLabel}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="web3-ui__action-row">
                <a
                  className="web3-ui__cta"
                  href="https://www.dawidskinder.pl"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span>Build your web3 product with me</span>
                  <img className="web3-ui__cta-photo" src={dawidPhotoUrl} alt="" aria-hidden="true" />
                </a>

                <a className="web3-ui__text-action" href={shareHref} target="_blank" rel="noopener noreferrer">
                  Share on X
                </a>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="web3-ui__corner web3-ui__corner--bottom-left">
        <div className="web3-ui__panel web3-ui__panel--mode">
          <p className="web3-ui__eyebrow">Current world</p>
          <h2 className="web3-ui__section-title">{modeCopy.title}</h2>
          <p className="web3-ui__body web3-ui__body--compact">{modeCopy.description}</p>

          <div ref={controlsRef} className="web3-ui__controls" aria-label="Controls help">
            {isMobile ? (
              <>
                <button
                  type="button"
                  className="web3-ui__help-trigger web3-ui__help-trigger--icon"
                  aria-label="Reset camera"
                  onClick={onResetCamera}
                >
                  <RefreshIcon />
                </button>
                <button
                  type="button"
                  className="web3-ui__help-trigger web3-ui__help-trigger--icon"
                  aria-label={MOBILE_ZOOM_OUT_LABEL}
                  onClick={onZoomOut}
                >
                  <ZoomOutIcon />
                </button>
                <button
                  type="button"
                  className="web3-ui__help-trigger web3-ui__help-trigger--icon"
                  aria-label={MOBILE_ZOOM_IN_LABEL}
                  onClick={onZoomIn}
                >
                  <ZoomInIcon />
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  title="Cinematic flyover"
                  className={`web3-ui__help-trigger${cinematicFlyoverActive ? ' is-active' : ''}`}
                  aria-label={cinematicFlyoverActive ? 'Restart cinematic flyover' : 'Start cinematic flyover'}
                  aria-pressed={cinematicFlyoverActive}
                  onClick={onCinematicFlyover}
                >
                  <FlyoverIcon />
                  <span>Cinematic Flyover</span>
                </button>

                <div
                  className="web3-ui__help"
                  onMouseEnter={() => handleHelpMouseEnter('mouse')}
                  onMouseLeave={() => handleHelpMouseLeave('mouse')}
                >
                  <button
                    type="button"
                    className="web3-ui__help-trigger web3-ui__help-trigger--icon"
                    aria-label="Show mouse controls"
                    aria-expanded={openPopover === 'mouse'}
                    aria-controls="mouse-controls-popover"
                    onClick={() => handlePopoverToggle('mouse')}
                  >
                    <MouseIcon />
                  </button>
                  {openPopover === 'mouse' ? (
                    <ControlsPopover id="mouse-controls-popover" title="Mouse controls" rows={MOUSE_CONTROLS} />
                  ) : null}
                </div>

                <div
                  className="web3-ui__help"
                  onMouseEnter={() => handleHelpMouseEnter('keyboard')}
                  onMouseLeave={() => handleHelpMouseLeave('keyboard')}
                >
                  <button
                    type="button"
                    className="web3-ui__help-trigger web3-ui__help-trigger--icon"
                    aria-label="Show keyboard controls"
                    aria-expanded={openPopover === 'keyboard'}
                    aria-controls="keyboard-controls-popover"
                    onClick={() => handlePopoverToggle('keyboard')}
                  >
                    <KeyboardIcon />
                  </button>
                  {openPopover === 'keyboard' ? (
                    <ControlsPopover id="keyboard-controls-popover" title="Keyboard controls" rows={KEYBOARD_CONTROLS} />
                  ) : null}
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="web3-ui__corner web3-ui__corner--bottom-right">
        {isMobile ? null : (
          <div className="web3-ui__panel web3-ui__panel--data">
            <p className="web3-ui__eyebrow">{metricPanel.title}</p>
            <div className="web3-ui__metrics">
              {metricPanel.metrics.map((metric) => (
                <div key={metric.label} className="web3-ui__metric">
                  <span className="web3-ui__metric-label">{metric.label}</span>
                  <span className={`web3-ui__metric-value tone-${metric.tone ?? 'default'}`}>{metric.value}</span>
                </div>
              ))}
            </div>
            <p className="web3-ui__microcopy">{metricPanel.microcopy}</p>
          </div>
        )}
      </section>

      {isMobile && mobileNoticeVisible ? (
        <div className="web3-ui__mobile-notice-wrap" role="dialog" aria-modal="false" aria-label="Mobile viewing notice">
          <div className="web3-ui__panel web3-ui__panel--mobile-notice">
            <p className="web3-ui__body web3-ui__body--mobile-notice">
              This experience was designed for desktop viewing. It may not function optimally on mobile devices.
            </p>
            <button
              type="button"
              className="web3-ui__help-trigger web3-ui__mobile-notice-button"
              onClick={handleDismissMobileNotice}
            >
              Continue
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
