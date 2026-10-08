import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// The sandbox upload key lives OUTSIDE the repo (never commit a keystore). Default path:
// ~/.hightop-clover/sandbox-signing.properties with storeFile, storePassword, keyAlias, keyPassword.
// Clover locks the package name AND the signing key on the first APK uploaded to an app, so
// keep using this same key for every sandbox upload of com.hightopchallenge.clover.
val signingPropsFile = file(
    (findProperty("cloverSigningProps") as String?)
        ?: "${System.getProperty("user.home")}/.hightop-clover/sandbox-signing.properties"
)
val signingProps = Properties().apply {
    if (signingPropsFile.exists()) signingPropsFile.inputStream().use { load(it) }
}

android {
    namespace = "com.hightopchallenge.clover"
    compileSdk = 35

    defaultConfig {
        // Package name is permanent once uploaded to a Clover app. Decided in Phase 3a.
        applicationId = "com.hightopchallenge.clover"
        // Station 2018 = API 25; Flex 2/3, Mini 2/3, Station Solo = API 29.
        minSdk = 25
        // Clover asks for targetSdk <= 25: from 27 on, Android's account-access policy prompts
        // the merchant before an app can read the Clover account (docs: setting-android-sdk-versions).
        @Suppress("ExpiredTargetSdkVersion")
        targetSdk = 25
        // Clover: a sideloaded build must have a HIGHER versionCode than the uploaded one, or the
        // Clover app updater overwrites it. Pass -PversionCode=N.
        versionCode = ((findProperty("versionCode") as String?) ?: "1").toInt()
        versionName = "0.0.${versionCode}-spike"
    }

    signingConfigs {
        create("cloverSandbox") {
            if (signingPropsFile.exists()) {
                storeFile = file(signingProps.getProperty("storeFile"))
                storePassword = signingProps.getProperty("storePassword")
                keyAlias = signingProps.getProperty("keyAlias")
                keyPassword = signingProps.getProperty("keyPassword")
            }
            // Clover accepts ONLY the v1 (JAR) signature scheme (docs: generating-a-signed-apk).
            enableV1Signing = true
            enableV2Signing = false
            enableV3Signing = false
            enableV4Signing = false
        }
    }

    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
            if (signingPropsFile.exists()) signingConfig = signingConfigs.getByName("cloverSandbox")
        }
        getByName("debug") {
            if (signingPropsFile.exists()) signingConfig = signingConfigs.getByName("cloverSandbox")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    lint {
        // targetSdk 25 is deliberate (see above); don't fail the spike on Play-store policy checks.
        abortOnError = false
        checkReleaseBuilds = false
    }
}

dependencies {
    // Pinned (not latest.release) so a rebuild is reproducible. 341 = newest on Maven Central, 2026-10-05.
    implementation("com.clover.sdk:clover-android-sdk:341")
}
