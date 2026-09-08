#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v flutter >/dev/null 2>&1; then
  echo "Flutter SDK is required. Install Flutter, then rerun this script." >&2
  exit 1
fi

flutter create \
  --platforms=android \
  --org ai.eburon \
  --project-name flutter_translator_edge \
  .

KOTLIN_DST="android/app/src/main/kotlin/ai/eburon/flutter_translator_edge"
mkdir -p "$KOTLIN_DST"
for source in native/android/*.kt; do
  install -m 0644 "$source" "$KOTLIN_DST/$(basename "$source")"
done
install -D -m 0644 native/android/AndroidManifest.xml android/app/src/main/AndroidManifest.xml
install -D -m 0644 native/android/CMakeLists.txt android/app/src/main/cpp/CMakeLists.txt
install -D -m 0644 native/android/cpp/edge_translator_jni.cpp android/app/src/main/cpp/cpp/edge_translator_jni.cpp

if [[ -f android/app/build.gradle.kts ]]; then
  sed -i.bak 's/minSdk = flutter.minSdkVersion/minSdk = 26/' android/app/build.gradle.kts || true
  rm -f android/app/build.gradle.kts.bak
  if ! grep -q 'EDGE_TRANSLATOR_CMAKE' android/app/build.gradle.kts; then
    cat >> android/app/build.gradle.kts <<'EOF'

// EDGE_TRANSLATOR_CMAKE
android {
    externalNativeBuild {
        cmake {
            path = file("src/main/cpp/CMakeLists.txt")
        }
    }
}
EOF
  fi
elif [[ -f android/app/build.gradle ]]; then
  sed -i.bak 's/minSdkVersion flutter.minSdkVersion/minSdkVersion 26/' android/app/build.gradle || true
  rm -f android/app/build.gradle.bak
  if ! grep -q 'EDGE_TRANSLATOR_CMAKE' android/app/build.gradle; then
    cat >> android/app/build.gradle <<'EOF'

// EDGE_TRANSLATOR_CMAKE
android {
    externalNativeBuild {
        cmake {
            path file('src/main/cpp/CMakeLists.txt')
        }
    }
}
EOF
  fi
else
  echo "Could not find Android app Gradle file." >&2
  exit 1
fi

flutter pub get
flutter analyze
flutter test

if [[ "${EDGE_BUILD_APK:-0}" == "1" ]]; then
  flutter build apk --debug
fi

echo "Android shell generated; Flutter analysis/tests completed."
echo "The JNI contract library is compiled as a truthful stub until native inference backends are linked."
