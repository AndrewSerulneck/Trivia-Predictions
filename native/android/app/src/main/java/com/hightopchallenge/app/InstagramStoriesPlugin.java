package com.hightopchallenge.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;

/**
 * Instagram Story straight from the app (docs/native-app-store-plan.md Phase 9d): Meta's
 * "Sharing to Stories". The picture is written to the app cache, shared through the app's
 * FileProvider (${applicationId}.fileprovider, res/xml/file_paths.xml cache-path) with the
 * com.instagram.share.ADD_TO_STORY intent and the Meta App ID as source_application (public;
 * plugins.InstagramStories.facebookAppId in capacitor.config.json). AndroidManifest.xml
 * declares <queries> for com.instagram.android, or Android 11+ can't see Instagram.
 * Read by lib/nativeInstagramStories.ts; same plugin and methods on iOS
 * (InstagramStoriesPlugin.swift). Registered in MainActivity.
 */
@CapacitorPlugin(name = "InstagramStories")
public class InstagramStoriesPlugin extends Plugin {

    private static final String INSTAGRAM_PACKAGE = "com.instagram.android";
    private static final String ADD_TO_STORY = "com.instagram.share.ADD_TO_STORY";
    private static final String SHARE_FOLDER = "hightop-share";
    private static final String FILE_NAME = "instagram-story.png";

    private Intent storyIntent(Uri picture, String topColor, String bottomColor) {
        Intent intent = new Intent(ADD_TO_STORY);
        intent.setPackage(INSTAGRAM_PACKAGE);
        intent.putExtra("source_application", getConfig().getString("facebookAppId", ""));
        if (picture != null) {
            intent.setDataAndType(picture, "image/png");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } else {
            intent.setType("image/png");
        }
        intent.putExtra("top_background_color", topColor);
        intent.putExtra("bottom_background_color", bottomColor);
        return intent;
    }

    private boolean instagramCanTakeStory() {
        Activity activity = getActivity();
        String appId = getConfig().getString("facebookAppId", "");
        return activity != null && appId != null && !appId.isEmpty()
            && activity.getPackageManager().resolveActivity(storyIntent(null, "#020617", "#020617"), 0) != null;
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", instagramCanTakeStory());
        call.resolve(result);
    }

    @PluginMethod
    public void shareToStory(PluginCall call) {
        String data = call.getString("data", "");
        if (data == null || data.isEmpty()) {
            call.reject("A picture is required.");
            return;
        }
        if (!instagramCanTakeStory()) {
            call.reject("Instagram is not installed.", "NOT_INSTALLED");
            return;
        }
        Activity activity = getActivity();
        Uri picture;
        try {
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            File folder = new File(activity.getCacheDir(), SHARE_FOLDER);
            if (!folder.isDirectory() && !folder.mkdirs()) throw new IOException("Could not create the share folder.");
            File file = new File(folder, FILE_NAME);
            try (FileOutputStream out = new FileOutputStream(file)) {
                out.write(bytes);
            }
            picture = FileProvider.getUriForFile(activity, activity.getPackageName() + ".fileprovider", file);
        } catch (IllegalArgumentException | IOException ex) {
            call.reject("Could not prepare the picture.", ex);
            return;
        }
        Intent intent = storyIntent(picture, call.getString("topColor", "#020617"), call.getString("bottomColor", "#020617"));
        activity.grantUriPermission(INSTAGRAM_PACKAGE, picture, Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            activity.startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException ex) {
            call.reject("Instagram is not installed.", "NOT_INSTALLED", ex);
        }
    }
}
