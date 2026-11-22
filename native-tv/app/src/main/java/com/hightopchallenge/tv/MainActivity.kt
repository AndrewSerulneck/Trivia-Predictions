package com.hightopchallenge.tv

import android.annotation.SuppressLint
import android.annotation.TargetApi
import android.app.Activity
import android.app.AlertDialog
import android.content.SharedPreferences
import android.graphics.Bitmap
import android.graphics.Color
import android.net.ConnectivityManager
import android.net.Network
import android.net.http.SslError
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.ConsoleMessage
import android.webkit.RenderProcessGoneDetail
import android.webkit.SslErrorHandler
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button

/**
 * Hightop Challenge TV (docs/fire-tv-app-plan.md Phase 4): one full-screen WebView on /tv-app. Every screen is a page
 * on the website (plan D5); this shell adds only what a browser tab can't do (plan D7):
 *  - the screen never sleeps (FLAG_KEEP_SCREEN_ON while visible),
 *  - a native "Can't connect." screen that retries by itself,
 *  - remote handling: Back leaves Try demo or the app, Menu offers Change venue and Reload,
 *  - the remembered venue in app storage (window.HightopTV, lib/tvApp.ts).
 */
class MainActivity : Activity() {
    private lateinit var webView: WebView
    private lateinit var offline: View
    private lateinit var retryButton: Button
    private lateinit var prefs: SharedPreferences

    private val handler = Handler(Looper.getMainLooper())
    private val policy by lazy { TvUrlPolicy(BuildConfig.SITE_HOSTS.split(","), BuildConfig.DEV_ORIGIN) }
    private var connectivity: ConnectivityManager? = null
    private var networkCallback: ConnectivityManager.NetworkCallback? = null

    /** The page to load on the next retry: the one that failed, or the one on screen when the network dropped. */
    private var pendingUrl: String = BuildConfig.START_URL
    private var loadingUrl: String? = null
    private var mainFrameFailed = false
    private var retryAttempt = 0
    private var pausedAtMs = 0L

    private val retryRunnable = Runnable { retryNow() }
    private val networkLostRunnable = Runnable { if (!hasNetwork()) showOffline(webView.url) }

