# The page calls these by name through window.HightopTV (lib/tvApp.ts). Minify must never rename or drop them.
-keepclassmembers class com.hightopchallenge.tv.TvBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface
