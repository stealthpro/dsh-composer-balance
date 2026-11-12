# dsh-composer-balance

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin that shows the remaining DeepSeek account balance under the message composer, with a click-through details popover and a peak/off-peak pricing badge.

Requires a signed-in DeepSeek account: the plugin reads the balance through the Harness account Remote and renders nothing while signed out.

## What it shows

- **Balance pill** in the composer stats row, next to the activity and usage pills: `¥12.34 · $0.56` and a `PEAK` / `OFF-PEAK` badge.
- **Details popover** on click (Escape or a click outside closes it): each wallet balance, positive bonus credit, when the reading was taken, and the pricing windows in the viewer's local time zone.
- The pill refreshes every five minutes and when the window becomes visible again. A failed refresh keeps the last known numbers instead of blanking the pill; the reading is shared across conversations, so switching sessions does not flash or hide it.

## Install

Published on npm as `@stealthpro/dsh-composer-balance`. In the Harness UI open **Settings → Plugins → Add plugin** and paste the package name:

```sh
dsh plugin add @stealthpro/dsh-composer-balance
```

Add a version if needed (`@stealthpro/dsh-composer-balance@1.1.0`), enable the installed bundle, then restart the app. Reinstalling a bundle requires a restart to load the fresh client module.

You can also install straight from the repository, for development or for a version that is not published yet:

```sh
dsh plugin add git+https://github.com/stealthpro/dsh-composer-balance.git
```

## Updates

A registry install shows a **Versions** section on its bundle page: update from there, or uninstall and install the new version again, then restart the app. A Git install follows the repository, so bump the version, reinstall the bundle, and restart.

## How it works

A bundle package with a `cordis.patch.yml` that inserts one Host row (`composer-balance`, an empty `apply`) and a `dsh.client` module that registers a lazy factory for the browser. The Client half registers a `conversation.composer.dock` occupant and renders the pill, the portaled popover, and a stylesheet using the Harness theme tokens. The accounting schedule lives in `client.js`: `PEAK_WINDOWS_UTC` (two UTC windows, Monday–Friday) and `CN_HOLIDAYS` (Chinese public holidays that bill as off-peak). Extend the holiday list when the State Council publishes a later year's arrangement.

## License

MIT
