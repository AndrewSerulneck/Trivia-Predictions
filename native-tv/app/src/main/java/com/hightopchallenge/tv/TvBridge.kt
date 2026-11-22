package com.hightopchallenge.tv

import android.content.SharedPreferences
import android.webkit.JavascriptInterface

/**
 * `window.HightopTV` (lib/tvApp.ts). Remembers the connected venue in the app's own storage, so the TV goes straight
 * to its display even if the WebView's localStorage is cleared. It holds a venue id only: no session, no secret
 * (plan D9). Called on a WebView background thread; SharedPreferences is thread-safe.
 */
class TvBridge(private val prefs: SharedPreferences) {
    @JavascriptInterface
    fun getVenueId(): String? = prefs.getString(KEY_VENUE_ID, null)?.takeIf { isStorableVenueId(it) }

    @JavascriptInterface
    fun setVenueId(venueId: String?) {
        val value = venueId?.trim()
        if (isStorableVenueId(value)) prefs.edit().putString(KEY_VENUE_ID, value).apply()
    }

    @JavascriptInterface
    fun clearVenueId() {
        prefs.edit().remove(KEY_VENUE_ID).apply()
    }

    companion object {
        const val PREFS_NAME = "hightop_tv"
        const val KEY_VENUE_ID = "venue_id"
    }
}
