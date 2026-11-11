import UIKit
import Capacitor

/// Instagram Story straight from the app (docs/native-app-store-plan.md Phase 9d): Meta's
/// "Sharing to Stories". The picture goes on the pasteboard under Instagram's key and
/// `instagram-stories://share?source_application=<Meta App ID>` opens the Story editor with it.
/// The App ID is public (plugins.InstagramStories.facebookAppId in capacitor.config.json);
/// `instagram-stories` must be in LSApplicationQueriesSchemes (Info.plist) or canOpenURL is false.
/// Writing the picture replaces the whole pasteboard, so the caption + link the share sheet copied
/// a moment earlier travels in the SAME item as plain text (Phase 9f.2): Paste in Instagram's link
/// sticker still finds it.
/// An animated Story (docs/share-win-celebration-plan.md Phases 3 and 3.2): `mediaType: "video"` puts the MP4
/// under `backgroundVideo` instead (Meta: H.264, up to 20 s, under 50 MB; ours is 5 s, about 4 MB). The web
/// writes the video to `<Caches>/hightop-share/` with @capacitor/filesystem and sends only its file URL as
/// `path` (never base64); this plugin reads only files inside that folder. `isAvailable` answers
/// `videoFile: true` so the web side knows this build reads a path; older builds don't, and the website
/// sends their videos through the share sheet.
/// Read by lib/nativeInstagramStories.ts; same plugin and methods on Android
/// (InstagramStoriesPlugin.java). Registered in HightopBridgeViewController.capacitorDidLoad.
@objc(InstagramStoriesPlugin)
public class InstagramStoriesPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "InstagramStoriesPlugin"
    public let jsName = "InstagramStories"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "shareToStory", returnType: CAPPluginReturnPromise)
    ]

    private var storyURL: URL? {
        let appId = bridge?.config.getPluginConfig("InstagramStories").getString("facebookAppId") ?? ""
        guard !appId.isEmpty else { return nil }
        return URL(string: "instagram-stories://share?source_application=\(appId)")
    }

    @objc func isAvailable(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let available = self.storyURL.map { UIApplication.shared.canOpenURL($0) } ?? false
            call.resolve(["available": available, "videoFile": available])
        }
    }

    /// The video the web wrote, only if it is a file inside `<Caches>/hightop-share/` (symlinks and `..` resolved).
    private func shareFolderFile(_ path: String) -> URL? {
        guard let url = URL(string: path), url.isFileURL,
              let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first else { return nil }
        let folder = caches.appendingPathComponent("hightop-share", isDirectory: true)
            .resolvingSymlinksInPath().standardizedFileURL.path + "/"
        let file = url.resolvingSymlinksInPath().standardizedFileURL
        var isDirectory: ObjCBool = false
        guard file.path.hasPrefix(folder),
              FileManager.default.fileExists(atPath: file.path, isDirectory: &isDirectory), !isDirectory.boolValue else { return nil }
        return file
    }

    @objc func shareToStory(_ call: CAPPluginCall) {
        if call.getString("mediaType") == "video" {
            guard let file = shareFolderFile(call.getString("path") ?? "") else {
                call.reject("Could not prepare the video.")
                return
            }
            // A 4 MB read stays off the main thread.
            DispatchQueue.global(qos: .userInitiated).async {
                guard let media = try? Data(contentsOf: file), !media.isEmpty else {
                    call.reject("Could not prepare the video.")
                    return
                }
                self.openStory(call, media: media, backgroundKey: "com.instagram.sharedSticker.backgroundVideo")
            }
            return
        }
        guard let base64 = call.getString("data"), let media = Data(base64Encoded: base64), !media.isEmpty else {
            call.reject("A picture is required.")
            return
        }
        openStory(call, media: media, backgroundKey: "com.instagram.sharedSticker.backgroundImage")
    }

    private func openStory(_ call: CAPPluginCall, media: Data, backgroundKey: String) {
        let topColor = call.getString("topColor") ?? "#020617"
        let bottomColor = call.getString("bottomColor") ?? "#020617"
        let caption = call.getString("caption") ?? ""
        DispatchQueue.main.async {
            guard let url = self.storyURL, UIApplication.shared.canOpenURL(url) else {
                call.reject("Instagram is not installed.", "NOT_INSTALLED")
                return
            }
            var item: [String: Any] = [
                backgroundKey: media,
                "com.instagram.sharedSticker.backgroundTopColor": topColor,
                "com.instagram.sharedSticker.backgroundBottomColor": bottomColor
            ]
            if !caption.isEmpty {
                item["public.utf8-plain-text"] = caption
            }
            UIPasteboard.general.setItems([item], options: [.expirationDate: Date().addingTimeInterval(60 * 5)])
            UIApplication.shared.open(url, options: [:]) { opened in
                if opened {
                    call.resolve()
                } else {
                    call.reject("Could not open Instagram.")
                }
            }
        }
    }
}
