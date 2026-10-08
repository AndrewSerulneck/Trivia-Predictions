package com.hightopchallenge.clover

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.clover.sdk.util.CloverAuth
import com.clover.sdk.v1.Intents
import com.clover.sdk.v3.scanner.BarcodeResult
import com.clover.sdk.v3.scanner.BarcodeScanner
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * Shared spike plumbing: an on-screen log (mirrored to logcat tag "HightopSpike", collect with
 * `adb logcat -s HightopSpike`), a background executor, the Clover token proof (fact 1) and the
 * barcode receiver (fact 3). The Clover token itself is NEVER shown or logged: only its length and
 * the first 8 hex chars of its SHA-256, which is enough to tell two tokens apart.
 */
abstract class SpikeActivity : Activity() {
    protected val io = Executors.newSingleThreadExecutor()
    private lateinit var logView: TextView
    protected lateinit var buttons: LinearLayout
    private val clock = SimpleDateFormat("HH:mm:ss", Locale.US)

    private val barcodeReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val result = BarcodeResult(intent)
            if (!result.isBarcodeAction) return
            log(
                "SCAN type=${result.type} impl=${result.scannerImpl} qr=${result.isQRCode} " +
                    "code128=${result.isCode128} value='${result.barcode}'"
            )
            onBarcode(result.barcode)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(24, 24, 24, 24) }
        buttons = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        logView = TextView(this).apply { textSize = 13f; setTextIsSelectable(true) }
        root.addView(buttons)
        root.addView(ScrollView(this).apply { addView(logView) }, ViewGroup.LayoutParams(-1, -1))
        setContentView(root)
        log(
            "device model=${Build.MODEL} manufacturer=${Build.MANUFACTURER} sdk=${Build.VERSION.SDK_INT} " +
                "release=${Build.VERSION.RELEASE} display=${Build.DISPLAY} pkg=$packageName"
        )
    }

    override fun onResume() {
        super.onResume()
        registerReceiver(barcodeReceiver, IntentFilter(BarcodeResult.INTENT_ACTION))
    }

    override fun onPause() {
        unregisterReceiver(barcodeReceiver)
        super.onPause()
    }

    override fun onDestroy() {
        io.shutdownNow()
        super.onDestroy()
    }

    protected open fun onBarcode(value: String?) {}

    protected fun button(label: String, action: () -> Unit) {
        buttons.addView(Button(this).apply { text = label; setOnClickListener { action() } })
    }

    protected fun log(line: String) {
        Log.i("HightopSpike", line)
        runOnUiThread { logView.append("${clock.format(Date())}  $line\n") }
    }

    protected fun background(label: String, work: () -> Unit) {
        io.execute {
            try {
                work()
            } catch (e: Throwable) {
                log("$label FAILED: ${e.javaClass.simpleName}: ${e.message}")
            }
        }
    }

    protected fun startScanner() {
        val extras = Bundle().apply {
            putBoolean(Intents.EXTRA_SCAN_QR_CODE, true)
            putBoolean(Intents.EXTRA_SCAN_1D_CODE, true)
            putBoolean(Intents.EXTRA_LED_ON, false)
        }
        val scanner = BarcodeScanner(this)
        background("scanner") {
            log("scanner facings available=${scanner.available}")
            scanner.executeStartScan(extras)
            log("scanner started (point it at the coupon on a phone screen)")
        }
    }

    /**
     * Fact 1. Gets a fresh Clover token (Clover: never store it) and asks Clover's REST API whether
     * it is OUR app's token for THIS merchant. billing_info is app-scoped: on 2026-10-05 a merchant
     * test API token (not tied to any app) got 401 there, and a wrong app id got 404. The device run
     * must show 200 for our token + our app id, and non-200 for the negative controls.
     */
    protected fun proveTokenServerSide() = background("token proof") {
        val started = System.currentTimeMillis()
        val auth = CloverAuth.authenticate(this, false, 60L, TimeUnit.SECONDS)
        val ms = System.currentTimeMillis() - started
        val token = auth.authToken
        if (token == null) {
            log("authenticate: NO TOKEN after ${ms}ms error=${auth.errorMessage}")
            return@background
        }
        log(
            "authenticate: ok in ${ms}ms merchantId=${auth.merchantId} appId=${auth.appId} " +
                "baseUrl=${auth.baseUrl} token.len=${token.length} token.sha256[0..8]=${sha8(token)}"
        )
        val base = auth.baseUrl?.trimEnd('/') ?: "https://apisandbox.dev.clover.com"
        val m = auth.merchantId
        val a = auth.appId
        listOf(
            "merchant read (expect 200)" to "/v3/merchants/$m",
            "billing_info our app (expect 200)" to "/v3/apps/$a/merchants/$m/billing_info",
            "billing_info wrong app (expect 404/401)" to "/v3/apps/AAAAAAAAAAAAA/merchants/$m/billing_info",
            "billing_info wrong merchant (expect 401/403)" to "/v3/apps/$a/merchants/AAAAAAAAAAAAA/billing_info",
        ).forEach { (label, path) ->
            val (status, body) = get(base + path, token)
            log("REST $label -> $status ${body.take(160)}")
        }
        val again = CloverAuth.authenticate(this, false, 60L, TimeUnit.SECONDS)
        log("second authenticate: same token=${again.authToken == token} sha256[0..8]=${again.authToken?.let(::sha8)}")
    }

    private fun get(url: String, token: String): Pair<Int, String> {
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.connectTimeout = 15000
        conn.readTimeout = 15000
        conn.setRequestProperty("Authorization", "Bearer $token")
        conn.setRequestProperty("Accept", "application/json")
        return try {
            val status = conn.responseCode
            val stream = if (status in 200..299) conn.inputStream else conn.errorStream
            status to (stream?.bufferedReader()?.use { it.readText() } ?: "")
        } finally {
            conn.disconnect()
        }
    }

    private fun sha8(value: String): String =
        MessageDigest.getInstance("SHA-256").digest(value.toByteArray())
            .joinToString("") { "%02x".format(it) }.take(8)
}
