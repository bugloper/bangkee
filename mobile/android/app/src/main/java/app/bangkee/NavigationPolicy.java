package app.bangkee;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;

/**
 * Decides where a link the web app follows goes: stays in the app, goes to another
 * app, or goes nowhere. Only the web app's own origin (scheme, host and port) runs in
 * the WebView; every other website opens in the browser, and anything that is not a
 * web, phone, email or SMS link is refused.
 *
 * Plain Java (java.net.URI, no android.*) so it runs in JVM unit tests.
 */
final class NavigationPolicy {

    enum Decision {
        /** Load in the WebView: the web app's own origin. */
        IN_APP,
        /** Another website: the browser, or the app that owns the link (Maps, WhatsApp). */
        BROWSER,
        /** tel: — the dialler, never a direct call. */
        DIAL,
        /** mailto: — the email app. */
        EMAIL,
        /** sms: / smsto: — the messaging app, with the message filled in. */
        SMS,
        /** Anything else: javascript:, file:, content:, intent:, data:, market: ... */
        BLOCK,
    }

    private final String scheme;
    private final String host;
    private final int port;
    private final String origin;

    NavigationPolicy(String appUrl) {
        URI uri = URI.create(appUrl);
        if (uri.getScheme() == null || uri.getHost() == null) {
            throw new IllegalArgumentException("Not an origin: " + appUrl);
        }
        scheme = lower(uri.getScheme());
        host = lower(uri.getHost());
        port = effectivePort(uri);
        origin = scheme + "://" + uri.getRawAuthority();
    }

    /** The web app's origin, e.g. https://bangkee.app. */
    String origin() {
        return origin;
    }

    /**
     * @param mainFrame false for a navigation inside an iframe. A frame never sends
     *     someone out of the app; only the page itself can.
     */
    Decision decide(String url, boolean mainFrame) {
        URI uri = parse(url);
        if (uri == null || uri.getScheme() == null) return Decision.BLOCK;
        switch (lower(uri.getScheme())) {
            case "http":
            case "https":
                if (isAppOrigin(uri)) return Decision.IN_APP;
                return mainFrame ? Decision.BROWSER : Decision.BLOCK;
            case "blob":
                // blob:https://bangkee.app/<uuid> — an object URL the page made itself.
                URI inner = parse(uri.getRawSchemeSpecificPart());
                return inner != null && isAppOrigin(inner) ? Decision.IN_APP : Decision.BLOCK;
            case "tel":
                return mainFrame ? Decision.DIAL : Decision.BLOCK;
            case "mailto":
                return mainFrame ? Decision.EMAIL : Decision.BLOCK;
            case "sms":
            case "smsto":
                return mainFrame ? Decision.SMS : Decision.BLOCK;
            default:
                return Decision.BLOCK;
        }
    }

    boolean isAppOrigin(String url) {
        URI uri = parse(url);
        return uri != null && isAppOrigin(uri);
    }

    /**
     * Where an App Link opened from outside (a password-reset email, an invite sent by
     * WhatsApp) should load: the same path and query on the web app's origin. In a
     * debug build that origin is the development server, so production links can be
     * tried against it. Null when the link is not for the app host.
     */
    String deepLinkTarget(String link, String appLinkHost) {
        URI uri = parse(link);
        if (uri == null || !"https".equals(lower(uri.getScheme())) || uri.getHost() == null) return null;
        if (!uri.getHost().equalsIgnoreCase(appLinkHost)) return null;
        // Only the default port: an explicit port is not the published app.
        if (uri.getPort() != -1 && uri.getPort() != 443) return null;
        StringBuilder target = new StringBuilder(origin);
        String path = uri.getRawPath();
        target.append(path == null || path.isEmpty() ? "/" : path);
        if (uri.getRawQuery() != null) target.append('?').append(uri.getRawQuery());
        if (uri.getRawFragment() != null) target.append('#').append(uri.getRawFragment());
        return target.toString();
    }

    /**
     * The message in an sms: link (sms:+97517123456?&body=...), for messaging apps that
     * read it from the intent extra rather than the link. Null when there is none.
     */
    static String smsBody(String url) {
        int query = url.indexOf('?');
        if (query < 0) return null;
        for (String pair : url.substring(query + 1).split("&")) {
            if (pair.startsWith("body=")) return decode(pair.substring("body=".length()));
        }
        return null;
    }

    private boolean isAppOrigin(URI uri) {
        return uri.getScheme() != null
            && uri.getHost() != null
            && scheme.equals(lower(uri.getScheme()))
            && host.equals(lower(uri.getHost()))
            && port == effectivePort(uri);
    }

    private static URI parse(String url) {
        if (url == null) return null;
        try {
            return new URI(url);
        } catch (URISyntaxException e) {
            return null;
        }
    }

    private static int effectivePort(URI uri) {
        if (uri.getPort() != -1) return uri.getPort();
        String s = lower(uri.getScheme());
        if ("https".equals(s)) return 443;
        if ("http".equals(s)) return 80;
        return -1;
    }

    private static String lower(String s) {
        return s == null ? null : s.toLowerCase(Locale.ROOT);
    }

    private static String decode(String s) {
        try {
            return java.net.URLDecoder.decode(s, "UTF-8");
        } catch (Exception e) {
            return s;
        }
    }
}
