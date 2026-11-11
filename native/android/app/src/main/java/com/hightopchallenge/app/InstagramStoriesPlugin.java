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
 * An animated Story (docs/share-win-celebration-plan.md Phases 3 and 3.2): the web writes the MP4 to
 * cache/hightop-share/ with @capacitor/filesystem (in pieces, keeping one video at most) and sends only its
 * file:// URI as "path", never base64; this plugin shares only files inside that folder, as video/mp4
 * (Meta: H.264, up to 20 s; ours is 5 s, about 4 MB), and writes no video of its own. isAvailable answers
 * "videoFile" from whether Instagram takes a video/mp4 Story, so the web side knows this build reads a
 * path; older builds don't answer it, and the website sends their videos through the share sheet.
 */
@CapacitorPlugin(name = "InstagramStories")
public class InstagramStoriesPlugin extends Plugin {

    private static final String INSTAGRAM_PACKAGE = "com.instagram.android";
    private static final String ADD_TO_STORY = "com.instagram.share.ADD_TO_STORY";
    private static final String SHARE_FOLDER = "hightop-share";
    private static final String PICTURE_FILE = "instagram-story.png";
    private static final String PICTURE_TYPE = "image/png";
    private static final String VIDEO_TYPE = "video/mp4";

    private Intent storyIntent(Uri media, String mimeType, String topColor, String bottomColor) {
        Intent intent = new Intent(ADD_TO_STORY);
        intent.setPackage(INSTAGRAM_PACKAGE);
        intent.putExtra("source_application", getConfig().getString("facebookAppId", ""));
        if (media != null) {
            intent.setDataAndType(media, mimeType);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } else {
            intent.setType(mimeType);
        }
        intent.putExtra("top_background_color", topColor);
        intent.putExtra("bottom_background_color", bottomColor);
        return intent;
    }

    private boolean instagramCanTakeStory(String mimeType) {
        Activity activity = getActivity();
        String appId = getConfig().getString("facebookAppId", "");
        return activity != null && appId != null && !appId.isEmpty()
            && activity.getPackageManager().resolveActivity(storyIntent(null, mimeType, "#020617", "#020617"), 0) != null;
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        boolean available = instagramCanTakeStory(PICTURE_TYPE);
        JSObject result = new JSObject();
        result.put("available", available);
        result.put("videoFile", available && instagramCanTakeStory(VIDEO_TYPE));
        call.resolve(result);
    }

    /** The video the web wrote, only if it is an existing file inside cache/hightop-share/ (symlinks and .. resolved). */
    private File shareFolderFile(Activity activity, String path) throws IOException {
        if (path == null || path.isEmpty()) return null;
        Uri uri = Uri.parse(path);
        if (!"file".equals(uri.getScheme()) || uri.getPath() == null) return null;
        File file = new File(uri.getPath());
        String folder = new File(activity.getCacheDir(), SHARE_FOLDER).getCanonicalPath() + File.separator;
        return file.getCanonicalPath().startsWith(folder) && file.isFile() ? file : null;
    }

    @PluginMethod
    public void shareToStory(PluginCall call) {
        boolean isVideo = "video".equals(call.getString("mediaType", "image"));
        String mimeType = isVideo ? VIDEO_TYPE : PICTURE_TYPE;
        String data = isVideo ? call.getString("path", "") : call.getString("data", "");
        if (data == null || data.isEmpty()) {
            call.reject(isVideo ? "A video is required." : "A picture is required.");
            return;
        }
        if (!instagramCanTakeStory(mimeType)) {
            call.reject("Instagram is not installed.", "NOT_INSTALLED");
            return;
        }
        Activity activity = getActivity();
        Uri media;
        try {
            File file;
            if (isVideo) {
                file = shareFolderFile(activity, data);
                if (file == null) throw new IOException("The video is not in the share folder.");
            } else {
                File folder = new File(activity.getCacheDir(), SHARE_FOLDER);
                if (!folder.isDirectory() && !folder.mkdirs()) throw new IOException("Could not create the share folder.");
                file = new File(folder, PICTURE_FILE);
                try (FileOutputStream out = new FileOutputStream(file)) {
                    out.write(Base64.decode(data, Base64.DEFAULT));
                }
            }
            media = FileProvider.getUriForFile(activity, activity.getPackageName() + ".fileprovider", file);
        } catch (IllegalArgumentException | IOException ex) {
            call.reject(isVideo ? "Could not prepare the video." : "Could not prepare the picture.", ex);
            return;
        } catch (OutOfMemoryError ex) {
            // A low-memory phone: decoding a large picture is an Error, not an Exception, and would crash the app.
            call.reject("Could not prepare the picture.");
            return;
        }
        Intent intent = storyIntent(media, mimeType, call.getString("topColor", "#020617"), call.getString("bottomColor", "#020617"));
        activity.grantUriPermission(INSTAGRAM_PACKAGE, media, Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            activity.startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException ex) {
            call.reject("Instagram is not installed.", "NOT_INSTALLED", ex);
        }
    }
}
