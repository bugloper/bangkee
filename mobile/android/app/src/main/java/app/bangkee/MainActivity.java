package app.bangkee;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.URLUtil;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.activity.OnBackPressedCallback;
import androidx.core.content.ContextCompat;
import androidx.core.splashscreen.SplashScreen;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.CapConfig;
import com.getcapacitor.WebViewListener;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Bangkee on Android: the web app, loaded from its server into a WebView.
 *
 * The web app stays the source of truth. A website deploy reaches every phone the
 * next time the app opens or the page reloads; only changes to this native shell
 * need a new release on Google Play.
 *
 * Capacitor provides the WebView, file uploads with camera capture, geolocation
 * prompts and edge-to-edge insets. This class adds: the URL for the build type
 * (BuildConfig.APP_URL, set in app/build.gradle, never the generated
 * capacitor.config.json), the splash screen held until the first page has loaded,
 * the navigation rules (NavigationPolicy), the system back button, App Links, and a
 * WebView configured setting by setting.
 */
public class MainActivity extends BridgeActivity {

    /** Shown by Capacitor when the first page cannot load (offline, server down, TLS failure). */
    private static final String OFFLINE_PAGE = "wrapper-offline.html";
    /** The splash never outstays this, even on a very slow network. */
    private static final long SPLASH_TIMEOUT_MS = 8000;

    /** Attachments opened from an entry are fetched into the cache up to this size. */
    private static final long MAX_DOWNLOAD_BYTES = 25L * 1024 * 1024;

    private final ExecutorService downloads = Executors.newSingleThreadExecutor();
    private NavigationPolicy policy;
    private volatile boolean firstPageShown = false;

    private final OnBackPressedCallback backInWebHistory = new OnBackPressedCallback(false) {
        @Override
        public void handleOnBackPressed() {
            WebView webView = bridge == null ? null : bridge.getWebView();
            if (webView != null && webView.canGoBack()) {
                webView.goBack();
            } else {
                // Nothing to go back to: let the system close the app as usual.
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
            }
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        SplashScreen splash = SplashScreen.installSplashScreen(this);
        splash.setKeepOnScreenCondition(() -> !firstPageShown);
        new Handler(Looper.getMainLooper()).postDelayed(() -> firstPageShown = true, SPLASH_TIMEOUT_MS);

        policy = new NavigationPolicy(BuildConfig.APP_URL);
        registerPlugin(WebPrintPlugin.class);
        registerPlugin(FilesPlugin.class);
        config = buildConfig();

        super.onCreate(savedInstanceState);

        if (bridge == null) {
            // No usable WebView on this phone; Capacitor shows its own message.
            firstPageShown = true;
            return;
        }
        getOnBackPressedDispatcher().addCallback(this, backInWebHistory);
    }

    /** Capacitor's configuration, built here so the URL follows the build type. */
    private CapConfig buildConfig() {
        JSONObject plugins = new JSONObject();
        try {
            // web/index.html sets viewport-fit=cover and pads with env(safe-area-inset-*).
            plugins.put("SystemBars", new JSONObject().put("initialViewportFitValueHint", "cover"));
        } catch (JSONException impossible) {
            throw new IllegalStateException(impossible);
        }
        String background = String.format("#%06X", 0xFFFFFF & ContextCompat.getColor(this, R.color.window_background));
        return new CapConfig.Builder(this)
            .setServerUrl(BuildConfig.APP_URL)
            .setErrorPath(OFFLINE_PAGE)
            .setBackgroundColor(background)
            .setPluginsConfiguration(plugins)
            // Off in release: no chrome://inspect, and Capacitor does not log the URLs it
            // loads (a password-reset link carries its token in the path).
            .setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
            .setLoggingEnabled(BuildConfig.DEBUG)
            .create();
    }

    /**
     * Capacitor creates the Bridge here and starts loading the page. The WebView exists
     * (the layout is already inflated) but has not loaded anything yet, so this is the
     * one place to add the page shims before the first document.
     */
    @Override
    protected void load() {
        WebView webView = findViewById(com.getcapacitor.android.R.id.webview);
        if (webView != null) addPageShims(webView);

        super.load();
        if (bridge == null) return;

        configureWebView(bridge.getWebView());
        bridge.setWebViewClient(new TrustedWebViewClient(bridge, policy, this::openExternally, this::syncBackButton));
        bridge.addWebViewListener(new WebViewListener() {
            @Override
            public void onPageLoaded(WebView view) {
                firstPageShown = true;
            }

            @Override
            public void onReceivedError(WebView view) {
                firstPageShown = true;
            }

            @Override
            public void onReceivedHttpError(WebView view) {
                firstPageShown = true;
            }
        });
    }

    /**
     * Every WebView setting that matters, decided one by one. Capacitor's defaults that
     * are kept: JavaScript and DOM storage (the app is a single-page app with an offline
     * queue in IndexedDB), geolocation (pinning a shop), media without a gesture (the
     * notification chime), and its injected bridge, which it only exposes to the app's
     * own origin.
     */
    private void configureWebView(WebView webView) {
        WebSettings settings = webView.getSettings();
        // Nothing is loaded from file://; Capacitor serves its own pages from memory.
        settings.setAllowFileAccess(false);
        // Content access stays on (the default). Photos chosen or taken for an upload
        // come back as content:// URIs; keep it until uploads are verified without it.
        // No pop-up windows: target=_blank and window.open go through NavigationPolicy.
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        // An https page never loads http:// subresources.
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        if (WebViewFeature.isFeatureSupported(WebViewFeature.SAFE_BROWSING_ENABLE)) {
            WebSettingsCompat.setSafeBrowsingEnabled(settings, true);
        }

        // The session is a first-party HttpOnly cookie (SameSite=Lax, Secure over HTTPS);
        // nothing needs third-party cookies.
        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, false);

        // A response the WebView cannot show (an entry's PDF or HEIC attachment, served
        // inline) arrives here instead of loading. The web app's own blob: downloads
        // never do: bangkee-shims.js saves those through FilesPlugin.
        webView.setDownloadListener(onDownload);
    }

