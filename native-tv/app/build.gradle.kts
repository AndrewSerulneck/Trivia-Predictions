plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// The site the app wraps. Release builds always use it. A debug build may point at another origin for testing, e.g.
// an emulator talking to a dev server on the Mac:  ./gradlew assembleDebug -PtvStartUrl=http://10.0.2.2:3117/tv-app
val siteStartUrl = "https://hightopchallenge.com/tv-app"
val siteHosts = "hightopchallenge.com,www.hightopchallenge.com,play.hightopchallenge.com"
val debugStartUrl = (findProperty("tvStartUrl") as String?)?.trim()?.takeIf { it.isNotEmpty() }

fun quoted(value: String) = "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\""

android {
    namespace = "com.hightopchallenge.tv"
    compileSdk = 36

    defaultConfig {
        // Not the phone app's id (com.hightopchallenge.app): a separate app on a separate store listing.
        applicationId = "com.hightopchallenge.tv"
        // Fire OS 6 (Android 7.1, API 25) and up. Fire OS 5 sticks (API 22) ship a WebView too old for the site.
        minSdk = 25
        targetSdk = 35
        // Phase 6 raises versionCode on every upload. versionName goes into the user-agent token
        // `HightopChallengeTV/<versionName>`, which lib/tvApp.ts parses as digits and dots only: keep it "x.y.z".
        versionCode = 1
        versionName = "1.0.0"

        buildConfigField("String", "START_URL", quoted(siteStartUrl))
        buildConfigField("String", "SITE_HOSTS", quoted(siteHosts))
        buildConfigField("String", "DEV_ORIGIN", quoted(""))
    }

    buildTypes {
        debug {
            if (debugStartUrl != null) {
                buildConfigField("String", "START_URL", quoted(debugStartUrl))
                buildConfigField("String", "DEV_ORIGIN", quoted(debugStartUrl))
            }
        }
        release {
            // Phase 6 turns on minify (keep rules for the JS bridge are already in proguard-rules.pro) and signing.
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    testOptions {
        unitTests.isReturnDefaultValues = true
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
}
