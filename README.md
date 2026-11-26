# CleanTVOS 1.0

An offline Android TV launcher with a charcoal and ice-blue home screen, favorites, app search, and D-pad navigation.

## Build

Install JDK 17, Gradle 8.9 and Android SDK platform 35. Set ANDROID_HOME or configure the SDK in local.properties. Run:

    gradle :app:assembleDebug :app:lintDebug

The debug APK is at app/build/outputs/apk/debug/app-debug.apk. The GitHub workflow runs the same build and publishes its debug APK as a workflow artifact.

## Browser preview

Serve app/src/main/assets with a local HTTP server and open index.html. The browser uses sample apps and demonstrates focus, favorites, app search, and settings. The Android build loads the same assets locally.

## TV setup

Install the APK and choose Set CleanTVOS as Home in its settings. Use Restore Factory Home to open the system Home picker and select the original launcher. Home selection and TV input shortcuts depend on the manufacturer's firmware. The launcher targets Android 6.0 and newer. Its interface needs a WebView with CSS Grid support. Test the exact TV and WebView before relying on it as your main launcher.

The VPN shortcut opens the system VPN settings when available. The connected indicator is shown when Android reports a VPN transport to the launcher. Configure always-on behavior through Android or your VPN provider. Verify the Home button, factory restore, HDMI and remote keys, and VPN reconnection on your TV after reboot and sleep.
