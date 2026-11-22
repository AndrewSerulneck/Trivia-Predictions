plugins {
    id("com.android.application") version "8.13.0" apply false
    id("org.jetbrains.kotlin.android") version "2.2.20" apply false
}

// This repo lives in ~/Documents, which iCloud Drive syncs. iCloud makes "name 2" conflict copies inside busy build
// folders and Gradle then fails, so every build folder lives outside iCloud.
allprojects {
    layout.buildDirectory.set(
        File(System.getProperty("user.home"), "Library/Caches/hightop-native-tv/${project.name}"),
    )
}
