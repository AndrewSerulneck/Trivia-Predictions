package com.hightopchallenge.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The page-callable side of the shell (`Capacitor.Plugins.HightopShell`), read by
 * lib/nativeApp.ts. `openInBrowser({ url })` opens an https URL in the phone's browser
 * and leaves the app where it is — partner billing, signup and /admin happen on the
 * website (docs/native-app-store-plan.md §2 item 2). Same plugin, same method on iOS
 * (HightopBridgeViewController.swift). Registered in MainActivity.
 */
@CapacitorPlugin(name = "HightopShell")
public class HightopShellPlugin extends Plugin {

    @PluginMethod
    public void openInBrowser(PluginCall call) {
        String raw = call.getString("url", "");
        Uri url = raw == null ? null : Uri.parse(raw);
        if (url == null || !"https".equalsIgnoreCase(url.getScheme())) {
            call.reject("An https URL is required.");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_VIEW, url).addCategory(Intent.CATEGORY_BROWSABLE);
        try {
            getActivity().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException ex) {
            call.reject("Could not open the browser.", ex);
        }
    }
}
