import UIKit
import WebKit
import Capacitor

// The app's root view controller (docs/native-app-store-plan.md Phases 2E and 3).
// SceneDelegate roots on it directly (the Phase 2A SpikeViewController is gone).
//
// Phase 3 adds:
//  - the HightopShell plugin (below): lets the page open a URL in Safari;
//  - Universal Links: a tapped play.hightopchallenge.com link or a scanned join QR
//    opens the app ON THAT PAGE, both on a cold launch and when the app is already
//    running. Capacitor only reports the link (App "appUrlOpen"); loading it is ours.
//    The app is for players only (Phase 3B.1), so a QR scan always lands on the
//    player sign-in (Andrew's QR rule). Needs the Associated Domains entitlement,
//    which only the paid Apple team can sign (App/App.entitlements; see the Phase 3
//    handoff) — until then no link can reach this code.
//
// Capacitor builds its WKNavigationDelegate inside a `final` loadView, so it
// can't be subclassed. Instead, once Capacitor has loaded, we put a thin
// wrapper in front of it. The wrapper answers three things itself and hands
// every other delegate call to Capacitor unchanged:
//
//  1. Marketing pages open in Safari, not in the app. The list lives in
//     `plugins.HightopShell.openInBrowser` in capacitor.config.json (one list
//     for iOS and Android; tests/native-app-contract.test.ts pins it). Legal
//     pages stay in the app — Apple wants them reachable there.
//  2. The offline page shows only for a REAL network failure. Capacitor's own
//     `server.errorPath` showed it for any failed load, including a navigation
//     that was merely cancelled (NSURLErrorCancelled, -999) because another one
//     replaced it — that was the false "No connection" on Back from a legal page
//     (R6). So `server.errorPath` is no longer set; the page is named in
//     `plugins.HightopShell.offlinePage` and only this wrapper shows it.
//  3. The offline page is told which page failed (`offline.html?url=…`), so
//     "Try again" reloads that page instead of the start URL.
class HightopBridgeViewController: CAPBridgeViewController {
    private var navigationWrapper: HightopNavigationDelegate?
    private var universalLinkObserver: NSObjectProtocol?

    deinit {
        if let observer = universalLinkObserver {
            NotificationCenter.default.removeObserver(observer)
        }
    }

    override open func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(HightopShellPlugin())
        // Registered here (inside loadView), before Capacitor delivers a cold-launch
        // link on its first viewDidAppear, so no link is missed.
        universalLinkObserver = NotificationCenter.default.addObserver(
            forName: .capacitorOpenUniversalLink, object: nil, queue: .main
        ) { [weak self] notification in
            guard let url = (notification.object as? [String: Any])?["url"] as? URL else { return }
            self?.openAppLink(url)
        }
        guard let webView = webView, let bridge = bridge, let capacitorDelegate = webView.navigationDelegate else {
            NSLog("Hightop: navigation wrapper not installed")
            return
        }
        let shellConfig = bridge.config.getPluginConfig("HightopShell")
        let offlinePage = shellConfig.getString("offlinePage") ?? ""
        let wrapper = HightopNavigationDelegate(
            wrapping: capacitorDelegate,
            errorPageURL: offlinePage.isEmpty ? nil : bridge.config.localURL.appendingPathComponent(offlinePage),
            rules: OpenInBrowserRules(shellConfig)
        )
        navigationWrapper = wrapper // navigationDelegate is weak; keep the wrapper alive
        webView.navigationDelegate = wrapper
    }

    /// Load a Universal Link in the web view — only https links to the app's own
    /// host (server.url, play.hightopchallenge.com). Anything else is ignored.
    func openAppLink(_ url: URL) {
        guard let webView = webView,
              let appHost = bridge?.config.serverURL.host?.lowercased(),
              url.scheme?.lowercased() == "https",
              url.host?.lowercased() == appHost else {
            NSLog("Hightop: ignored app link %@", url.absoluteString)
            return
        }
        NSLog("Hightop: opening app link %@", url.absoluteString)
        webView.load(URLRequest(url: url))
    }

    #if DEBUG
    // Debug-only automation hook (compiled out of Release): lets an agent probe the
    // web view on the simulator or a plugged-in iPhone. Launch with the env var
    // HIGHTOP_PROBE_STEPS='[{"delay":8,"js":"location.href"}]' (simctl:
    // SIMCTL_CHILD_HIGHTOP_PROBE_STEPS=…; devicectl: --environment-variables). Each
    // step runs `js` after `delay` seconds (cumulative) and logs "PROBE[i] url=… result=…".
    // Replaces Phase 2A's SpikeViewController / SPIKE_STEPS.
    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        guard let raw = ProcessInfo.processInfo.environment["HIGHTOP_PROBE_STEPS"],
              let data = raw.data(using: .utf8),
              let steps = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { return }
        NSLog("PROBE hook ready, %ld steps", steps.count)
        var at = 0.0
        for (index, step) in steps.enumerated() {
            at += (step["delay"] as? Double) ?? 5
            let js = (step["js"] as? String) ?? "location.href"
            DispatchQueue.main.asyncAfter(deadline: .now() + at) { [weak self] in
                guard let webView = self?.webView else { NSLog("PROBE[%d] no-webview", index); return }
                webView.evaluateJavaScript(js) { result, error in
                    let value = error.map { "ERROR \($0.localizedDescription)" } ?? String(describing: result ?? "nil")
                    NSLog("PROBE[%d] url=%@ result=%@", index, webView.url?.absoluteString ?? "nil", value)
                }
            }
        }
    }
    #endif
}

