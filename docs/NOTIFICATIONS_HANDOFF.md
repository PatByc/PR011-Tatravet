# Browser notifications handoff

Reusable specification based on the Tatravet dashboard as of 21 November 2026. This document separates **shipped behavior** from the **sound addition** requested for a future app. Replace clinic names and event names when reusing it.

## What the user sees

| Channel | Current Tatravet behavior | Needs browser permission? |
| --- | --- | --- |
| In-page alert | Persistent alert for every new, real, completed call. Shows the number of new calls and how many need a callback. Opens the call list or can be dismissed. | No |
| System notification | Optional browser/OS popup for the same event, with generic text such as `Nowe połączenie` and `Wymaga oddzwonienia.` | Yes |
| Browser tab title | `(N) Tatravet · Panel połączeń`, where `N` is new completed calls observed since this panel was opened. | No |
| Sound | **Not implemented in Tatravet.** The proposed opt-in design is below. | No notification permission; browser audio activation is separate |

The alert is for **all** new real calls, including those the AI handled without follow-up. A popup states whether the call needs a callback. Neither popup contains a phone number, transcript, patient name, or summary. Demo and showcase calls do not trigger these alerts.

The tab number is a *new-call counter for this open page*, not the total number of calls today and not the number of unresolved callbacks. It resets when the user opens the call list or reloads the page. Dismissing the in-page alert alone does not clear it. The number is text in `document.title`; it does not put a badge on the browser or Windows taskbar icon. Setting the title is broadly supported. [MDN: `Document.title`](https://developer.mozilla.org/en-US/docs/Web/API/Document/title)

## Event flow

```text
Provider end-of-call report (EOCR)
  → authenticated webhook validates assistant ID and saves the call
  → first report timestamp is stored once
  → PostgreSQL NOTIFY sends a content-free refresh signal
  → authenticated SSE connection tells open dashboard tabs to refresh
  → browser reads /api/notifications and /api/dashboard
  → in-page alert + tab count; optional system popup; proposed sound
```

Staff edits also send the refresh signal, so lists and callback counts update. They do not create a new-call alert because they do not create a new EOCR timestamp. The server sends only `refresh` over SSE; the browser obtains counts and call data from authenticated APIs. PostgreSQL `NOTIFY` is a signal rather than durable event storage, so the database query remains the source of truth. [PostgreSQL: `NOTIFY`](https://www.postgresql.org/docs/current/sql-notify.htm)

### Transport in this app

- The browser opens `EventSource('/api/events')` using its existing login cookie. The route checks the session before opening the stream.
- A single PostgreSQL `LISTEN tatravet_updates` connection per app process fans out refresh signals to connected SSE clients. It reconnects after a database connection loss and requests a fresh snapshot.
- The SSE route sends a heartbeat every 25 seconds and closes after four minutes so the browser reconnects and rechecks its session. The browser also refreshes on SSE open, tab focus, and visibility return.
- There is **no 30-second database polling**. The 25-second SSE heartbeat keeps the connection alive; it is not a dashboard query. Railway documents finite HTTP stream limits and heartbeat support. [Railway networking limits](https://docs.railway.com/networking/public-networking/specs-and-limits)
- `EventSource` automatically attempts to reconnect after a dropped connection. Reconnects must fetch a fresh snapshot because SSE and `NOTIFY` are not durable event queues. [MDN: server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)

For another stack, use its equivalent authenticated one-way stream. WebSockets are only needed if the browser must send live messages back over the same connection. The stream may keep an otherwise idle service awake; evaluate that cost against short polling in the target deployment.

## Detection and deduplication

`GET /api/notifications?after=<encoded JSON cursor>` is session-protected. The relevant response shape is:

```json
{
  "cursor": { "at": "2026-11-21T10:00:00.000Z", "id": "call-id" },
  "newCount": 2,
  "newCallbackCount": 1
}
```

The query counts real calls with a non-null first `reportedAt` that are newer than `(reportedAt, id)`. The ID breaks timestamp ties. `newCount` includes all new reports; `newCallbackCount` counts the subset currently marked for callback. The browser saves the cursor in `localStorage` and only advances it after a successful response. Duplicate EOCR deliveries retain the original `reportedAt`, so they do not announce the same call again.

On the first check after opening the panel, establish a baseline and show **no historical alert**. If the database has no reports yet, use a server-time baseline cursor so the first subsequent report is detectable. A refresh after reconnect or focus checks the cursor again and catches reports received while the stream was unavailable. Coalesce multiple new calls into one alert and one sound.

Current Tatravet `localStorage` keys:

```text
tatravet.notifications.enabled  // optional system popup switch
tatravet.notifications.cursor   // last seen report position
```

The counter and in-page alert are React state, so they do not survive a page reload. The shared `localStorage` cursor usually prevents duplicate popups across open tabs; it also means the tab that advances the cursor can suppress an alert in another open tab. This is not an atomic cross-tab lock, so simultaneous tabs can still race. If every tab must alert independently, use per-tab cursors or a cross-tab coordination design and test it explicitly.

### Browser state update

```text
on authenticated refresh signal, reconnect, or tab focus:
  fetch dashboard snapshot and notification cursor/counts
  if this is the first check: save baseline; stop
  if cursor advanced and newCount > 0:
    add newCount to this page's tab counter
    show or update persistent in-page alert
    if popup switch is on and Notification.permission is granted:
      show one generic system notification for the batch
    if sound switch is on and audio has been activated:
      play one short chime for the batch
    save the new cursor
```

The actual code also guards against overlapping notification fetches. Do not emit an alert just because a staff edit or page reload triggered a fetch; an advancing EOCR cursor is required.

## Browser/OS popup permission

The Settings switch requests `Notification.requestPermission()` **inside its click handler**, and only on HTTPS or another secure context. Browsers decide whether to show a large popup, a quiet icon near the address bar, or no prompt. A page cannot force a permission popup to appear or override a denial. [MDN: Notifications API](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API/Using_the_Notifications_API), [MDN: permission request](https://developer.mozilla.org/en-US/docs/Web/API/Notification/requestPermission_static)

The UI reports `granted`, `denied`, `default`, or unsupported. If the permission promise stays unanswered, Tatravet releases its waiting button after 10 seconds and points the user to site permissions. This timeout does not cancel the browser's decision; after granting permission manually, the user can click the switch again. The app has a test-notification button once enabled.

The switch controls **only the system popup**. In-page alerts and the tab title still work when browser notifications are blocked. A system notification can appear while the page is open in a background tab, subject to browser and OS behavior. This app has no service worker push subscription, so it cannot notify after every dashboard tab is closed. Browser/OS popup sound is controlled by the browser and operating system, not reliably by `new Notification(...)`.

## Sound addition for the next app — not shipped here

Treat sound as a separate, opt-in preference with its own Settings control and preview. Do not assume that enabling system notifications also enables page audio. Browsers may block playback started before the person interacts with the page; create or resume the audio context from the **Enable sound / Play test sound** click. If playback is blocked, keep visual alerts working and show a clear status. [MDN: autoplay guide](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay), [MDN: Web Audio best practices](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices)

Recommended behavior:

1. Default sound to **off**. Store `soundEnabled` per browser; do not store it in the call database.
2. The enable button performs a short test chime in the same user gesture that activates `AudioContext` or an `<audio>` element. Keep an obvious mute/disable control.
3. Play one short, modest-volume chime per **batch of new calls** after the cursor advances. Do not play on first load, duplicate delivery, staff edits, reconnect alone, or historical backfill.
4. Cap frequency if reports arrive rapidly, for example at most one chime within a few seconds. Never put spoken patient information in the sound.
5. On a fresh page load, a saved `soundEnabled=true` is a preference, not proof that playback is unlocked. Try only after activation; if blocked, show `Kliknij, aby włączyć dźwięk` and keep the page usable.
6. Let the user choose whether to use page sound alongside the OS popup sound, since both may otherwise play. A background tab, silent mode, or OS focus mode can still suppress sound.

Minimal implementation sketch (client side, after a user click):

```ts
let audio: AudioContext | null = null;

async function enableSoundFromClick() {
  audio ??= new AudioContext();
  await audio.resume(); // Call directly from the click handler.
  if (audio.state !== "running") throw new Error("Audio blocked");
  playChime(); // Preview confirms that this browser can play it.
}

function playChime() {
  if (!audio || audio.state !== "running") return;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = 660;
  gain.gain.setValueAtTime(0.0001, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.08, audio.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.18);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start();
  oscillator.stop(audio.currentTime + 0.19);
}
```

This sketch does not include React lifecycle cleanup, a cooldown, or preference storage; add those in the target app. A short licensed audio asset is also fine. Test the actual sound in each target browser; a successful system notification does not prove that page audio is unlocked.

## Tab number versus an installed-app badge

The current `(N)` is `document.title`, so it works in an ordinary browser tab. It is independent of notification permission and sound. A Windows taskbar icon badge is a separate enhancement: browsers and operating systems differ, and the Badging API is intended for installed web apps where supported. Do not promise a taskbar badge merely because the tab title shows a number. [MDN: app icon badges](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Display_badge_on_app_icon)

To offer an installed-app badge in a later product, add a web app manifest with a name, start URL, display mode, and suitable icons; serve the site over HTTPS; then test installation from the target Chromium browser's install menu. It remains the same web app and public URL, opened in its own window. Where supported, call `navigator.setAppBadge(count)` when the count changes and `navigator.clearAppBadge()` when it is cleared. Feature-detect both methods and keep the title counter as the fallback. An installed app badge alone does not enable notifications after the app closes; that would require a service worker and Web Push subscription. [MDN: installable PWAs](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable), [MDN: app icon badges](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Display_badge_on_app_icon)

If the next product needs a **true unread count across devices**, define a durable per-user `seenAt` or per-event read state in the database. Tatravet's current counter only tracks new calls observed by one open page.

## Privacy and access rules

- Authenticate the SSE connection and each data endpoint. Keep the provider webhook separately authenticated and allowlist the intended assistant/source.
- Send a generic `refresh` signal over SSE. Fetch details from session-protected APIs after the signal.
- Never put phone numbers, transcripts, names, notes, raw EOCR payloads, or secrets in system notification text, browser tab titles, SSE messages, logs, or local storage.
- Use synthetic fixtures only in an isolated test database or an explicit demo mode. In production, the first snapshot is an empty state or real data.
- Keep staff-owned follow-up statuses/notes stable when provider events are replayed.

## Acceptance checks for a reuse

- First login with old calls: no historical popup, sound, or new-call count. First report after an empty baseline does alert.
- One new completed call: in-page alert appears; `(1)` appears; popup appears only when enabled and granted; one chime plays only after sound opt-in and audio activation.
- Several reports in one refresh: one aggregate popup and chime, correct call and callback counts, Polish plural forms if the product is Polish.
- Duplicate EOCR, staff edit, reconnect, or reload: no duplicate new-call alert. Reconnect still fetches missed reports.
- Browser permission denied: in-page alert and title still work. Audio preference is handled independently.
- Open call list: title count clears. Dismiss alert only: title count remains.
- Two tabs, hidden tab, browser restart, and session expiry: verify the intended cross-tab and re-authentication behavior. The shared cursor generally lets one tab claim an event, but simultaneous tabs can race.
- Confirm that no sensitive call data appears in notification text, SSE frames, browser storage, or server logs.

## Source map in Tatravet

| Concern | File |
| --- | --- |
| Provider webhook and trigger | `app/api/webhooks/vapi/route.ts` |
| Staff edit trigger | `app/api/calls/[id]/route.ts` |
| PostgreSQL fan-out | `lib/realtime.ts` |
| Authenticated SSE route | `app/api/events/route.ts` |
| Cursor/count API | `app/api/notifications/route.ts` |
| Browser popup, in-page alert, tab title, Settings | `components/dashboard.tsx` |
| Alert and Settings styles | `app/globals.css` |
| Browser and API checks | `tests/browser/dashboard.spec.ts` |

When porting this feature, start with the event identity and cursor rule, then wire the authenticated live signal, then add the three visual channels. Add the sound channel last because its activation rules and user preference are independent of notification permission.
