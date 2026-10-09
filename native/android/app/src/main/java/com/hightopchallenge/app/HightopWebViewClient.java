package com.hightopchallenge.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;
import com.getcapacitor.Logger;
import com.getcapacitor.PluginConfig;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The app's web view client (docs/native-app-store-plan.md Phase 2E). Same three jobs
 * as iOS's HightopBridgeViewController.swift, from the same config
 * (plugins.HightopShell in capacitor.config.json):
 *
 * 1. Marketing pages (`openInBrowser`) open in the phone's browser, not in the app.
 *    Legal pages stay in the app.
 * 2. The offline page (`offlinePage`) shows only for a real network failure. Capacitor's
 *    own `server.errorPath` also fired on HTTP errors (a 404/500 page read as
 *    "No connection"), so it is no longer set; super still runs, which keeps plugins'
 *    web view listeners (SystemBars uses one) informed.
 * 3. The offline page is told which page failed (`offline.html?url=…`), so "Try again"
 *    reloads that page instead of the start URL.
 *
 * The page is read from the APK's assets and loaded with loadDataWithBaseURL. Loading it
 * by URL does NOT work: Capacitor's local server serves the error page only when the URL
 * equals its errorPath URL exactly, so `offline.html?url=…` went to the network, failed
 * again, and looped until the app ran out of memory (seen on the emulator, Phase 2E).
 */
public class HightopWebViewClient extends BridgeWebViewClient {

    private final Bridge bridge;
    private final String offlinePage;
    private final String openInBrowserHost;
    private final List<String> openInBrowserPaths = new ArrayList<>();

    public HightopWebViewClient(Bridge bridge) {
        super(bridge);
        this.bridge = bridge;
        PluginConfig config = bridge.getConfig().getPluginConfiguration("HightopShell");
        this.offlinePage = config.getString("offlinePage", "");
        String host = "";
        JSONObject rule = config.getObject("openInBrowser");
        if (rule != null) {
            host = rule.optString("host", "").toLowerCase(Locale.ROOT);
            JSONArray paths = rule.optJSONArray("paths");
            if (paths != null) {
                for (int i = 0; i < paths.length(); i++) {
                    String path = paths.optString(i, "");
                    if (!path.isEmpty()) openInBrowserPaths.add(path);
                }
            }
        }
        this.openInBrowserHost = host;
    }

    /** `/` matches only the root; any other entry matches itself and everything below it. */
    boolean opensInBrowser(Uri url) {
        if (openInBrowserHost.isEmpty() || url == null) return false;
        if (!"https".equalsIgnoreCase(url.getScheme())) return false;
        String host = url.getHost();
        if (host == null || !openInBrowserHost.equals(host.toLowerCase(Locale.ROOT))) return false;
        String path = url.getPath();
        if (path == null || path.isEmpty()) path = "/";
        if (path.length() > 1 && path.endsWith("/")) path = path.substring(0, path.length() - 1);
        for (String entry : openInBrowserPaths) {
            if (path.equals(entry) || (!entry.equals("/") && path.startsWith(entry + "/"))) return true;
        }
        return false;
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        Uri url = request.getUrl();
        if (request.isForMainFrame() && opensInBrowser(url)) {
            try {
                view.getContext().startActivity(new Intent(Intent.ACTION_VIEW, url));
            } catch (ActivityNotFoundException ex) {
                Logger.error("Hightop", "no browser to open " + url, ex);
            }
            return true;
        }
        return super.shouldOverrideUrlLoading(view, request);
    }

    @Override
    public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
        super.onReceivedError(view, request, error);
        if (!request.isForMainFrame()) return;
        if (!isNetworkFailure(error.getErrorCode())) {
            Logger.info("Hightop", "ignored navigation failure " + error.getErrorCode());
            return;
        }
        showOfflinePage(view, request.getUrl());
    }

    /** Only these mean the phone couldn't reach us. */
    static boolean isNetworkFailure(int errorCode) {
        switch (errorCode) {
            case WebViewClient.ERROR_HOST_LOOKUP:
            case WebViewClient.ERROR_CONNECT:
            case WebViewClient.ERROR_TIMEOUT:
            case WebViewClient.ERROR_IO:
            case WebViewClient.ERROR_FAILED_SSL_HANDSHAKE:
                return true;
            default:
                return false;
        }
    }

    private void showOfflinePage(WebView view, Uri failed) {
        if (offlinePage.isEmpty()) return;
        String base = bridge.getScheme() + "://" + bridge.getHost() + "/" + offlinePage;
        // Never answer the offline page's own failure with itself.
        if (failed != null && failed.toString().startsWith(base)) return;
        String html = readAsset("public/" + offlinePage);
        if (html == null) return;
        Uri.Builder builder = Uri.parse(base).buildUpon();
        if (failed != null && "https".equalsIgnoreCase(failed.getScheme())) {
            builder.appendQueryParameter("url", failed.toString());
        }
        view.loadDataWithBaseURL(builder.build().toString(), html, "text/html", "utf-8", null);
    }

    private String readAsset(String path) {
        try (InputStream in = bridge.getContext().getAssets().open(path); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int read;
            while ((read = in.read(buffer)) != -1) out.write(buffer, 0, read);
            return out.toString(StandardCharsets.UTF_8.name());
        } catch (IOException ex) {
            Logger.error("Hightop", "offline page missing: " + path, ex);
            return null;
        }
    }
}
