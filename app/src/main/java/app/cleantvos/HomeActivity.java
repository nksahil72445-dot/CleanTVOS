package app.cleantvos;

import android.app.Activity;
import android.app.role.RoleManager;
import android.content.Intent;
import android.content.pm.ResolveInfo;
import android.graphics.drawable.Drawable;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.os.Bundle;
import android.provider.Settings;
import android.view.KeyEvent;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.util.Collections;
import java.util.List;

public class HomeActivity extends Activity {
    private WebView home;
    private java.util.Map<String, JSONObject> artworkCache = new java.util.HashMap<>();
    private String lastAppPayload;
    private volatile boolean appTileFocused;
    private boolean appOkDown;
    private boolean appOkHeld;
    private final Runnable openHeldMenu = () -> {
        if (!appOkDown || appOkHeld) return;
        appOkHeld = true;
        home.evaluateJavascript("window.handleRemoteAppOk(true)", null);
    };
    private final java.util.concurrent.ExecutorService loader =
            java.util.concurrent.Executors.newSingleThreadExecutor();

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        home = new WebView(this);
        home.setBackgroundColor(0xff090b10);
        home.getSettings().setJavaScriptEnabled(true);
        home.getSettings().setDomStorageEnabled(true);
        home.getSettings().setAllowContentAccess(false);
        home.getSettings().setAllowFileAccess(false);
        home.addJavascriptInterface(new Bridge(), "CleanTV");
        home.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, String url) { return true; }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return true; }
        });
        setContentView(home);
        home.loadUrl("file:///android_asset/index.html");
    }

    @Override protected void onResume() {
        super.onResume();
        if (home != null) home.evaluateJavascript("window.refreshHome && window.refreshHome()", null);
    }

    @Override public boolean dispatchKeyEvent(KeyEvent event) {
        int key = event.getKeyCode();
        if (key == KeyEvent.KEYCODE_DPAD_CENTER || key == KeyEvent.KEYCODE_ENTER) {
            if (event.getAction() == KeyEvent.ACTION_DOWN) {
                if (!appOkDown && appTileFocused && event.getRepeatCount() == 0) {
                    appOkDown = true;
                    home.postDelayed(openHeldMenu, 550);
                }
                if (appOkDown) {
                    if (event.isLongPress()) openHeldMenu.run();
                    return true;
                }
            } else if (event.getAction() == KeyEvent.ACTION_UP && appOkDown) {
                home.removeCallbacks(openHeldMenu);
                if (!appOkHeld && !event.isCanceled()) {
                    boolean held = event.getEventTime() - event.getDownTime() >= 550;
                    home.evaluateJavascript("window.handleRemoteAppOk(" + held + ")", null);
                }
                appOkDown = false;
                appOkHeld = false;
                return true;
            }
        }
        return super.dispatchKeyEvent(event);
    }

    @Override protected void onPause() {
        home.removeCallbacks(openHeldMenu);
        appOkDown = false;
        appOkHeld = false;
        super.onPause();
    }

    @Override public void onBackPressed() {
        home.evaluateJavascript("window.closePanel && window.closePanel()", null);
    }

    @Override protected void onDestroy() {
        loader.shutdownNow();
        home.removeJavascriptInterface("CleanTV");
        home.destroy();
        super.onDestroy();
    }

    private boolean open(Intent intent) {
        try { startActivity(intent); return true; }
        catch (android.content.ActivityNotFoundException | SecurityException e) { return false; }
    }

    private String artwork(Drawable image, int maxEdge) {
        if (image == null) return "";
        int width = image.getIntrinsicWidth();
        int height = image.getIntrinsicHeight();
        if (width <= 0 || height <= 0) return "";
        float scale = Math.min(1f, (float) maxEdge / Math.max(width, height));
        Bitmap bitmap = Bitmap.createBitmap(Math.max(1, Math.round(width * scale)),
                Math.max(1, Math.round(height * scale)), Bitmap.Config.ARGB_8888);
        image.setBounds(0, 0, bitmap.getWidth(), bitmap.getHeight());
        image.draw(new Canvas(bitmap));
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        bitmap.compress(Bitmap.CompressFormat.PNG, 100, buffer);
        bitmap.recycle();
        return "data:image/png;base64," + Base64.encodeToString(buffer.toByteArray(), Base64.NO_WRAP);
    }

    private class Bridge {
        @JavascriptInterface public void showSearchKeyboard() {
            runOnUiThread(() -> home.post(() -> getSystemService(android.view.inputmethod.InputMethodManager.class)
                    .showSoftInput(home, android.view.inputmethod.InputMethodManager.SHOW_IMPLICIT)));
        }

        @JavascriptInterface public void setAppTileFocused(boolean focused) {
            appTileFocused = focused;
        }

        @JavascriptInterface public boolean useEfficientGraphics() {
            return android.os.Build.VERSION.SDK_INT <= 28 ||
                    getSystemService(android.app.ActivityManager.class).isLowRamDevice();
        }

        @JavascriptInterface public void loadApps(boolean force) {
            loader.execute(() -> {
                java.util.Map<String, ResolveInfo> launchers = new java.util.LinkedHashMap<>();
                for (String category : new String[]{Intent.CATEGORY_LEANBACK_LAUNCHER, Intent.CATEGORY_LAUNCHER}) {
                    Intent query = new Intent(Intent.ACTION_MAIN).addCategory(category);
                    for (ResolveInfo app : getPackageManager().queryIntentActivities(query, 0)) {
                        String packageName = app.activityInfo.packageName;
                        if (!launchers.containsKey(packageName)) launchers.put(packageName, app);
                    }
                }
                List<ResolveInfo> apps = new java.util.ArrayList<>(launchers.values());
                Collections.sort(apps, new ResolveInfo.DisplayNameComparator(getPackageManager()));
                JSONArray result = new JSONArray();
                java.util.Map<String, JSONObject> nextCache = new java.util.HashMap<>();
                for (ResolveInfo app : apps) {
                    if (app.activityInfo.packageName.equals(getPackageName())) continue;
                    try {
                        String source = app.activityInfo.applicationInfo.sourceDir;
                        String key = app.activityInfo.packageName + "/" + app.activityInfo.name
                                + ":" + source + ":" + new java.io.File(source).lastModified();
                        JSONObject entry = artworkCache.get(key);
                        if (entry == null) {
                            Drawable banner = getPackageManager().getActivityBanner(
                                    new android.content.ComponentName(app.activityInfo.packageName, app.activityInfo.name));
                            if (banner == null) banner = getPackageManager().getApplicationBanner(app.activityInfo.applicationInfo);
                            entry = new JSONObject()
                                .put("id", app.activityInfo.packageName + "/" + app.activityInfo.name)
                                .put("name", app.loadLabel(getPackageManager()).toString())
                                .put("image", artwork(banner, 480))
                                .put("icon", artwork(app.loadIcon(getPackageManager()), 256));
                        }
                        nextCache.put(key, entry);
                        result.put(entry);
                    } catch (org.json.JSONException | android.content.pm.PackageManager.NameNotFoundException | RuntimeException ignored) { }
                }
                artworkCache = nextCache;
                String payload = result.toString();
                if (!force && payload.equals(lastAppPayload)) return;
                lastAppPayload = payload;
                runOnUiThread(() -> {
                    if (!isDestroyed()) home.evaluateJavascript("window.receiveApps(" + payload + ")", null);
                });
            });
        }

        @JavascriptInterface public void launch(String id) {
            runOnUiThread(() -> {
                android.content.ComponentName component = android.content.ComponentName.unflattenFromString(id);
                if (component != null && !open(new Intent(Intent.ACTION_MAIN)
                        .setComponent(component))) {
                    home.evaluateJavascript("window.showStatus('App unavailable')", null);
                }
            });
        }

        @JavascriptInterface public boolean vpnConnected() {
            ConnectivityManager manager = getSystemService(ConnectivityManager.class);
            NetworkCapabilities caps = manager.getNetworkCapabilities(manager.getActiveNetwork());
            return caps != null && caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN);
        }

        @JavascriptInterface public void settings(String action) {
            runOnUiThread(() -> {
                if ("activate".equals(action) && android.os.Build.VERSION.SDK_INT >= 29) {
                    RoleManager roles = getSystemService(RoleManager.class);
                    if (roles.isRoleAvailable(RoleManager.ROLE_HOME) &&
                            open(roles.createRequestRoleIntent(RoleManager.ROLE_HOME))) return;
                }
                String target;
                switch (action) {
                    case "activate":
                    case "restore": target = Settings.ACTION_HOME_SETTINGS; break;
                    case "wifi": target = Settings.ACTION_WIFI_SETTINGS; break;
                    case "network": target = Settings.ACTION_WIRELESS_SETTINGS; break;
                    case "vpn": target = android.os.Build.VERSION.SDK_INT >= 24
                            ? Settings.ACTION_VPN_SETTINGS : Settings.ACTION_WIRELESS_SETTINGS; break;
                    case "inputs": target = "android.settings.TV_INPUT_SETTINGS"; break;
                    default: target = Settings.ACTION_SETTINGS;
                }
                if (!open(new Intent(target))) {
                    home.evaluateJavascript("window.showStatus('Shortcut unavailable on this TV')", null);
                    open(new Intent(Settings.ACTION_SETTINGS));
                }
            });
        }
    }
}
