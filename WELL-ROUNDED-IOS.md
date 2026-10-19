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
