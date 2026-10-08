package com.hightopchallenge.clover

import android.os.Bundle

/** Opened from the Clover launcher. Facts 1 and 3 (no order needed). */
class MainActivity : SpikeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        log("Opened from the launcher: no order id. Fact 2/4 run from the Register order screen ('Hightop Reward').")
        button("1. Clover token + server-side proof") { proveTokenServerSide() }
        button("3. Scan a code (QR or Code 128)") { startScanner() }
    }
}
