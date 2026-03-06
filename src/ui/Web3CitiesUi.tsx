import { useEffect, useMemo, useRef, useState } from 'react';
import type { CityMode } from '../lib/cityMode';
import type { UiMetricPanel } from './cityMetrics';
import web3CitiesLogoUrl from '../../dawidskinder_web3cities_logo_v1.svg';
import dawidPhotoUrl from '../../ds_photo.png';

type HelpKey = 'mouse' | 'keyboard' | null;
const MOBILE_BREAKPOINT_PX = 640;

const MODE_COPY: Record<
  CityMode,
  {
    title: string;
    description: string;
  }
> = {
  btc: {
    title: 'BTC City',
    description:
      'A living city generated from live Bitcoin spot buy activity, where each building reflects market demand as it happens.'
  },
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

function HamburgerIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="web3-ui__glyph">
      <line x1="5" y1="7" x2="19" y2="7" />
      <line x1="5" y1="12" x2="19" y2="12" />
      <line x1="5" y1="17" x2="19" y2="17" />
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

export function Web3CitiesUi({
  mode,
  onModeChange,
  metricPanel
}: {
  mode: CityMode;
  onModeChange?: (nextMode: CityMode) => void;
  metricPanel: UiMetricPanel;
}) {
  const [hoverPopover, setHoverPopover] = useState<HelpKey>(null);
  const [pinnedPopover, setPinnedPopover] = useState<HelpKey>(null);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`).matches : false
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileNoticeVisible, setMobileNoticeVisible] = useState(false);
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);
  const hasShownMobileNoticeRef = useRef(false);
  const modeCopy = MODE_COPY[mode];

  useEffect(() => {
    setHoverPopover(null);
    setPinnedPopover(null);
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
      setMobileNoticeVisible(true);
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

  const currentUrl = typeof window !== 'undefined' ? window.location.href : 'https://www.dawidskinder.pl';
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

  return (
    <div className="web3-ui" aria-live="polite">
      <section className="web3-ui__corner web3-ui__corner--top-left">
        {isMobile ? (
          <div className="web3-ui__panel web3-ui__panel--mobile-logo">
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

                <div className="web3-ui__tabs" role="tablist" aria-label="City modes">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === 'top200'}
                    className={`web3-ui__tab${mode === 'top200' ? ' is-active' : ''}`}
                    onClick={() => onModeChange?.('top200')}
                  >
                    Market City
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === 'btc'}
                    className={`web3-ui__tab${mode === 'btc' ? ' is-active' : ''}`}
                    onClick={() => onModeChange?.('btc')}
                  >
                    BTC City
                  </button>
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
            ) : null}
          </div>
        ) : (
          <div className="web3-ui__panel web3-ui__panel--actions">
            <div className="web3-ui__tabs" role="tablist" aria-label="City modes">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'top200'}
                className={`web3-ui__tab${mode === 'top200' ? ' is-active' : ''}`}
                onClick={() => onModeChange?.('top200')}
              >
                Market City
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'btc'}
                className={`web3-ui__tab${mode === 'btc' ? ' is-active' : ''}`}
                onClick={() => onModeChange?.('btc')}
              >
                BTC City
              </button>
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
        )}
      </section>

      <section className="web3-ui__corner web3-ui__corner--bottom-left">
        <div className="web3-ui__panel web3-ui__panel--mode">
          <p className="web3-ui__eyebrow">Current world</p>
          <h2 className="web3-ui__section-title">{modeCopy.title}</h2>
          <p className="web3-ui__body web3-ui__body--compact">{modeCopy.description}</p>

          <div ref={controlsRef} className="web3-ui__controls" aria-label="Controls help">
            <div
              className="web3-ui__help"
              onMouseEnter={() => handleHelpMouseEnter('mouse')}
              onMouseLeave={() => handleHelpMouseLeave('mouse')}
            >
              <button
                type="button"
                className="web3-ui__help-trigger"
                aria-label="Show mouse controls"
                aria-expanded={openPopover === 'mouse'}
                aria-controls="mouse-controls-popover"
                onClick={() => handlePopoverToggle('mouse')}
              >
                <MouseIcon />
                <span>Mouse</span>
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
                className="web3-ui__help-trigger"
                aria-label="Show keyboard controls"
                aria-expanded={openPopover === 'keyboard'}
                aria-controls="keyboard-controls-popover"
                onClick={() => handlePopoverToggle('keyboard')}
              >
                <KeyboardIcon />
                <span>Keyboard</span>
              </button>
              {openPopover === 'keyboard' ? (
                <ControlsPopover id="keyboard-controls-popover" title="Keyboard controls" rows={KEYBOARD_CONTROLS} />
              ) : null}
            </div>
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
              onClick={() => setMobileNoticeVisible(false)}
            >
              Continue
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
