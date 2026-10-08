// Phase 3a throwaway spike. Versions match clover-android-sdk 341's own build (AGP 8.7.2, Kotlin 2.0.21,
// Gradle 8.10.2) so dependency resolution matches what Clover tests against.
plugins {
    id("com.android.application") version "8.7.2" apply false
    id("org.jetbrains.kotlin.android") version "2.0.21" apply false
}
