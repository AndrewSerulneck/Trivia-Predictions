package com.hightopchallenge.app;

import android.os.Bundle;
import android.webkit.CookieManager;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Logger;
import java.lang.reflect.Method;
import java.util.Collections;

public class MainActivity extends BridgeActivity {

    // SPIKE (native-app plan Phase 2A): Capacitor injects its JS bridge only into the
    // server.url origin (play.hightopchallenge.com), although its message listener already
    // accepts every allowNavigation origin. The Partner Dashboard lives on the apex, so
    // inject the same bridge script there too. Reflection is spike-only; Phase 3 should
    // replace it with a supported approach (see the Phase 2A handoff).
    private static final String APEX_ORIGIN = "https://hightopchallenge.com";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        injectBridgeOnApex();
    }

    // SPIKE finding (Phase 2A): Android's CookieManager writes cookies to disk lazily (~30 s).
    // Capacitor never flushes, so a player who signs in and swipes the app away within seconds
    // comes back signed out. Flush whenever the app leaves the foreground.
    @Override
    public void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }

    private void injectBridgeOnApex() {
        if (bridge == null || !WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
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
        } catch (Exception ex) {
            Logger.error("Hightop", "apex bridge injection failed", ex);
        }
    }
}