/// The page-callable side of the shell (`Capacitor.Plugins.HightopShell`), read by
/// lib/nativeApp.ts. `openInBrowser({ url })` opens an https URL in Safari and leaves
/// the app where it is — every partner page (`/owner/*`), `/tv` and /admin happen on
/// the website (docs/native-app-store-plan.md §2 items 2 and 12). Same plugin, same method on Android
/// (HightopShellPlugin.java). The web checks `hasNativeCapability("HightopShell")`.
@objc(HightopShellPlugin)
public class HightopShellPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HightopShellPlugin"
    public let jsName = "HightopShell"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "openInBrowser", returnType: CAPPluginReturnPromise)
    ]

    @objc func openInBrowser(_ call: CAPPluginCall) {
        guard let raw = call.getString("url"), let url = URL(string: raw), url.scheme?.lowercased() == "https" else {
            call.reject("An https URL is required.")
            return
        }
        DispatchQueue.main.async {
            UIApplication.shared.open(url, options: [:]) { opened in
                if opened {
                    call.resolve()
                } else {
                    call.reject("Could not open the browser.")
                }
            }
        }
    }
}

/// Which https URLs open in the system browser. Mirrors `plugins.HightopShell.openInBrowser`.
struct OpenInBrowserRules {
    let host: String
    let paths: [String]

    init(_ config: PluginConfig) {
        let rule = config.getObject("openInBrowser")
        host = ((rule?["host"] as? String) ?? "").lowercased()
        paths = ((rule?["paths"] as? JSArray) ?? []).compactMap { $0 as? String }
    }

    /// `/` matches only the root; any other entry matches itself and everything below it.
    func opensInBrowser(_ url: URL) -> Bool {
        guard !host.isEmpty, url.scheme?.lowercased() == "https", url.host?.lowercased() == host else {
            return false
        }
        let path = url.path.isEmpty ? "/" : url.path
        return paths.contains { entry in path == entry || (entry != "/" && path.hasPrefix(entry + "/")) }
    }
}

final class HightopNavigationDelegate: NSObject, WKNavigationDelegate {
    // Strong on purpose: the web view holds its delegate weakly, and Capacitor's
    // handler must outlive the swap. It never references the wrapper, so no cycle.
    private let capacitorDelegate: WKNavigationDelegate
    private let errorPageURL: URL?
    private let rules: OpenInBrowserRules

    init(wrapping capacitorDelegate: WKNavigationDelegate, errorPageURL: URL?, rules: OpenInBrowserRules) {
        self.capacitorDelegate = capacitorDelegate
        self.errorPageURL = errorPageURL
        self.rules = rules
        super.init()
    }

    // Everything this class doesn't implement goes straight to Capacitor.
    override func responds(to aSelector: Selector!) -> Bool {
        super.responds(to: aSelector) || capacitorDelegate.responds(to: aSelector)
    }

    override func forwardingTarget(for aSelector: Selector!) -> Any? {
        capacitorDelegate.responds(to: aSelector) ? capacitorDelegate : super.forwardingTarget(for: aSelector)
    }

    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let topLevel = navigationAction.targetFrame == nil || navigationAction.targetFrame?.isMainFrame == true
        if topLevel, let url = navigationAction.request.url, rules.opensInBrowser(url) {
            if webView.window?.windowScene?.activationState == .foregroundActive {
                UIApplication.shared.open(url, options: [:], completionHandler: nil)
            }
            decisionHandler(.cancel)
            return
        }
        let handled: Void? = capacitorDelegate.webView?(webView, decidePolicyFor: navigationAction, decisionHandler: decisionHandler)
        if handled == nil {
            decisionHandler(.allow)
        }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        handleFailure(in: webView, error: error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        handleFailure(in: webView, error: error)
    }

    private func handleFailure(in webView: WKWebView, error: Error) {
        let nsError = error as NSError
        guard Self.isNetworkFailure(nsError) else {
            // Cancelled or interrupted navigations are not "no connection".
            NSLog("Hightop: ignored navigation failure %@ %ld", nsError.domain, nsError.code)
            return
        }
        guard let errorPageURL = errorPageURL,
              var components = URLComponents(url: errorPageURL, resolvingAgainstBaseURL: false) else { return }
        let failedURL = (nsError.userInfo[NSURLErrorFailingURLErrorKey] as? URL) ?? webView.url
        if let failedURL = failedURL, failedURL.scheme?.lowercased() == "https" {
            components.queryItems = [URLQueryItem(name: "url", value: failedURL.absoluteString)]
        }
        if let target = components.url {
            webView.load(URLRequest(url: target))
        }
    }

    /// Only these mean the phone couldn't reach us. Everything else (-999 cancelled,
    /// WebKit's "frame load interrupted", a policy cancel) is ignored.
    static func isNetworkFailure(_ error: NSError) -> Bool {
        guard error.domain == NSURLErrorDomain else { return false }
        switch error.code {
        case NSURLErrorNotConnectedToInternet,
             NSURLErrorNetworkConnectionLost,
             NSURLErrorCannotFindHost,
             NSURLErrorCannotConnectToHost,
             NSURLErrorDNSLookupFailed,
             NSURLErrorTimedOut,
             NSURLErrorInternationalRoamingOff,
             NSURLErrorCallIsActive,
             NSURLErrorDataNotAllowed,
             NSURLErrorCannotLoadFromNetwork,
             NSURLErrorSecureConnectionFailed:
            return true
        default:
            return false
        }
    }
}
