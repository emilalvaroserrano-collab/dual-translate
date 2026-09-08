#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v flutter >/dev/null 2>&1; then
  echo "Flutter SDK is required. Install Flutter, then rerun this script." >&2
  exit 1
fi

# Generate only the platform shell. Existing lib/ and test/ sources are retained.
flutter create \
  --platforms=android \
  --org ai.eburon \
  --project-name flutter_translator_edge \
  .

install -D \
  native/android/MainActivity.kt \
  android/app/src/main/kotlin/ai/eburon/flutter_translator_edge/MainActivity.kt
install -D \
  native/android/AndroidManifest.xml \
  android/app/src/main/AndroidManifest.xml

# Edge runtimes target modern ARM64 Android. Keep the generated Gradle structure,
# but raise minSdk where Flutter emitted the standard placeholder.
if [[ -f android/app/build.gradle.kts ]]; then
  sed -i 's/minSdk = flutter.minSdkVersion/minSdk = 26/' android/app/build.gradle.kts
elif [[ -f android/app/build.gradle ]]; then
  sed -i 's/minSdkVersion flutter.minSdkVersion/minSdkVersion 26/' android/app/build.gradle
fi

flutter pub get
flutter analyze
flutter test

echo "Android shell generated and Dart checks passed."
echo "Native inference is still intentionally unlinked until the C++/ONNX runtimes are integrated."
