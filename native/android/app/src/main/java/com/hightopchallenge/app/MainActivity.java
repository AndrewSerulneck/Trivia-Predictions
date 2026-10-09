package com.hightopchallenge.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.CookieManager;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Logger;
import java.lang.reflect.Method;
import java.util.Collections;
import java.util.Locale;

public class MainActivity extends BridgeActivity {

    // Capacitor injects its JS bridge only into the server.url origin
    // (play.hightopchallenge.com), although its message listener already accepts every
    // allowNavigation origin. The Partner Dashboard lives on the apex, so inject the same
    // bridge script there too (Phase 2A finding).
    //
    // Capacitor 8.5.3 has no public way to get that script, so this reads it through two
    // private methods (Bridge.getJSInjector → JSInjector.getScriptString). If a Capacitor
    // upgrade renames either, the injection fails and logs "apex bridge injection FAILED":
    // the partner pages still load, but the app's native features (Back button, browser
    // link-outs) stop working on them. tests/native-app-contract.test.ts pins the
    // Capacitor version below, so an upgrade must re-check this on the emulator first
    // (device checklist: "window.Capacitor on /owner/dashboard").
    static final String VERIFIED_CAPACITOR_ANDROID = "8.5.3";
    private static final String APEX_ORIGIN = "https://hightopchallenge.com";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Our own plugin must be registered before the bridge is created.
        registerPlugin(HightopShellPlugin.class);
        super.onCreate(savedInstanceState);
        // Phase 2E: offline page only for real network failures, "Try again" reloads the
        // failed page, link-out pages open in the browser (HightopWebViewClient).
        if (bridge != null) {
            bridge.setWebViewClient(new HightopWebViewClient(bridge));
        }
        injectBridgeOnApex();
    }

    // Phase 3: App Links (the join QR, a shared game link) open the app ON THAT PAGE.
    // Covers both cases: BridgeActivity.load() passes the launch intent through here on a
    // cold launch, and launchMode singleTask delivers a link here while the app runs.
    // super notifies @capacitor/app ("appUrlOpen"); loading the page is ours. The web's
    // front door treats it as a link launch, so a QR scan lands on the player sign-in
    // (Andrew's QR rule, lib/appFrontDoor.ts).
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        openAppLink(intent);
    }

    /** Loads an https link to the app's own host (server.url); ignores everything else. */
    private void openAppLink(Intent intent) {
        if (bridge == null || intent == null || !Intent.ACTION_VIEW.equals(intent.getAction())) return;
        Uri link = intent.getData();
        if (link == null || !"https".equalsIgnoreCase(link.getScheme())) return;
        String appHost = Uri.parse(bridge.getServerUrl() != null ? bridge.getServerUrl() : bridge.getAppUrl()).getHost();
        String host = link.getHost();
        if (appHost == null || host == null || !appHost.toLowerCase(Locale.ROOT).equals(host.toLowerCase(Locale.ROOT))) {
            Logger.info("Hightop", "ignored app link " + link);
            return;
        }
        Logger.info("Hightop", "opening app link " + link);
        bridge.getWebView().post(() -> bridge.getWebView().loadUrl(link.toString()));
    }

    // Android's CookieManager writes cookies to disk lazily (~30 s). Capacitor never
    // flushes, so a player who signs in and swipes the app away within seconds came back
    // signed out (Phase 2A). Flush whenever the app leaves the foreground.
    @Override
    public void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }

    private void injectBridgeOnApex() {
        if (bridge == null || !WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            Logger.warn("Hightop", "apex bridge injection skipped: DOCUMENT_START_SCRIPT unsupported");
            return;
        }
        try {
            Method getInjector = bridge.getClass().getDeclaredMethod("getJSInjector");
            getInjector.setAccessible(true);
            Object injector = getInjector.invoke(bridge);
            Method getScript = injector.getClass().getDeclaredMethod("getScriptString");
            getScript.setAccessible(true);
            String script = (String) getScript.invoke(injector);
            WebViewCompat.addDocumentStartJavaScript(bridge.getWebView(), script, Collections.singleton(APEX_ORIGIN));
            Logger.info("Hightop", "apex bridge injected");
        } catch (Exception ex) {
            Logger.error("Hightop", "apex bridge injection FAILED (Capacitor changed? verified on " + VERIFIED_CAPACITOR_ANDROID + ")", ex);
        }
    }
}
