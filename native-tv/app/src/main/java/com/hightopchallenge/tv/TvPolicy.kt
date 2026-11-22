package com.hightopchallenge.tv

import java.net.URI

// Pure rules for the TV shell (docs/fire-tv-app-plan.md Phase 4). No Android classes here, so every rule is covered
// by plain JVM unit tests (app/src/test).

/** The user-agent token lib/tvApp.ts reads. Never the phone app's token: proxy.ts would swap the display out. */
const val TV_UA_TOKEN = "HightopChallengeTV/"

/** Name of the JS bridge on `window` (lib/tvApp.ts `readBridge`). */
const val TV_BRIDGE_NAME = "HightopTV"

/** WebView default UA + ` HightopChallengeTV/<version>`, with any earlier TV token removed first. */
fun tvUserAgent(defaultUserAgent: String, versionName: String): String {
    val base = defaultUserAgent.replace(Regex("""\s*HightopChallengeTV/\S*"""), "").trim()
    return "$base $TV_UA_TOKEN$versionName".trim()
}

/** Paths a TV must never open: a TV sits in a public room and never holds a partner or admin session (plan D9). */
private val BLOCKED_PATH_PREFIXES = listOf("/owner", "/admin")

private fun matchesPrefix(path: String, prefix: String) = path == prefix || path.startsWith("$prefix/")

/**
 * Which pages may load in the WebView. Only https pages on the site's own hosts; everything else is blocked and
 * never handed to another app (a TV has no browser to open it in).
 *
 * `devOrigin` is a debug build's `-PtvStartUrl` (e.g. http://10.0.2.2:3117/tv-app): its exact scheme, host and port
 * are allowed too. Release builds pass "".
 */
class TvUrlPolicy(siteHosts: Collection<String>, devOrigin: String = "") {
    private val hosts = siteHosts.map { it.trim().lowercase() }.filter { it.isNotEmpty() }.toSet()
    private val dev: Origin? = parse(devOrigin)?.let { Origin.of(it) }

    /** A top-level navigation (link, redirect, `location.replace`). */
    fun allowsPage(url: String): Boolean {
        val uri = parse(url) ?: return false
        if (uri.rawUserInfo != null) return false
        val path = uri.rawPath.orEmpty().ifEmpty { "/" }
        if (BLOCKED_PATH_PREFIXES.any { matchesPrefix(path.lowercase(), it) }) return false
        if (dev != null && Origin.of(uri) == dev) return true
        val scheme = uri.scheme?.lowercase() ?: return false
        val host = uri.host?.lowercase() ?: return false
        return scheme == "https" && host in hosts && (uri.port == -1 || uri.port == 443)
    }

    /** An iframe navigation: web content only, never file:, content:, intent: or app links. */
    fun allowsFrame(url: String): Boolean {
        val scheme = parse(url)?.scheme?.lowercase() ?: return false
        return scheme == "https" || scheme == "about" || scheme == "data" || scheme == "blob" ||
            (dev != null && parse(url)?.let { Origin.of(it) } == dev)
    }

    private data class Origin(val scheme: String, val host: String, val port: Int) {
        companion object {
            fun of(uri: URI): Origin? {
                val scheme = uri.scheme?.lowercase() ?: return null
                val host = uri.host?.lowercase() ?: return null
                val port = when {
                    uri.port != -1 -> uri.port
                    scheme == "https" -> 443
                    scheme == "http" -> 80
                    else -> -1
                }
                return Origin(scheme, host, port)
            }
        }
    }

    private companion object {
        fun parse(url: String): URI? = try {
            if (url.isBlank()) null else URI(url.trim())
        } catch (_: Exception) {
            null
        }
    }
}

enum class BackAction { GO_BACK, EXIT }

/**
 * The remote's Back button. Inside a /tv-app sub-page (Try demo) it goes back; on the Connect screen and on the
 * display it leaves the app. Android never delivers Back to the page itself.
 */
fun backActionFor(url: String?): BackAction {
    val path = try {
        URI(url.orEmpty().trim()).rawPath.orEmpty()
    } catch (_: Exception) {
        ""
    }
    return if (path.startsWith("/tv-app/")) BackAction.GO_BACK else BackAction.EXIT
}

/** The Connect screen with "forget the remembered venue" (TvConnectScreen reads `?change=1`). */
fun changeVenueUrl(startUrl: String): String {
    val base = startUrl.substringBefore('#').substringBefore('?')
    return "$base?change=1"
}

/**
 * A venue id the bridge will store. `venues.id` is text; real ids are uuids or short slugs. Anything else is
 * refused, and the page still remembers the venue in its own localStorage.
 */
fun isStorableVenueId(value: String?): Boolean =
    value != null && value.length in 1..100 && value.all { it.isLetterOrDigit() && it.code < 128 || it == '-' || it == '_' }

/** Retry delays for the "Can't connect." screen: 2, 4, 8, 16, then 30 s for every later try. */
fun retryDelayMs(attempt: Int): Long {
    val safe = attempt.coerceIn(0, 10)
    return minOf(2_000L shl safe, MAX_RETRY_DELAY_MS)
}

const val MAX_RETRY_DELAY_MS = 30_000L

/** After this long in the background (Home, sleep, HDMI off) the page reloads on return: its code may be old. */
const val STALE_AFTER_BACKGROUND_MS = 5 * 60_000L

/** Wi-Fi blips shorter than this don't cover the display with "Can't connect.". */
const val NETWORK_LOSS_GRACE_MS = 10_000L

fun isStaleAfterBackground(pausedAtMs: Long, nowMs: Long): Boolean =
    pausedAtMs > 0 && nowMs - pausedAtMs >= STALE_AFTER_BACKGROUND_MS

/** A main-frame HTTP status that means "the site is down", not "this page doesn't exist". */
fun isServerOutage(statusCode: Int): Boolean = statusCode >= 500