    private final DownloadListener onDownload = (url, userAgent, contentDisposition, mimeType, contentLength) -> {
        NavigationPolicy.Decision decision = policy.decide(url, true);
        if (decision == NavigationPolicy.Decision.BROWSER) {
            openExternally(decision, Uri.parse(url));
            return;
        }
        if (!url.startsWith("http") || !policy.isAppOrigin(url)) return;
        String name = URLUtil.guessFileName(url, contentDisposition, mimeType);
        String type = mimeType == null || mimeType.isEmpty() ? "application/octet-stream" : mimeType;
        Toast.makeText(this, R.string.opening_file, Toast.LENGTH_SHORT).show();
        downloads.execute(() -> {
            try {
                Uri file = fetchIntoCache(url, userAgent, name, type);
                FilesPlugin.open(this, file, type);
            } catch (IOException e) {
                runOnUiThread(() -> Toast.makeText(this, R.string.file_failed, Toast.LENGTH_SHORT).show());
            }
        });
    };

    /** Fetches a file from the app's own origin with the WebView's session cookie. */
    private Uri fetchIntoCache(String url, String userAgent, String name, String type) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setInstanceFollowRedirects(false);
        connection.setConnectTimeout(15_000);
        connection.setReadTimeout(30_000);
        String cookie = CookieManager.getInstance().getCookie(url);
        if (cookie != null) connection.setRequestProperty("Cookie", cookie);
        if (userAgent != null) connection.setRequestProperty("User-Agent", userAgent);
        try {
            if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) throw new IOException("HTTP " + connection.getResponseCode());
            if (connection.getContentLengthLong() > MAX_DOWNLOAD_BYTES) throw new IOException("Too large");
            try (InputStream in = connection.getInputStream()) {
                return FilesPlugin.cacheUri(this, FileNames.withExtension(name, type), in, MAX_DOWNLOAD_BYTES);
            }
        } finally {
            connection.disconnect();
        }
    }

    /**
     * assets/bangkee-shims.js, added before every page of the app's own origin (and no
     * other): window.print, navigator.share and blob: downloads, pointed at the app.
     */
    private void addPageShims(WebView webView) {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) return;
        String script;
        try (InputStream in = getAssets().open("bangkee-shims.js")) {
            script = new String(readAll(in), StandardCharsets.UTF_8);
        } catch (IOException e) {
            return;
        }
        WebViewCompat.addDocumentStartJavaScript(webView, script, Collections.singleton(policy.origin()));
    }

    private static byte[] readAll(InputStream in) throws IOException {
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        for (int n; (n = in.read(buffer)) != -1; ) out.write(buffer, 0, n);
        return out.toByteArray();
    }

    private void syncBackButton() {
        WebView webView = bridge == null ? null : bridge.getWebView();
        backInWebHistory.setEnabled(webView != null && webView.canGoBack());
    }

    /** Hands a link the web app may not open itself to the app that should. */
    private void openExternally(NavigationPolicy.Decision decision, Uri url) {
        Intent intent;
        switch (decision) {
            case DIAL:
                intent = new Intent(Intent.ACTION_DIAL, url);
                break;
            case EMAIL:
                intent = new Intent(Intent.ACTION_SENDTO, url);
                break;
            case SMS:
                intent = new Intent(Intent.ACTION_SENDTO, url);
                String body = NavigationPolicy.smsBody(url.toString());
                if (body != null) intent.putExtra("sms_body", body);
                break;
            case BROWSER:
                intent = new Intent(Intent.ACTION_VIEW, url).addCategory(Intent.CATEGORY_BROWSABLE);
                break;
            default:
                return;
        }
        try {
            startActivity(intent);
        } catch (ActivityNotFoundException | SecurityException e) {
            Toast.makeText(this, R.string.no_app_for_link, Toast.LENGTH_SHORT).show();
        }
    }

    /**
     * App Links (password reset, invites): open the same path in the WebView. Capacitor
     * calls this at launch with the launching intent, and again when a link arrives
     * while the app is already open (launchMode singleTask).
     */
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (bridge == null || intent == null || !Intent.ACTION_VIEW.equals(intent.getAction())) return;
        String target = policy.deepLinkTarget(intent.getDataString(), BuildConfig.APP_LINK_HOST);
        // Handled once: a recreated activity starts at the app, not the old link.
        setIntent(new Intent(Intent.ACTION_MAIN));
        if (target != null) bridge.getWebView().loadUrl(target);
    }

    @Override
    public void onDestroy() {
        downloads.shutdown();
        super.onDestroy();
    }

    @Override
    public void onPause() {
        super.onPause();
        // Write the session cookie to disk now, not on WebView's own schedule, so a
        // sign-in survives the app being swiped away straight after.
        CookieManager.getInstance().flush();
    }
}
