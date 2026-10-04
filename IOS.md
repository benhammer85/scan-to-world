# Warm to the Touch, on an iPhone

The game is wrapped as a native iOS app with [Capacitor](https://capacitorjs.com): the web game
runs full-screen in the app, and plays on the phone's own haptics and share sheet (`src/volcano/native.ts`).
The Xcode project is in `ios/`. Everything here costs nothing but the Apple Developer Program
($99 a year), and that only once you want TestFlight or the App Store.

## What you need

* A Mac with **Xcode** (free, from the Mac App Store; open it once to let it install its parts).
* **Node.js** 22 or later (`node -v`; from nodejs.org if it's missing).
* Your iPhone and its cable.
* An **Apple ID** signed into Xcode (Xcode → Settings → Accounts). A free one is enough to run the
  game on your own phone; the paid Developer Program is needed for TestFlight and the App Store.

## Run it on your phone (the first time)

```sh
git clone https://github.com/benhammer85/scan-to-world.git
cd scan-to-world
npm install
npm run ios          # builds the game, copies it into the app, and opens Xcode
```

In Xcode:

1. In the left column click **App** (the blue icon at the top), then the **App** target, then
   **Signing & Capabilities**.
2. Tick **Automatically manage signing**, and choose your **Team** (your Apple ID).
3. The **Bundle Identifier** is `app.warmtothetouch`. If it's taken, or you'd rather use a domain
   you own (`com.yourname.warmtothetouch`), change it here and in `capacitor.config.ts`.
4. Plug in your iPhone and pick it at the top of the window, where it says *Any iOS Device*.
5. Press **▶ Run**. The first time, the phone will refuse to open an app from an unknown developer:
   on the phone go to **Settings → General → VPN & Device Management**, trust your Apple ID, and run
   again. The phone may also ask to turn on **Developer Mode** (Settings → Privacy & Security).
6. When the game asks to use motion, allow it: that's the tilt.

## After changing the game

```sh
npm run ios
```

then **▶ Run** again in Xcode. (Or `npm run build:app && npx cap sync ios` if Xcode is already open.)

## Naming

* The app is **Warm to the Touch** (`appName` in `capacitor.config.ts`); under its icon it's
  **Warm** (`CFBundleDisplayName` in `Info.plist`; the full name would be cut off). On the App Store:
  name *Warm to the Touch*, subtitle *Atlas of Unfinished Worlds*.
* The **Bundle Identifier** is the app's permanent id. Change it freely until you make the app's
  record in App Store Connect; after that it can never change. Set it in Xcode, and set `appId` in
  `capacitor.config.ts` to match.

## Icon and launch screen

* **Icon:** the Moon, as the game draws it in the quiet print, on night blue (`#1b2333`), rendered
  by the game itself. `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` is
  1024 × 1024 with no transparency (the App Store refuses an icon with an alpha channel); iOS rounds
  the corners itself. The web page's own icons are `public/warm-180.png` and `public/warm-64.png`.
* **Launch screen:** plain paper (`#f4efe4`), drawn by `ios/App/App/Base.lproj/LaunchScreen.storyboard`
  with no image, so it fits every phone; the game fades in from the paper.

## TestFlight (friends play it before release)

Needs the paid Developer Program.

1. In [App Store Connect](https://appstoreconnect.apple.com) → **Apps → +**, make the app with your
   final name and Bundle Identifier.
2. In Xcode, choose **Any iOS Device (arm64)** at the top, then **Product → Archive**.
3. When the Organizer opens, **Distribute App → App Store Connect → Upload**.
4. After processing (10–30 minutes), add testers under **TestFlight** in App Store Connect. They
   install the **TestFlight** app and get an invitation.

## The App Store

In App Store Connect, on the app's page:

* **Screenshots:** still to make, at the 6.9" iPhone size (1320 × 2868): a panorama joined across
  the screens, about a world growing quietly. (The first six in `appstore/screenshots/` were set aside.)
* **Description, keywords, support URL, privacy policy URL.**
* **App Privacy:** *Data Not Collected* (the game keeps everything on the phone).
* **Age rating:** answer the questionnaire; it comes out 4+.
* **Price**, then **Add for Review**. Review usually takes a day or two.

## What's native, and what isn't yet

* **Haptics:** the phone's own engine (in Safari on an iPhone they did nothing at all).
* **Keeping a plate:** the share sheet (save to Photos, send it on).
* **iPhone only, portrait only, light only, no status bar** (`Info.plist`, `TARGETED_DEVICE_FAMILY = 1`).
* **Permissions explained:** motion ("Tilt your phone to pour the lava.") and adding to Photos.
* **Privacy manifest** (`ios/App/App/PrivacyInfo.xcprivacy`): no tracking, nothing collected; it
  declares the one "required reason" API the web view's storage uses (file timestamps, C617.1).
* **The app's address** inside the web view is `capacitor://warm` (`server.hostname`). Saves belong
  to that address, so changing it starts every save afresh; leave it.
* **Saves** are still in the web view's storage. Inside an app that isn't cleared as Safari's can
  be, but moving them to native storage (and iCloud) is a later step, as is **Game Center**.
