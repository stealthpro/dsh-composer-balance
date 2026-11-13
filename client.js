window.__ModuleLoader__.load({
  id: '@stealthpro/dsh-composer-balance',
  factory(require) {
    const React = require('react');
    const ReactDOM = require('react-dom');
    const h = React.createElement;

    const NS = 'composer.balance';
    const STAT_ID = 'account-balance';
    /** Idle polling cadence while the page is visible. */
    const IDLE_REFRESH_MS = 30 * 1000;
    /** Faster cadence while a turn runs, because each request bills as it settles. */
    const ACTIVE_REFRESH_MS = 10 * 1000;
    /** Concurrent mounts, focus events, and turn settlements coalesce into one read. */
    const MIN_READ_GAP_MS = 5 * 1000;
    /** With no reading yet, a retry may follow quickly after a failure. */
    const RETRY_GAP_MS = 5 * 1000;
    /** A finished turn posts its charge just after the final chunk. */
    const SETTLE_DELAY_MS = 2000;
    /** Viewport margin the placement clamp keeps. */
    const PANEL_MARGIN = 12;
    /** Distance between the trigger's top edge and the panel's bottom. */
    const PANEL_GAP = 8;
    const MEASURE_STYLE = { visibility: 'hidden', left: 0, top: 0 };

    /**
     * DeepSeek charges peak rates in two UTC windows, Monday through Friday:
     * 01:00–04:00 and 06:00–10:00. Every other hour is off-peak.
     */
    const PEAK_WINDOWS_UTC = [
      [60, 240],
      [360, 600],
    ];
    /**
     * Chinese public holidays bill as off-peak in full. Dates are Asia/Shanghai
     * calendar days from the State Council notices for 2026 and 2027; extend the
     * list when a later year's arrangement is published.
     */
    const CN_HOLIDAYS = new Set([
      // 2026
      '2026-01-01', '2026-01-02', '2026-01-03',
      '2026-02-15', '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19',
      '2026-02-20', '2026-02-21', '2026-02-22', '2026-02-23',
      '2026-04-04', '2026-04-05', '2026-04-06',
      '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05',
      '2026-06-19', '2026-06-20', '2026-06-21',
      '2026-09-25', '2026-09-26', '2026-09-27',
      '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05',
      '2026-10-06', '2026-10-07',
      // 2027
      '2027-01-01', '2027-01-02', '2027-01-03',
      '2027-02-05', '2027-02-06', '2027-02-07', '2027-02-08', '2027-02-09',
      '2027-02-10', '2027-02-11', '2027-02-12', '2027-02-13',
      '2027-04-03', '2027-04-04', '2027-04-05',
      '2027-05-01', '2027-05-02', '2027-05-03', '2027-05-04', '2027-05-05',
      '2027-06-09',
      '2027-09-15',
      '2027-10-01', '2027-10-02', '2027-10-03', '2027-10-04', '2027-10-05',
      '2027-10-06', '2027-10-07',
    ]);
    /** How often the PEAK/OFF-PEAK badge re-evaluates the schedule. */
    const CLOCK_MS = 30 * 1000;

    const DICTS = {
      en: {
        reading: 'Balance {amounts}',
        tooltip: 'Remaining balance: {amounts}',
        title: 'Balance',
        bonus: 'Bonus credit',
        updated: 'Updated',
        peak: 'PEAK',
        offPeak: 'OFF-PEAK',
        offPeakValue: 'all other time',
        weekdays: 'Mon–Fri (UTC)',
        note: '{weekdays}, local time ({zone}). Weekends and Chinese public holidays are off-peak.',
      },
      ru: {
        reading: 'Баланс {amounts}',
        tooltip: 'Остаток средств: {amounts}',
        title: 'Баланс',
        bonus: 'Бонусные средства',
        updated: 'Обновлено',
        peak: 'PEAK',
        offPeak: 'OFF-PEAK',
        offPeakValue: 'всё остальное время',
        weekdays: 'Пн–Пт (UTC)',
        note: '{weekdays}, время местное ({zone}). Выходные и праздники КНР — OFF-PEAK.',
      },
      zh: {
        reading: '余额 {amounts}',
        tooltip: '账户余额：{amounts}',
        title: '余额',
        bonus: '赠送余额',
        updated: '更新时间',
        peak: 'PEAK',
        offPeak: 'OFF-PEAK',
        offPeakValue: '其余时间',
        weekdays: '周一至周五（UTC）',
        note: '{weekdays}，本地时间（{zone}）。周末及中国法定节假日为 OFF-PEAK。',
      },
    };

    const CURRENCY_SYMBOLS = { CNY: '¥', USD: '$' };

    const CSS = [
      '.dsb-anchor{min-width:0;font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));display:inline-flex}',
      '.dsb-pill{box-sizing:border-box;border-radius:var(--dsw-radius-sm);max-width:100%;color:var(--dsw-alias-label-tertiary);font:inherit;font-variant-numeric:tabular-nums;line-height:inherit;white-space:nowrap;background:0 0;border:none;align-items:center;gap:6px;padding:1px 8px;display:inline-flex}',
      '.dsb-pill svg{flex:none;width:14px;height:14px}',
      'button.dsb-pill{cursor:pointer}',
      'button.dsb-pill[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}',
      '@media (hover:hover){button.dsb-pill:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}}',
      'button.dsb-pill:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));outline-offset:1px}',
      '.dsb-label{text-overflow:ellipsis;min-width:0;overflow:hidden}',
      '.dsb-panel{z-index:1100;box-sizing:border-box;width:max-content;min-width:min(300px, calc(100vw - 24px), var(--dsh-anchored-max-width,100vw));max-width:min(440px, calc(100vw - 24px), var(--dsh-anchored-max-width,100vw));border-radius:var(--dsw-radius-lg);background:var(--dsw-specific-menu);backdrop-filter:var(--dsw-menu-backdrop-filter);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-secondary);cursor:default;max-height:var(--dsh-anchored-max-height,none);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);border:0;padding:16px;font-size:12px;line-height:18px;position:fixed;overflow:hidden auto}',
      '.dsb-title{color:var(--dsw-alias-label-primary);justify-content:space-between;gap:16px;margin-bottom:8px;font-weight:500;display:flex}',
      '.dsb-titleRule{border-top:.5px solid var(--dsw-alias-border-l2);margin-bottom:10px}',
      '.dsb-titleValue{font-variant-numeric:tabular-nums}',
      '.dsb-titleLabel{align-items:center;gap:6px;min-width:0;display:inline-flex}',
      '.dsb-titleLabel svg{flex:none;width:14px;height:14px}',
      '.dsb-details{color:var(--dsw-alias-label-tertiary);grid-template-columns:minmax(76px,auto) minmax(0,1fr);gap:6px 16px;margin:0;display:grid}',
      '.dsb-details dt,.dsb-details dd{min-width:0;margin:0}',
      '.dsb-details dd{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;text-align:right}',
      '.dsb-peak{box-sizing:border-box;flex:none;display:inline-flex;align-items:center;gap:4px;padding:0 5px;border-radius:4px;font-size:10px;font-weight:600;line-height:15px;letter-spacing:.04em;white-space:nowrap;background:transparent;background:color-mix(in srgb, currentColor 12%, transparent)}',
      '.dsb-peak:before{content:"";flex:none;width:5px;height:5px;border-radius:50%;background:currentColor}',
      '.dsb-peak--off{color:var(--dsw-alias-state-success-primary)}',
      '.dsb-peak--peak{color:var(--dsw-alias-state-error-primary)}',
      '.dsb-titleRule--spaced{margin-top:12px}',
      '.dsb-window{display:inline-flex;align-items:center;gap:6px}',
      '.dsb-dot{flex:none;width:6px;height:6px;border-radius:50%;display:inline-block}',
      '.dsb-dot--off{background:var(--dsw-alias-state-success-primary)}',
      '.dsb-dot--peak{background:var(--dsw-alias-state-error-primary)}',
      '.dsb-window--off{color:var(--dsw-alias-state-success-primary)}',
      '.dsb-window--peak{color:var(--dsw-alias-state-error-primary)}',
      '.dsb-note{color:var(--dsw-alias-label-tertiary);margin:8px 0 0;font-size:11px;line-height:16px}',
    ].join('');

    /** Platform-style money text: grouped, two decimals, sub-cent positive amounts shown as <0.01. */
    function formatAmount(raw) {
      const value = Number(raw);
      if (!Number.isFinite(value)) return String(raw);
      if (value > 0 && value < 0.01) return '<0.01';
      const cents = value > 0 ? Math.floor(value * 100) / 100 : Math.round(value * 100) / 100;
      return cents.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function money(wallet) {
      return `${CURRENCY_SYMBOLS[wallet.currency] ?? `${wallet.currency} `}${formatAmount(wallet.balance)}`;
    }

    function walletText(wallets) {
      return wallets.map(money).join(' · ');
    }

    function readClientVersion() {
      const boot = globalThis.__DSH_BOOT__;
      const version = boot && (boot.clientVersion || boot.version);
      return typeof version === 'string' && version.length > 0 ? version : '0.0.0';
    }

    function walletIcon() {
      return h(
        'svg',
        { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, 'aria-hidden': true },
        h('path', {
          d: 'M4.5 7.5A2.5 2.5 0 0 1 7 5h9.5A2.5 2.5 0 0 1 19 7.5v9a2.5 2.5 0 0 1-2.5 2.5H7a2.5 2.5 0 0 1-2.5-2.5v-9Z',
          strokeLinejoin: 'round',
        }),
        h('path', { d: 'M4.5 9.5h14.5', strokeLinecap: 'round' }),
        h('circle', { cx: 15.75, cy: 14, r: 1, fill: 'currentColor', stroke: 'none' }),
      );
    }

    const CN_DATE = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    /** The Asia/Shanghai calendar day, which decides whether a holiday bills off-peak. */
    function cnDateKey(date) {
      const parts = CN_DATE.formatToParts(date);
      let year = '';
      let month = '';
      let day = '';
      for (const part of parts) {
        if (part.type === 'year') year = part.value;
        else if (part.type === 'month') month = part.value;
        else if (part.type === 'day') day = part.value;
      }
      return `${year}-${month}-${day}`;
    }

    /** Peak pricing applies inside the two UTC windows on non-holiday weekdays. */
    function isPeakNow(date) {
      if (CN_HOLIDAYS.has(cnDateKey(date))) return false;
      const weekday = date.getUTCDay();
      if (weekday === 0 || weekday === 6) return false;
      const minutes = date.getUTCHours() * 60 + date.getUTCMinutes();
      return PEAK_WINDOWS_UTC.some(([start, end]) => minutes >= start && minutes < end);
    }

    /** Render one UTC window in the viewer's current time zone. */
    function localClock(date, utcMinutes) {
      const base = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
      const local = new Date(base + utcMinutes * 60 * 1000);
      const hours = String(local.getHours()).padStart(2, '0');
      const minutes = String(local.getMinutes()).padStart(2, '0');
      return `${hours}:${minutes}`;
    }

    function peakWindowText(date) {
      return PEAK_WINDOWS_UTC.map(
        ([start, end]) => `${localClock(date, start)}–${localClock(date, end)}`,
      ).join(', ');
    }

    function localMinuteOfDay(date, utcMinutes) {
      const base = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
      const local = new Date(base + utcMinutes * 60 * 1000);
      return local.getHours() * 60 + local.getMinutes();
    }

    function minuteText(minute) {
      const value = minute % 1440;
      return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
    }

    /** The weekday hours outside the peak windows, in the viewer's time zone. */
    function offPeakWindowText(date) {
      const windows = PEAK_WINDOWS_UTC
        .map(([start, end]) => [localMinuteOfDay(date, start), localMinuteOfDay(date, end)])
        .sort((a, b) => a[0] - b[0]);
      if (windows.some(([start, end]) => end <= start)) return null;
      const gaps = [];
      let cursor = 0;
      for (const [start, end] of windows) {
        if (start > cursor) gaps.push([cursor, start]);
        cursor = Math.max(cursor, end);
      }
      if (cursor < 1440) gaps.push([cursor, 1440]);
      return gaps.map(([start, end]) => `${minuteText(start)}–${minuteText(end)}`).join(', ');
    }

    function currentZone() {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      } catch {
        return 'UTC';
      }
    }

    /** Re-render on a fixed cadence so the badge flips at a window's edge. */
    function useClock() {
      const [now, setNow] = React.useState(() => Date.now());
      React.useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), CLOCK_MS);
        return () => clearInterval(timer);
      }, []);
      return now;
    }

    /**
     * Whether the Session behind this dock entry is running a turn. The Host
     * bills a request as it completes, so the pill re-reads when a turn settles.
     */
    function useSessionRunning(ctx, sessionId) {
      const [running, setRunning] = React.useState(false);
      React.useEffect(() => {
        if (typeof sessionId !== 'string' || sessionId.length === 0) return;
        let disposed = false;
        let timer = null;
        let session = null;
        let unsubscribe = null;
        const sync = () => {
          try {
            setRunning(session !== null && session.getSnapshot().running === true);
          } catch {
            setRunning(false);
          }
        };
        // The binding may not be retained yet on the first render; keep looking.
        const attach = () => {
          if (disposed || session !== null) return;
          timer = null;
          try {
            session = ctx.get('sessions')?.binding(sessionId)?.session ?? null;
          } catch {
            session = null;
          }
          if (session === null) {
            timer = setTimeout(attach, 2000);
            return;
          }
          sync();
          try {
            unsubscribe = session.subscribe(sync) ?? null;
          } catch {
            unsubscribe = null;
          }
        };
        attach();
        return () => {
          disposed = true;
          if (timer !== null) clearTimeout(timer);
          if (typeof unsubscribe === 'function') unsubscribe();
        };
      }, [sessionId]);
      return running;
    }

    /**
     * One balance reading shared by every mounted composer dock: switching
     * Sessions shows the last known numbers immediately instead of re-reading,
     * and a failed refresh keeps them instead of blanking the pill.
     */
    const balanceStore = (() => {
      const listeners = new Set();
      let state = { status: 'pending' };
      let lastAttempt = 0;
      let inFlight = null;

      const publish = (next) => {
        state = next;
        for (const listener of [...listeners]) {
          try {
            listener();
          } catch {
            /* a dead subscriber must not block the rest */
          }
        }
      };

      const subscribe = (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      };

      const getSnapshot = () => state;

      const read = async (ctx) => {
        try {
          const result = await ctx.remote.account.getBalance({
            version: readClientVersion(),
            locale: ctx.locale.getSnapshot().active,
            timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
          });
          if (!result || !result.ok) return; // transient failure: keep the last good reading
          const balance = result.value;
          if (balance === null) {
            // Signed out: nothing to show and no stale balance to keep.
            publish({ status: 'unavailable' });
            return;
          }
          if (balance.status !== 'ready') return; // keep the last good reading
          const wallets = Array.isArray(balance.value) ? balance.value : [];
          const bonusWallets = (Array.isArray(balance.bonusWallets) ? balance.bonusWallets : []).filter(
            (wallet) => Number(wallet.balance) > 0,
          );
          const primary = wallets.length > 0 ? wallets : bonusWallets;
          if (primary.length === 0) {
            publish({ status: 'unavailable' });
            return;
          }
          publish({
            status: 'ready',
            wallets: primary,
            bonus: wallets.length > 0 ? bonusWallets : [],
            updatedAt: Date.now(),
          });
        } catch {
          // Transient failure: keep whatever was last shown; hide only when nothing is known.
          if (state.status !== 'ready') publish({ status: 'unavailable' });
        }
      };

      const refresh = (ctx, force = false) => {
        if (inFlight !== null) return inFlight;
        const gap = state.status === 'ready' ? MIN_READ_GAP_MS : RETRY_GAP_MS;
        if (!force && Date.now() - lastAttempt < gap) return Promise.resolve();
        lastAttempt = Date.now();
        const request = read(ctx);
        inFlight = request;
        request.finally(() => {
          if (inFlight === request) inFlight = null;
        });
        return request;
      };

      return { subscribe, getSnapshot, refresh };
    })();

    function useBalance(ctx, running) {
      const state = React.useSyncExternalStore(
        balanceStore.subscribe,
        balanceStore.getSnapshot,
        balanceStore.getSnapshot,
      );
      React.useEffect(() => {
        let disposed = false;
        let timer = null;
        const schedule = () => {
          if (disposed) return;
          timer = setTimeout(() => {
            timer = null;
            if (document.visibilityState !== 'hidden') balanceStore.refresh(ctx);
            schedule();
          }, running ? ACTIVE_REFRESH_MS : IDLE_REFRESH_MS);
        };
        if (document.visibilityState !== 'hidden') balanceStore.refresh(ctx);
        schedule();
        const onVisible = () => {
          if (document.visibilityState === 'visible') balanceStore.refresh(ctx);
        };
        window.addEventListener('focus', onVisible);
        document.addEventListener('visibilitychange', onVisible);
        return () => {
          disposed = true;
          if (timer !== null) clearTimeout(timer);
          window.removeEventListener('focus', onVisible);
          document.removeEventListener('visibilitychange', onVisible);
        };
      }, [running]);

      // A settled turn books its charge right after the last chunk; the second
      // read catches accounting that lands a few seconds later.
      const previous = React.useRef(running);
      React.useEffect(() => {
        const was = previous.current;
        previous.current = running;
        if (!was || running) return;
        const timers = [
          setTimeout(() => balanceStore.refresh(ctx, true), SETTLE_DELAY_MS),
          setTimeout(() => balanceStore.refresh(ctx, true), SETTLE_DELAY_MS * 4),
        ];
        return () => {
          for (const timer of timers) clearTimeout(timer);
        };
      }, [running]);

      return state;
    }

    /**
     * Trigger-anchored popover: opens above the pill, clamped to the viewport,
     * and closes on Escape or a pointer press outside trigger and panel.
     */
    function useBalanceDialog() {
      const [open, setOpen] = React.useState(false);
      const [pos, setPos] = React.useState(null);
      const rootRef = React.useRef(null);
      const panelRef = React.useRef(null);

      React.useLayoutEffect(() => {
        if (!open) {
          setPos(null);
          return;
        }
        const place = () => {
          const anchor = rootRef.current;
          const panel = panelRef.current;
          if (!anchor || !panel) return;
          const a = anchor.getBoundingClientRect();
          const p = panel.getBoundingClientRect();
          const left = Math.max(
            PANEL_MARGIN,
            Math.min(a.left + a.width / 2 - p.width / 2, window.innerWidth - PANEL_MARGIN - p.width),
          );
          let top = a.top - PANEL_GAP - p.height;
          if (top < PANEL_MARGIN) top = a.bottom + PANEL_GAP;
          top = Math.max(PANEL_MARGIN, Math.min(top, window.innerHeight - PANEL_MARGIN - p.height));
          setPos({ left, top });
        };
        place();
        window.addEventListener('resize', place);
        document.addEventListener('scroll', place, true);
        let observer;
        if (typeof ResizeObserver !== 'undefined' && panelRef.current !== null) {
          observer = new ResizeObserver(place);
          observer.observe(panelRef.current);
        }
        return () => {
          window.removeEventListener('resize', place);
          document.removeEventListener('scroll', place, true);
          observer?.disconnect();
        };
      }, [open]);

      React.useEffect(() => {
        if (!open) return;
        const inside = (target) =>
          target instanceof Node &&
          (rootRef.current?.contains(target) === true || panelRef.current?.contains(target) === true);
        const onKeyDown = (event) => {
          if (event.key === 'Escape') setOpen(false);
        };
        const onPointerDown = (event) => {
          if (!inside(event.target)) setOpen(false);
        };
        const onClick = (event) => {
          if (!inside(event.target)) setOpen(false);
        };
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('click', onClick, true);
        return () => {
          document.removeEventListener('keydown', onKeyDown);
          document.removeEventListener('pointerdown', onPointerDown, true);
          document.removeEventListener('click', onClick, true);
        };
      }, [open]);

      return { open, setOpen, rootRef, panelRef, pos };
    }

    function makeBalancePill(ctx) {
      const t = ctx.locale.bind(NS);
      const subscribe = (listener) => ctx.locale.subscribe(listener);
      const getLocaleSnapshot = () => ctx.locale.getSnapshot();

      return function BalancePill(props) {
        React.useSyncExternalStore(subscribe, getLocaleSnapshot, getLocaleSnapshot);
        const running = useSessionRunning(ctx, props?.sessionId);
        const state = useBalance(ctx, running);
        const dialog = useBalanceDialog();
        const now = useClock();
        if (state.status !== 'ready') return null;

        const amounts = walletText(state.wallets);
        const nowDate = new Date(now);
        const peak = isPeakNow(nowDate);
        const statusLabel = peak ? t('peak') : t('offPeak');
        const statusClass = peak ? 'dsb-peak--peak' : 'dsb-peak--off';
        const tooltip = `${t('tooltip', { amounts })} · ${statusLabel}`;
        const time = new Date(state.updatedAt).toLocaleTimeString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
        });

        const rows = [];
        for (const wallet of state.wallets) {
          rows.push(h('dt', { key: `funds-${wallet.currency}` }, wallet.currency));
          rows.push(h('dd', { key: `funds-${wallet.currency}-value` }, money(wallet)));
        }
        for (const wallet of state.bonus) {
          rows.push(h('dt', { key: `bonus-${wallet.currency}` }, `${t('bonus')} (${wallet.currency})`));
          rows.push(h('dd', { key: `bonus-${wallet.currency}-value` }, money(wallet)));
        }
        rows.push(h('dt', { key: 'updated' }, t('updated')));
        rows.push(h('dd', { key: 'updated-value' }, time));

        const panel = dialog.open
          ? ReactDOM.createPortal(
              h(
                'div',
                {
                  ref: dialog.panelRef,
                  className: 'dsb-panel',
                  role: 'dialog',
                  'aria-label': t('title'),
                  style: dialog.pos ?? MEASURE_STYLE,
                },
                h(
                  'div',
                  { className: 'dsb-title' },
                  h('span', { className: 'dsb-titleLabel' }, walletIcon(), t('title')),
                  h('span', { className: 'dsb-titleValue' }, amounts),
                ),
                h('div', { className: 'dsb-titleRule', 'aria-hidden': true }),
                h('dl', { className: 'dsb-details' }, rows),
                h('div', { className: 'dsb-titleRule dsb-titleRule--spaced', 'aria-hidden': true }),
                h(
                  'dl',
                  { className: 'dsb-details' },
                  h(
                    'dt',
                    { key: 'peak' },
                    h(
                      'span',
                      { className: 'dsb-window dsb-window--peak' },
                      h('span', { className: 'dsb-dot dsb-dot--peak' }),
                      t('peak'),
                    ),
                  ),
                  h('dd', { key: 'peak-range' }, peakWindowText(nowDate)),
                  h(
                    'dt',
                    { key: 'off-peak' },
                    h(
                      'span',
                      { className: 'dsb-window dsb-window--off' },
                      h('span', { className: 'dsb-dot dsb-dot--off' }),
                      t('offPeak'),
                    ),
                  ),
                  h('dd', { key: 'off-peak-value' }, offPeakWindowText(nowDate) ?? t('offPeakValue')),
                ),
                h(
                  'p',
                  { className: 'dsb-note' },
                  t('note', { weekdays: t('weekdays'), zone: currentZone() }),
                ),
              ),
              document.body,
            )
          : null;

        return h(
          'span',
          { ref: dialog.rootRef, className: 'dsb-anchor', 'data-composer-stat': STAT_ID },
          h(
            'button',
            {
              type: 'button',
              className: 'dsb-pill',
              title: dialog.open ? undefined : tooltip,
              'aria-label': tooltip,
              'aria-haspopup': 'dialog',
              'aria-expanded': dialog.open,
              onClick: () => {
                const next = !dialog.open;
                dialog.setOpen(next);
                if (next) balanceStore.refresh(ctx, true);
              },
            },
            walletIcon(),
            h('span', { className: 'dsb-label' }, t('reading', { amounts })),
            h('span', { className: `dsb-peak ${statusClass}` }, statusLabel),
          ),
          panel,
        );
      };
    }

    return {
      inject: ['slots', 'locale', 'remote', 'remote.account'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICTS), 'composer-balance: dictionaries');
        ctx.effect(() => {
          const tag = document.createElement('style');
          tag.dataset.plugin = '@stealthpro/dsh-composer-balance';
          tag.dataset.pluginCss = '@stealthpro/dsh-composer-balance/client.css';
          tag.textContent = CSS;
          document.head.appendChild(tag);
          return () => tag.remove();
        }, 'composer-balance: styles');
        ctx.slots.inject('conversation.composer.dock', () =>
          ctx.slots.register(
            { name: 'conversation.composer.dock', id: STAT_ID, order: 2 },
            makeBalancePill(ctx),
          ),
        );
      },
    };
  },
});