    @SuppressLint("SetJavaScriptEnabled", "JavascriptInterface")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.web)
        offline = findViewById(R.id.offline)
        retryButton = findViewById(R.id.retry)
        retryButton.setOnClickListener { retryAttempt = 0; retryNow() }
        prefs = getSharedPreferences(TvBridge.PREFS_NAME, MODE_PRIVATE)

        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        webView.setBackgroundColor(Color.parseColor(CANVAS))
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            // The intro stinger's sound plays without a tap (docs/venue-display-hype-and-intro-stinger-plan.md).
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            setSupportMultipleWindows(false)
            javaScriptCanOpenWindowsAutomatically = false
            setGeolocationEnabled(false)
            // The TV screens are laid out for 1920×1080; a large system font size must not reflow them.
            textZoom = 100
            userAgentString = tvUserAgent(userAgentString, BuildConfig.VERSION_NAME)
        }
        webView.addJavascriptInterface(TvBridge(prefs), TV_BRIDGE_NAME)
        webView.webViewClient = ShellClient()
        webView.webChromeClient = ShellChromeClient()

        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            load(BuildConfig.START_URL)
        }
        webView.requestFocus()
        watchNetwork()
    }

    // ---- loading and the "Can't connect." screen ----

    private fun load(url: String) {
        pendingUrl = url
        webView.loadUrl(url)
    }

    private fun retryNow() {
        handler.removeCallbacks(retryRunnable)
        load(pendingUrl)
    }

    private fun isOfflineShown() = offline.visibility == View.VISIBLE

    private fun showOffline(failedUrl: String?) {
        if (!failedUrl.isNullOrBlank() && !failedUrl.startsWith("about:")) pendingUrl = failedUrl
        handler.removeCallbacks(retryRunnable)
        handler.postDelayed(retryRunnable, retryDelayMs(retryAttempt))
        retryAttempt += 1
        if (!isOfflineShown()) {
            offline.visibility = View.VISIBLE
            retryButton.requestFocus()
        }
    }

    private fun hideOffline() {
        handler.removeCallbacks(retryRunnable)
        retryAttempt = 0
        if (isOfflineShown()) {
            offline.visibility = View.GONE
            webView.requestFocus()
        }
    }

    private fun hasNetwork(): Boolean = try {
        connectivity?.activeNetwork != null
    } catch (_: SecurityException) {
        true
    }

    private fun watchNetwork() {
        val manager = getSystemService(ConnectivityManager::class.java) ?: return
        connectivity = manager
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                handler.post {
                    handler.removeCallbacks(networkLostRunnable)
                    if (isOfflineShown()) {
                        retryAttempt = 0
                        retryNow()
                    }
                }
            }

            override fun onLost(network: Network) {
                handler.post {
                    handler.removeCallbacks(networkLostRunnable)
                    handler.postDelayed(networkLostRunnable, NETWORK_LOSS_GRACE_MS)
                }
            }
        }
        try {
            manager.registerDefaultNetworkCallback(callback)
            networkCallback = callback
        } catch (error: RuntimeException) {
            Log.w(TAG, "Network watch unavailable", error)
        }
    }

    private inner class ShellClient : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val url = request.url.toString()
            val allowed = if (request.isForMainFrame) policy.allowsPage(url) else policy.allowsFrame(url)
            if (!allowed) Log.w(TAG, "Blocked navigation: $url")
            return !allowed
        }

        override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
            loadingUrl = url
            mainFrameFailed = false
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (!request.isForMainFrame) return
            mainFrameFailed = true
            showOffline(request.url.toString())
        }

        override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, response: WebResourceResponse) {
            if (!request.isForMainFrame || !isServerOutage(response.statusCode)) return
            mainFrameFailed = true
            showOffline(request.url.toString())
        }

        @SuppressLint("WebViewClientOnReceivedSslError")
        override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) {
            // Never proceed past a certificate error.
            handler.cancel()
            if (error.url != null && error.url == loadingUrl) {
                mainFrameFailed = true
                showOffline(error.url)
            }
        }

        override fun onPageFinished(view: WebView, url: String?) {
            if (!mainFrameFailed) hideOffline()
        }

        // A crashed or killed page renderer would otherwise take the app down with it; start over instead.
        // Android calls this on API 26+ only.
        @TargetApi(Build.VERSION_CODES.O)
        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
            Log.w(TAG, "Renderer gone (crash=${detail.didCrash()}); restarting")
            (view.parent as? ViewGroup)?.removeView(view)
            view.destroy()
            recreate()
            return true
        }
    }

    private class ShellChromeClient : WebChromeClient() {
        override fun onConsoleMessage(message: ConsoleMessage): Boolean {
            if (BuildConfig.DEBUG) Log.d(TAG, "console ${message.messageLevel()}: ${message.message()}")
            return BuildConfig.DEBUG
        }
    }

    // ---- remote buttons ----

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        when (event.keyCode) {
            KeyEvent.KEYCODE_MENU -> {
                if (event.action == KeyEvent.ACTION_UP && !event.isCanceled) showMenu()
                return true
            }
            KeyEvent.KEYCODE_BACK -> {
                if (event.action == KeyEvent.ACTION_UP && !event.isCanceled) handleBack()
                return true
            }
        }
        return super.dispatchKeyEvent(event)
    }

    private fun handleBack() {
        if (isOfflineShown()) {
            finish()
            return
        }
        if (BuildConfig.DEBUG) Log.d(TAG, "Back on ${webView.url} (canGoBack=${webView.canGoBack()})")
        when (backActionFor(webView.url)) {
            BackAction.GO_BACK -> if (webView.canGoBack()) webView.goBack() else load(BuildConfig.START_URL)
            BackAction.EXIT -> finish()
        }
    }

    private fun showMenu() {
        val items = arrayOf(getString(R.string.menu_change_venue), getString(R.string.menu_reload))
        AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setItems(items) { _, which ->
                when (which) {
                    0 -> changeVenue()
                    1 -> reloadPage()
                }
            }
            .show()
            .listView
            ?.apply {
                // Highlight "Change venue" at once: the remote needs a visible focus before the first press.
                setSelection(0)
                requestFocus()
            }
    }

    private fun changeVenue() {
        // The app's copy first; `?change=1` makes the page forget its localStorage copy too.
        prefs.edit().remove(TvBridge.KEY_VENUE_ID).apply()
        retryAttempt = 0
        load(changeVenueUrl(BuildConfig.START_URL))
    }

    private fun reloadPage() {
        retryAttempt = 0
        if (isOfflineShown() || webView.url.isNullOrBlank()) retryNow() else webView.reload()
    }

    // ---- lifecycle ----

    override fun onResume() {
        super.onResume()
        webView.onResume()
        webView.resumeTimers()
        if (isStaleAfterBackground(pausedAtMs, SystemClock.elapsedRealtime()) && !isOfflineShown()) webView.reload()
        pausedAtMs = 0L
    }

    override fun onPause() {
        // Stops the page's polling while the app is in the background: a TV on the Home screen costs nothing.
        webView.onPause()
        webView.pauseTimers()
        pausedAtMs = SystemClock.elapsedRealtime()
        super.onPause()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        networkCallback?.let { callback ->
            try {
                connectivity?.unregisterNetworkCallback(callback)
            } catch (_: RuntimeException) {
                // Already unregistered.
            }
        }
        networkCallback = null
        if (::webView.isInitialized && webView.parent != null) {
            (webView.parent as? ViewGroup)?.removeView(webView)
            webView.destroy()
        }
        super.onDestroy()
    }

    private companion object {
        const val TAG = "HightopTV"
        const val CANVAS = "#020617"
    }
}
