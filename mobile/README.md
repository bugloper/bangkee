# Bangkee for Android

The Android app on Google Play is a thin native shell around the Bangkee web
app. It opens the web app from its server in a WebView. None of the web app
is bundled into the APK, so **the website stays the source of truth**: deploy
the web app as usual and every installed phone picks it up the next time
Bangkee is opened or reloaded.

Built with [Capacitor 8](https://capacitorjs.com) (Android only). It lives in
`mobile/`, apart from `web/` and the Go server, and changes neither.

## Architecture

```
 ┌──────────────────────── Android phone ────────────────────────┐
 │  Bangkee app (app.bangkee)                                    │
 │  ┌──────────────────────────────────────────────────────────┐ │
 │  │ MainActivity (Capacitor BridgeActivity)                  │ │
 │  │  · splash until the first page loads                     │ │
 │  │  · back button walks web history, then closes            │ │
 │  │  · App Links (/passwords/…, /join/…) → same path in app  │ │
 │  │  · TrustedWebViewClient + NavigationPolicy               │ │
 │  │      own origin ─────────────► stays in the WebView      │ │
 │  │      other https sites ──────► browser / Maps / WhatsApp │ │
 │  │      tel: mailto: sms: ──────► dialler / mail / SMS app  │ │
 │  │      anything else ──────────► refused                   │ │
 │  │  ┌────────────────────────────────────────────────────┐  │ │
 │  │  │ WebView: the web app (React SPA + service worker)  │  │ │
 │  │  │ cookies: bangkee_session (HttpOnly, Secure, Lax)   │  │ │
 │  │  └────────────────────────────────────────────────────┘  │ │
 │  │  wrapper-offline.html (in the APK) if the first load     │ │
 │  │  fails and nothing is cached yet                         │ │
 │  └──────────────────────────────────────────────────────────┘ │
 └──────────────────────────────┬────────────────────────────────┘
                                │ HTTPS only
                                ▼
         https://bangkee.app  (Caddy → Go server: /api + web/dist)
                                ▲
         git push / deploy ─────┘   ← ordinary web changes ship here,
                                      no new Android release needed
```

| File | What it does |
|---|---|
| `android/app/build.gradle` | Application ID, version, the URL per build type, release signing from the environment |
| `android/app/src/main/java/app/bangkee/MainActivity.java` | Capacitor config (built in code, from `BuildConfig`), splash, WebView settings, back button, App Links, external links |
| `…/NavigationPolicy.java` | Which URLs stay in the app, go to another app, or are refused. Plain Java, unit-tested |
| `…/TrustedWebViewClient.java` | Applies `NavigationPolicy` in front of Capacitor's client; refuses certificate errors |
| `…/WebPrintPlugin.java` | Makes `window.print()` (a statement's Print button) open Android's print dialog |
| `android/app/src/main/AndroidManifest.xml` | Permissions, App Links intent filter, backup off |
| `android/app/src/main/res/xml/network_security_config.xml` | HTTPS only, system CAs only (debug build: plain HTTP to localhost) |
| `www/wrapper-offline.html` | The "can't connect" page shipped inside the APK |
| `capacitor.config.json` | App ID and name only. Server settings are deliberately **not** here (see below) |

### Why the URL is not in `capacitor.config.json`

Capacitor normally reads `server.url` from `capacitor.config.json`, which `cap
sync` copies into the APK. Whatever was synced last would ship, so a release
could easily point at a laptop. Instead the URL is a Gradle property per
build type, compiled into `BuildConfig.APP_URL`, and `MainActivity` builds
Capacitor's configuration from it. A release build cannot point anywhere but
an `https://` origin: Gradle refuses to configure the project otherwise.

## Worktree and branch

Developed on the branch `feature/android-wrapper`, in the worktree
`../bangkee-android-wrapper` beside the main checkout:

```sh
git worktree list                  # shows both checkouts
cd ../bangkee-android-wrapper      # this branch
git worktree remove ../bangkee-android-wrapper   # when the branch is merged
```

## Prerequisites

- [Bun](https://bun.sh) (installs the Capacitor packages; npm works too)
- JDK 21 (Capacitor 8 compiles to Java 21). Android Studio's bundled JDK works.
- Android SDK with platform `android-36` and build-tools. Either install
  [Android Studio](https://developer.android.com/studio), or use the command-line
  tools:
  ```sh
  sdkmanager --sdk_root="$HOME/Library/Android/sdk" "platforms;android-36" "build-tools;36.0.0" "platform-tools"
  export ANDROID_HOME="$HOME/Library/Android/sdk"
  ```
- For the debug build: the web app running locally (`make dev` at the repo root).

## Install

```sh
cd mobile
bun install                  # Capacitor packages into mobile/node_modules
bunx cap sync android        # copies www/ into the Android project, generates plugin glue
```

Run `bunx cap sync android` again after changing `www/` or upgrading Capacitor.
The copied assets and generated files are gitignored.

## Configuring the URL

| Build type | Property | Default | Rules |
|---|---|---|---|
| `release` | `bangkee.appUrl` | `https://bangkee.app` | `https://` origin, no path |
| `debug` | `bangkee.devUrl` | `http://localhost:5173` | `http(s)://` origin, no path |

Set them per build (`./gradlew bundleRelease -Pbangkee.appUrl=https://bangkee.app`)
or once in `~/.gradle/gradle.properties`. The App Links host is taken from
`bangkee.appUrl`.

> **To confirm before the first release:** `https://bangkee.app` is the chosen
> production address but the domain is not registered yet. Until it serves the
> web app, the release build opens to the offline page. To test against
> another deployment (e.g. the sslip.io name on the VM), pass
> `-Pbangkee.appUrl=https://bangkee.<ip>.sslip.io` to a release build.

The server side needs no change for the app to work: point
`BANGKEE_DOMAIN` (VM) or `BANGKEE_HOST` (Render) at the same host so email
links match.

## Local development

The debug build (`app.bangkee.debug`, shown as "Bangkee Dev") loads the Vite
dev server from your machine and installs alongside the release app.

```sh
make dev                                  # repo root: API on :3000, web on :5173
adb reverse tcp:5173 tcp:5173             # the phone's localhost:5173 → your machine
cd mobile/android && ./gradlew installDebug
adb shell am start -n app.bangkee.debug/app.bangkee.MainActivity
```

`adb reverse` works for both emulators and USB-connected phones, and keeps the
page on `localhost`, which browsers treat as a secure context: the service
worker, geolocation and the clipboard work just as they do over HTTPS. Repeat
`adb reverse` after reconnecting the phone.

Web changes reload in the app through Vite's hot reload. Only changes under
`mobile/android` need `./gradlew installDebug` again.

Debugging the page: debug builds allow WebView inspection. Open
`chrome://inspect` in Chrome on your computer and pick "Bangkee Dev".

Open the project in Android Studio with `bunx cap open android` (or open
`mobile/android` directly).

### Emulator

```sh
sdkmanager "emulator" "system-images;android-36;google_apis;arm64-v8a"   # x86_64 on Intel
avdmanager create avd -n bangkee -k "system-images;android-36;google_apis;arm64-v8a" -d pixel_8
$ANDROID_HOME/emulator/emulator -avd bangkee
```

Or create one in Android Studio's Device Manager. A `google_apis` image
includes Chrome's WebView. Then follow the local development steps above.

### A physical phone

1. On the phone: Settings → About phone → tap **Build number** seven times.
2. Settings → System → Developer options → turn on **USB debugging**.
3. Connect it by USB and accept the prompt; `adb devices` should list it.
4. `adb reverse tcp:5173 tcp:5173`, then `./gradlew installDebug`.

Wireless: Developer options → **Wireless debugging** → pair with
`adb pair <ip>:<port>`, then `adb connect <ip>:<port>`.

### Trying an App Link in a debug build

```sh
adb shell am start -a android.intent.action.VIEW \
  -d "https://bangkee.app/passwords/TOKEN/edit" app.bangkee.debug
```

A debug build opens the same path on the dev server.

## Builds

All from `mobile/android`:

| What | Command | Output |
|---|---|---|
| Unit tests | `./gradlew testDebugUnitTest` | `app/build/reports/tests/` |
| Lint | `./gradlew lintRelease` | `app/build/reports/lint-results-release.html` |
| Debug APK | `./gradlew assembleDebug` | `app/build/outputs/apk/debug/app-debug.apk` |
| Release APK | `./gradlew assembleRelease` | `app/build/outputs/apk/release/app-release.apk` (`-unsigned` without signing) |
| Play bundle (AAB) | `./gradlew bundleRelease` | `app/build/outputs/bundle/release/app-release.aab` |

Release builds are only signed when the signing variables below are set.
Google Play accepts only a signed `.aab`.

### Versions

`versionCode` and `versionName` are in `android/app/build.gradle`. Raise
`versionCode` by one (and `versionName` as you like) for every upload to Google
Play. A web deploy needs no version change.

## Signing

Google Play signs what users install with the **app signing key**, which Google
holds (Play App Signing). You sign each upload with your own **upload key**.
Neither goes into this repository.

Create the upload key once, and keep it (and its passwords) in a password
manager, outside the repository:

```sh
keytool -genkeypair -v -keystore ~/keys/bangkee-upload.jks -alias upload \
  -keyalg RSA -keysize 4096 -validity 10000
```

Then build with it:

```sh
export BANGKEE_UPLOAD_KEYSTORE=~/keys/bangkee-upload.jks
export BANGKEE_UPLOAD_KEYSTORE_PASSWORD=...     # from the password manager
export BANGKEE_UPLOAD_KEY_ALIAS=upload
export BANGKEE_UPLOAD_KEY_PASSWORD=...
./gradlew bundleRelease
```

In CI, keep the keystore as a base64 secret, decode it to a temporary file and
set the same four variables from secrets. If the upload key is lost, Google
Play support can reset it; the app signing key is never at risk.

## App Links (password reset and invite links open the app)

The manifest asks Android to open `https://bangkee.app/…` links in the app.
Android only does that once the site vouches for the app. Until then, those
links open in the browser, which still works: the person resets their password
or accepts the invite there, then signs in to the app.

To turn it on, after the first upload to Play:

1. Play Console → the app → **Test and release → Setup → App signing**: copy the
   **SHA-256 certificate fingerprint** of the app signing key.
2. Add `web/public/.well-known/assetlinks.json` and deploy the web app (Vite copies it
   into `web/dist` and the Go server serves it as JSON):
   ```json
   [{
     "relation": ["delegate_permission/common.handle_all_urls"],
     "target": {
       "namespace": "android_app",
       "package_name": "app.bangkee",
       "sha256_cert_fingerprints": ["AA:BB:…the fingerprint from step 1…"]
     }
   }]
   ```
3. Check: `adb shell pm verify-app-links --re-verify app.bangkee`, then
   `adb shell pm get-app-links app.bangkee` should show `verified`.

## Web deploys and native releases

**Needs only a web deploy** (no new APK/AAB): anything in `web/`, the Go server,
the API, migrations, copy, styles, new screens, new routes.

How it reaches phones: every launch loads `https://bangkee.app`. The web app's
service worker fetches pages **network-first** and activates a new worker
straight away (`skipWaiting` + `clients.claim`), so with a connection the
newest deploy is what opens. Offline, the last cached copy opens. An app left
open across a deploy keeps the old page until it is reloaded or reopened.

**Needs a new Play release** (raise `versionCode`, build, upload):

- anything under `mobile/` (Java, manifest, icons, splash, offline page, Capacitor upgrades)
- a new Android permission (e.g. camera, notifications) or a new native capability
- changing the production URL or the application ID (the ID can never change once published)
- the targetSdk raise that Google Play requires each year

The app never downloads executable native code. Remotely delivered web content
is the same website anyone can open, which keeps it within Google Play's
policies on dynamic code. Material changes to what the app does must still
match its Play listing and Data safety form.

## What the app does, and what it doesn't (yet)

| Works | Notes |
|---|---|
| Sign in, sign out, registration, invites | First-party cookie in the WebView's own cookie jar, written to disk when the app goes to the background |
| Staying signed in | The session cookie lasts 20 years; signing out anywhere deletes the server's session row |
| Expired or revoked session | The API answers 401 and the web app shows sign-in, as on the web |
| Photo upload, camera capture | `<input type=file capture>` opens the camera app (no camera permission needed) or the file picker |
| Pinning a shop | Location permission asked when the owner taps "use my location" |
| Directions, WhatsApp, phone, SMS, email | Handed to Maps / WhatsApp / dialler / messaging / mail app |
| Printing a statement | Android's print dialog (printer or Save as PDF) |
| Live updates and the chime while open | The `/api/live` WebSocket, as on the web |
| Offline reading, queued writes | The service worker and IndexedDB queue; queued writes go out when the app is open with a signal |
| Rotation, foldables, tablets, dark mode | Same activity and page through configuration changes; the web app's desktop layout above 768 px |

**Known limitations**

- **No phone notifications while the app is closed.** Android's WebView has no Web
  Push, so the in-app prompt to turn on notifications does not appear in the app.
  Adding them means native push (Firebase Cloud Messaging via
  `@capacitor/push-notifications`) plus the server sending to FCM tokens next to
  Web Push. That is a native release and a backend change.
- **Queued writes don't sync in the background.** WebView has no Background Sync,
  so writes made offline go out the next time the app is open with a signal,
  not while it is closed.
- **Separate sign-in from the browser.** The app has its own cookie jar, so
  signing in on bangkee.app in Chrome does not sign in the app, and vice versa.
- **The operator console** (`admin.bangkee.app`) opens in the browser, not the app.
- **Old WebViews.** Android 7–9 phones with a WebView that was never updated may
  lack features the web app uses. Capacitor needs WebView 60+ and shows the
  offline page below that.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Release app shows "Bangkee can't connect" | `bangkee.appUrl` is not serving yet (the domain is unregistered), or the certificate failed to verify. Open the URL in Chrome on the phone |
| Debug app shows "Bangkee can't connect" | `make dev` not running, or `adb reverse tcp:5173 tcp:5173` not done since the phone reconnected |
| `bangkee.appUrl must be an https origin` | The property has `http://`, a path or a trailing segment. Use just `https://host` |
| `Unsupported class file major version` / Java errors | Gradle is not on JDK 21. Set `JAVA_HOME` to a JDK 21 |
| `SDK location not found` | Set `ANDROID_HOME`, or `sdk.dir` in `mobile/android/local.properties` |
| Plugin or asset errors after `git pull` | Run `bun install && bunx cap sync android` |
| Links open in the browser, not the app | App Links not verified yet (see above) |
| "That request did not come from Bangkee." on every save | Something stripped the web app's `X-Requested-With: bangkee` header. Check the WebView version; very old WebViews substituted the app's package name |
| Upload rejected: "version code already used" | Raise `versionCode` |
