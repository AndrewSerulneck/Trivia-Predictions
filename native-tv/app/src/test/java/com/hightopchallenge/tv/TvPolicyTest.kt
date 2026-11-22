package com.hightopchallenge.tv

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TvPolicyTest {
    private val hosts = listOf("hightopchallenge.com", "www.hightopchallenge.com", "play.hightopchallenge.com")
    private val policy = TvUrlPolicy(hosts)

    // ---- user-agent ----

    @Test
    fun userAgentAppendsTheTvTokenOnly() {
        val ua = tvUserAgent("Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7633; wv) Chrome/130.0 Mobile Safari/537.36", "1.0.0")
        assertTrue(ua.endsWith(" HightopChallengeTV/1.0.0"))
        assertFalse("never the phone app's token", ua.contains("HightopChallenge" + "App/"))
        // The exact pattern lib/tvApp.ts parses.
        assertEquals("1.0.0", Regex("""HightopChallengeTV/(\d+(?:\.\d+){0,2})""").find(ua)?.groupValues?.get(1))
    }

    @Test
    fun userAgentNeverDoublesTheToken() {
        val once = tvUserAgent("Base/1.0", "1.0.0")
        val twice = tvUserAgent(once, "1.0.1")
        assertEquals("Base/1.0 HightopChallengeTV/1.0.1", twice)
    }

    // ---- page allow-list ----

    @Test
    fun allowsHttpsPagesOnTheSiteHosts() {
        assertTrue(policy.allowsPage("https://hightopchallenge.com/tv-app"))
        assertTrue(policy.allowsPage("https://hightopchallenge.com/tv-app?change=1"))
        assertTrue(policy.allowsPage("https://www.hightopchallenge.com/tv/K7P2"))
        assertTrue(policy.allowsPage("https://play.hightopchallenge.com/venue/abc-123/screen"))
        assertTrue(policy.allowsPage("https://HIGHTOPCHALLENGE.COM/tv-app"))
        assertTrue(policy.allowsPage("https://hightopchallenge.com:443/tv-app"))
        assertTrue(policy.allowsPage("https://hightopchallenge.com"))
    }

    @Test
    fun blocksOtherSchemesHostsAndPorts() {
        assertFalse(policy.allowsPage("http://hightopchallenge.com/tv-app"))
        assertFalse(policy.allowsPage("https://evil.example/tv-app"))
        assertFalse(policy.allowsPage("https://hightopchallenge.com.evil.example/tv-app"))
        assertFalse(policy.allowsPage("https://evilhightopchallenge.com/tv-app"))
        assertFalse(policy.allowsPage("https://foo.hightopchallenge.com/tv-app"))
        assertFalse(policy.allowsPage("https://hightopchallenge.com:8443/tv-app"))
        assertFalse(policy.allowsPage("https://user@hightopchallenge.com/tv-app"))
        assertFalse(policy.allowsPage("intent://scan/#Intent;scheme=zxing;end"))
        assertFalse(policy.allowsPage("market://details?id=x"))
        assertFalse(policy.allowsPage("file:///sdcard/x.html"))
        assertFalse(policy.allowsPage("content://x/y"))
        assertFalse(policy.allowsPage("javascript:alert(1)"))
        assertFalse(policy.allowsPage("about:blank"))
        assertFalse(policy.allowsPage(""))
        assertFalse(policy.allowsPage("not a url"))
    }

    @Test
    fun blocksPartnerAndAdminPages() {
        assertFalse(policy.allowsPage("https://hightopchallenge.com/owner"))
        assertFalse(policy.allowsPage("https://hightopchallenge.com/owner/login?next=/owner/display"))
        assertFalse(policy.allowsPage("https://hightopchallenge.com/Owner/display"))
        assertFalse(policy.allowsPage("https://play.hightopchallenge.com/admin/questions"))
        assertTrue("only whole path segments", policy.allowsPage("https://hightopchallenge.com/ownership-faq"))
    }

    @Test
    fun releaseBuildsNeverAllowTheDevServer() {
        assertFalse(policy.allowsPage("http://10.0.2.2:3117/tv-app"))
    }

    @Test
    fun debugDevOriginAllowsExactlyThatOrigin() {
        val dev = TvUrlPolicy(hosts, "http://10.0.2.2:3117/tv-app")
        assertTrue(dev.allowsPage("http://10.0.2.2:3117/tv-app/demo"))
        assertTrue(dev.allowsPage("http://10.0.2.2:3117/venue/v1/screen"))
        assertFalse(dev.allowsPage("http://10.0.2.2:3000/tv-app"))
        assertFalse(dev.allowsPage("http://10.0.2.2:3117/owner/display"))
        assertTrue(dev.allowsPage("https://hightopchallenge.com/tv-app"))
    }

    @Test
    fun framesAllowWebContentOnly() {
        assertTrue(policy.allowsFrame("https://www.youtube.com/embed/x"))
        assertTrue(policy.allowsFrame("about:blank"))
        assertFalse(policy.allowsFrame("http://example.com/"))
        assertFalse(policy.allowsFrame("intent://x#Intent;end"))
        assertFalse(policy.allowsFrame("file:///x"))
    }

    // ---- remote Back ----

    @Test
    fun backLeavesTheDemoButExitsFromConnectAndDisplay() {
        assertEquals(BackAction.GO_BACK, backActionFor("https://hightopchallenge.com/tv-app/demo"))
        assertEquals(BackAction.EXIT, backActionFor("https://hightopchallenge.com/tv-app"))
        assertEquals(BackAction.EXIT, backActionFor("https://hightopchallenge.com/tv-app?change=1"))
        assertEquals(BackAction.EXIT, backActionFor("https://play.hightopchallenge.com/venue/v1/screen"))
        assertEquals(BackAction.EXIT, backActionFor(null))
        assertEquals(BackAction.EXIT, backActionFor("::"))
    }

    @Test
    fun changeVenueUrlAddsTheForgetFlag() {
        assertEquals("https://hightopchallenge.com/tv-app?change=1", changeVenueUrl("https://hightopchallenge.com/tv-app"))
        assertEquals("http://10.0.2.2:3117/tv-app?change=1", changeVenueUrl("http://10.0.2.2:3117/tv-app?x=1#y"))
    }

    // ---- bridge input ----

    @Test
    fun storesOnlyPlainVenueIds() {
        assertTrue(isStorableVenueId("3f0c5a1e-9b2d-4c1a-8f7e-0a1b2c3d4e5f"))
        assertTrue(isStorableVenueId("venue_1"))
        assertFalse(isStorableVenueId(null))
        assertFalse(isStorableVenueId(""))
        assertFalse(isStorableVenueId("a".repeat(101)))
        assertFalse(isStorableVenueId("../x"))
        assertFalse(isStorableVenueId("<script>"))
        assertFalse(isStorableVenueId("vénue"))
    }

    // ---- retry and staleness ----

    @Test
    fun retryBacksOffToThirtySeconds() {
        assertEquals(listOf(2_000L, 4_000L, 8_000L, 16_000L, 30_000L, 30_000L), (0..5).map { retryDelayMs(it) })
        assertEquals(30_000L, retryDelayMs(500))
        assertEquals(2_000L, retryDelayMs(-3))
    }

    @Test
    fun reloadsOnlyAfterFiveMinutesAway() {
        assertFalse(isStaleAfterBackground(0, 10_000_000))
        assertFalse(isStaleAfterBackground(1_000, 1_000 + 299_999))
        assertTrue(isStaleAfterBackground(1_000, 1_000 + 300_000))
    }

    @Test
    fun onlyServerErrorsCountAsAnOutage() {
        assertFalse(isServerOutage(404))
        assertTrue(isServerOutage(500))
        assertTrue(isServerOutage(503))
    }
}
