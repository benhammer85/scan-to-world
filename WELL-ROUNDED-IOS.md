# Well Rounded, on an iPhone

Well Rounded has an iPhone shell of its own, apart from Warm to the Touch's: the Capacitor project is
`apps/well-rounded/` (its Xcode project in `apps/well-rounded/ios/`). The daily practice is built into
`dist-rings` and copied into the app.

## Run it on your phone

You need a Mac with Xcode, Node 22+, your iPhone, and an Apple ID signed into Xcode (Settings → Accounts).

```sh
npm install
npm run ios:rings     # builds Well Rounded, copies it into the app, and opens Xcode
```

In Xcode: click **App** (blue icon) → the **App** target → **Signing & Capabilities**, tick
**Automatically manage signing**, choose your **Team**, pick your iPhone at the top, and press **▶ Run**.
(The first time, trust your Apple ID on the phone: Settings → General → VPN & Device Management.)

## Identity

* **Name:** Well Rounded (`appName` in `apps/well-rounded/capacitor.config.ts`; under the icon,
  `CFBundleDisplayName` in `Info.plist`).
* **Bundle Identifier:** `app.wellrounded`. Change it freely until the app's record exists in App Store
  Connect (in Xcode and in `capacitor.config.ts`, to match); after that it can never change.
* **Icon:** a pine slice, pressed by the app itself, `AppIcon.appiconset/AppIcon-512@2x.png`, 1024 × 1024,
  no transparency. **Launch screen:** the paper's own colour.
* **Permissions:** location only, and only when "bring your weather" is touched in the grove
  (`NSLocationWhenInUseUsageDescription`). Portrait only; no status bar.

## The web version

`npm run build:rings` builds the site into `dist-rings`, with its own manifest (installable to the home
screen), an offline copy (`sw.js`), and its privacy and support pages (from `rings-public/`).
`scripts/publish-pages.sh` and Netlify publish that folder. The page's trying-out options (`?demo`,
`?grove`, `?fresh`, `?weather`…) and the `window.press` look-in work only in development (`npm run dev`).

## For the App Store

* Privacy policy URL: `<site>/privacy/` · Support URL: `<site>/support/` (add a contact address to the
  support page first).
* App Privacy: *Data Not Collected*, except **Coarse Location**, used for app functionality only, not
  linked to the user, not used for tracking (sent to Open-Meteo only when the person turns weather on).

## Check on a phone (what can't be checked in a browser on a computer)

Run it on an iPhone (the app, and the site added to the home screen) and look for:

1. **Drawing:** draw a ring slowly, then several quickly. The loop dries away, the year glides out, nothing jumps; the slice never runs past its room and settles back slowly once you stop.
2. **A full year's tree:** open a tree of a few hundred rings (or the site with `npm run dev` and `?demo=365` on the same network). Pinch in and out: smooth, never stalling; no glistening as it steps back.
3. **Haptics:** a faint touch as a ring settles (the app only).
4. **Keep a copy:** in the grove, "keep a copy" opens the share sheet; save to Files. "take one back" with that file restores it (after a confirm).
5. **The print:** hold the slice a moment; "keep this print" opens the share sheet with the picture.
6. **Weather:** "bring your weather" asks for location once; the grove takes on the weather; touching "your weather" turns it off.
7. **Offline (the site):** add it to the home screen, open it once, turn on Airplane Mode, open it again.
8. **VoiceOver and Reduce Motion:** with VoiceOver on, the words and the grove's three buttons are read; with Reduce Motion on, nothing drifts or falls.
9. **The year's end:** set the phone's date a year past the first ring, open it: the tree stands in the grove, and a new one is offered. (Set the date back after.)
