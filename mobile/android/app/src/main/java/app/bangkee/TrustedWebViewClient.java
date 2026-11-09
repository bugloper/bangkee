package app.bangkee;

import android.net.Uri;
import android.net.http.SslError;
import android.webkit.SslErrorHandler;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;

/**
 * Capacitor's WebViewClient with Bangkee's navigation rules in front of it.
 *
 * Capacitor already keeps the app's own host in the WebView and hands every other
 * host to an ACTION_VIEW intent, but it hands over any scheme at all (intent:,
 * file:, market: ...) and lets iframes do it too. NavigationPolicy narrows that.
 * Everything else (the request interception that serves the offline page, the
 * error page on a failed load, the WebViewListeners) stays Capacitor's.
 */
final class TrustedWebViewClient extends BridgeWebViewClient {

    interface ExternalOpener {
        void open(NavigationPolicy.Decision decision, Uri url);
    }

    private final Bridge bridge;
    private final NavigationPolicy policy;
    private final ExternalOpener opener;
    private final Runnable onHistoryChanged;

    TrustedWebViewClient(Bridge bridge, NavigationPolicy policy, ExternalOpener opener, Runnable onHistoryChanged) {
        super(bridge);
        this.bridge = bridge;
        this.policy = policy;
        this.opener = opener;
        this.onHistoryChanged = onHistoryChanged;
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        Uri url = request.getUrl();
        NavigationPolicy.Decision decision = policy.decide(url.toString(), request.isForMainFrame());
        switch (decision) {
            case IN_APP:
                // Capacitor keeps it in the WebView (and still blocks its own internal paths).
                return super.shouldOverrideUrlLoading(view, request);
            case BLOCK:
                return true;
            default:
                opener.open(decision, url);
                return true;
        }
    }

    /**
     * A certificate problem is never waved through. If it is the web app's own origin
     * the whole page is untrustworthy, so the offline page replaces it; other origins
     * (a map tile, a font) just fail to load.
     */
    @Override
    public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
        handler.cancel();
        String errorUrl = bridge.getErrorUrl();
        if (errorUrl != null && policy.isAppOrigin(error.getUrl())) {
            view.loadUrl(errorUrl);
        }
    }

    @Override
    public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
        super.doUpdateVisitedHistory(view, url, isReload);
        onHistoryChanged.run();
    }
}
