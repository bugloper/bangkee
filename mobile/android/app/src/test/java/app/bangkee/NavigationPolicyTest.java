package app.bangkee;

import static app.bangkee.NavigationPolicy.Decision.BLOCK;
import static app.bangkee.NavigationPolicy.Decision.BROWSER;
import static app.bangkee.NavigationPolicy.Decision.DIAL;
import static app.bangkee.NavigationPolicy.Decision.EMAIL;
import static app.bangkee.NavigationPolicy.Decision.IN_APP;
import static app.bangkee.NavigationPolicy.Decision.SMS;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class NavigationPolicyTest {

    private final NavigationPolicy prod = new NavigationPolicy("https://bangkee.app");
    private final NavigationPolicy dev = new NavigationPolicy("http://localhost:5173");

    @Test
    public void theAppsOwnPagesStayInTheApp() {
        assertEquals(IN_APP, prod.decide("https://bangkee.app/", true));
        assertEquals(IN_APP, prod.decide("https://bangkee.app/accounts/12/statement?from=2026-01-01", true));
        assertEquals(IN_APP, prod.decide("https://BANGKEE.app/session/new", true));
        assertEquals(IN_APP, prod.decide("https://bangkee.app:443/passwords/abc/edit", true));
        assertEquals(IN_APP, dev.decide("http://localhost:5173/dashboard", true));
    }

    @Test
    public void otherWebsitesOpenInTheBrowser() {
        // Directions, WhatsApp invites, OpenStreetMap credits (web/src).
        assertEquals(BROWSER, prod.decide("https://www.google.com/maps/dir/?api=1&destination=27.47,89.63", true));
        assertEquals(BROWSER, prod.decide("https://wa.me/97517123456?text=hello", true));
        assertEquals(BROWSER, prod.decide("https://www.openstreetmap.org/copyright", true));
        // The operator console is not part of the Play app.
        assertEquals(BROWSER, prod.decide("https://admin.bangkee.app/", true));
    }

    @Test
    public void lookalikeHostsAreNotTheApp() {
        assertEquals(BROWSER, prod.decide("https://bangkee.app.evil.example/", true));
        assertEquals(BROWSER, prod.decide("https://evilbangkee.app/", true));
        assertEquals(BROWSER, prod.decide("https://bangkee.app@evil.example/", true));
        assertEquals(BROWSER, prod.decide("https://bangkee.app:8443/", true));
    }

    @Test
    public void plainHttpToTheAppHostIsNotTheApp() {
        // Same host, wrong scheme: the WebView never loads it; the browser upgrades or warns.
        assertEquals(BROWSER, prod.decide("http://bangkee.app/", true));
        assertFalse(prod.isAppOrigin("http://bangkee.app/"));
    }

    @Test
    public void framesNeverLeaveTheApp() {
        assertEquals(BLOCK, prod.decide("https://evil.example/", false));
        assertEquals(BLOCK, prod.decide("tel:+97517123456", false));
        assertEquals(BLOCK, prod.decide("mailto:a@b.bt", false));
        assertEquals(IN_APP, prod.decide("https://bangkee.app/frame", false));
    }

    @Test
    public void phoneEmailAndSmsGoToTheirApps() {
        assertEquals(DIAL, prod.decide("tel:+97517123456", true));
        assertEquals(EMAIL, prod.decide("mailto:karma@shop.bt", true));
        assertEquals(SMS, prod.decide("sms:+97517123456?&body=Hello%20there", true));
        assertEquals(SMS, prod.decide("smsto:+97517123456", true));
    }

    @Test
    public void dangerousSchemesAreRefused() {
        assertEquals(BLOCK, prod.decide("javascript:alert(1)", true));
        assertEquals(BLOCK, prod.decide("file:///data/data/app.bangkee/shared_prefs/x.xml", true));
        assertEquals(BLOCK, prod.decide("content://app.bangkee.fileprovider/captured_images/x.jpg", true));
        assertEquals(BLOCK, prod.decide("intent://scan/#Intent;scheme=zxing;package=com.evil;end", true));
        assertEquals(BLOCK, prod.decide("data:text/html,<script>alert(1)</script>", true));
        assertEquals(BLOCK, prod.decide("market://details?id=com.evil", true));
        assertEquals(BLOCK, prod.decide("about:blank", true));
        assertEquals(BLOCK, prod.decide("not a url", true));
        assertEquals(BLOCK, prod.decide(null, true));
    }

    @Test
    public void onlyTheAppsOwnBlobUrlsLoad() {
        assertEquals(IN_APP, prod.decide("blob:https://bangkee.app/3f0c1f8e-0000-4000-8000-000000000000", true));
        assertEquals(BLOCK, prod.decide("blob:https://evil.example/3f0c1f8e-0000-4000-8000-000000000000", true));
    }

    @Test
    public void appLinksOpenTheSamePathOnTheAppOrigin() {
        assertEquals("https://bangkee.app/passwords/tok123/edit",
            prod.deepLinkTarget("https://bangkee.app/passwords/tok123/edit", "bangkee.app"));
        assertEquals("https://bangkee.app/join/abc?x=1#y",
            prod.deepLinkTarget("https://bangkee.app/join/abc?x=1#y", "bangkee.app"));
        assertEquals("https://bangkee.app/", prod.deepLinkTarget("https://bangkee.app", "bangkee.app"));
        // A debug build sends production links to the development server.
        assertEquals("http://localhost:5173/join/abc",
            dev.deepLinkTarget("https://bangkee.app/join/abc", "bangkee.app"));
    }

    @Test
    public void appLinksForOtherHostsAreIgnored() {
        assertNull(prod.deepLinkTarget("https://evil.example/join/abc", "bangkee.app"));
        assertNull(prod.deepLinkTarget("http://bangkee.app/join/abc", "bangkee.app"));
        assertNull(prod.deepLinkTarget("https://bangkee.app:8443/join/abc", "bangkee.app"));
        assertNull(prod.deepLinkTarget("https://bangkee.app@evil.example/", "bangkee.app"));
        assertNull(prod.deepLinkTarget(null, "bangkee.app"));
    }

    @Test
    public void smsBodyIsReadFromTheLink() {
        assertEquals("Hello there", NavigationPolicy.smsBody("sms:+97517123456?&body=Hello%20there"));
        assertEquals("Nu. 1,250 + tax", NavigationPolicy.smsBody("sms:+975?body=Nu.%201%2C250%20%2B%20tax"));
        assertNull(NavigationPolicy.smsBody("sms:+97517123456"));
    }

    @Test
    public void theOriginIsSchemeAndAuthority() {
        assertEquals("https://bangkee.app", prod.origin());
        assertEquals("http://localhost:5173", dev.origin());
        assertTrue(prod.isAppOrigin("https://bangkee.app/anything"));
    }
}
