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

// Release signing (Phase 6): the upload key lives outside the repo, created once by scripts/create-upload-key.cjs.
// Never print these values. Without the files a release build is left unsigned (and can't be uploaded).
val signingDir = File(System.getProperty("user.home"), "Library/Application Support/Hightop Challenge/signing")
val uploadKeystore = File(signingDir, "fire-tv-upload.p12")
val uploadCredentials = File(signingDir, "fire-tv-upload-credentials.json")
@Suppress("UNCHECKED_CAST")
val uploadSecrets: Map<String, String>? =
    if (uploadKeystore.isFile && uploadCredentials.isFile) {
        groovy.json.JsonSlurper().parse(uploadCredentials) as Map<String, String>
    } else {
        null
    }

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

    signingConfigs {
        if (uploadSecrets != null) {
            create("upload") {
                storeFile = uploadKeystore
                storeType = uploadSecrets.getValue("storeType")
                storePassword = uploadSecrets.getValue("storePassword")
                keyAlias = uploadSecrets.getValue("alias")
                keyPassword = uploadSecrets.getValue("keyPassword")
            }
        }
    }

    buildTypes {
        debug {
            if (debugStartUrl != null) {
                buildConfigField("String", "START_URL", quoted(debugStartUrl))
                buildConfigField("String", "DEV_ORIGIN", quoted(debugStartUrl))
            }
        }
        release {
            // Minify on; proguard-rules.pro keeps the JS bridge methods the page calls by name.
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("upload")
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
