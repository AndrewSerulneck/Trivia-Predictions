// Hightop Challenge TV — Fire OS app (docs/fire-tv-app-plan.md Phase 4).
// A standalone Gradle project, separate from the phone app in native/ (Capacitor, players only).

pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "hightop-challenge-tv"
include(":app")
