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
            call.resolve(["available": available])
        }
    }

    @objc func shareToStory(_ call: CAPPluginCall) {
        guard let base64 = call.getString("data"), let image = Data(base64Encoded: base64), !image.isEmpty else {
            call.reject("A picture is required.")
            return
        }
        let topColor = call.getString("topColor") ?? "#020617"
        let bottomColor = call.getString("bottomColor") ?? "#020617"
        let caption = call.getString("caption") ?? ""
        DispatchQueue.main.async {
            guard let url = self.storyURL, UIApplication.shared.canOpenURL(url) else {
                call.reject("Instagram is not installed.", "NOT_INSTALLED")
                return
            }
            var item: [String: Any] = [
                "com.instagram.sharedSticker.backgroundImage": image,
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
