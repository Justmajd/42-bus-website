#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXPORT_DIR="$PROJECT_ROOT/app_export"
IOS_PROJECT_DIR="$PROJECT_ROOT/ios/App"
IOS_ARCHIVE="$IOS_PROJECT_DIR/App.xcarchive"

mkdir -p "$EXPORT_DIR/ios" "$EXPORT_DIR/android"

echo "Building web assets..."
npm run build

echo "Syncing Capacitor projects..."
npx cap sync

echo "Building Android debug APK..."
(
  cd "$PROJECT_ROOT/android"
  ./gradlew assembleDebug
)
cp "$PROJECT_ROOT/android/app/build/outputs/apk/debug/app-debug.apk" "$EXPORT_DIR/android/app-debug.apk"

if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "xcodebuild is not available; Android export completed and iOS export was skipped."
else
  echo "Building iOS archive..."
  (
    cd "$IOS_PROJECT_DIR"
    xcodebuild \
      -project App.xcodeproj \
      -scheme App \
      -configuration Release \
      -destination generic/platform=iOS \
      CODE_SIGN_IDENTITY="" \
      CODE_SIGNING_REQUIRED=NO \
      -archivePath "$IOS_ARCHIVE" \
      archive
  )

  IOS_APP="$IOS_ARCHIVE/Products/Applications/App.app"
  if [ ! -d "$IOS_APP" ]; then
    echo "The iOS archive did not contain an application bundle."
    exit 1
  fi

  IPA_WORK="$(mktemp -d "${TMPDIR:-/tmp}/42-bus-ipa.XXXXXX")"
  trap 'rm -rf "$IPA_WORK"' EXIT
  mkdir -p "$IPA_WORK/Payload"
  cp -R "$IOS_APP" "$IPA_WORK/Payload/"
  (
    cd "$IPA_WORK"
    zip -r -q "$EXPORT_DIR/ios/App.ipa" Payload
  )
fi

echo "Build exports are in $EXPORT_DIR."
ls -lh "$EXPORT_DIR/android/app-debug.apk"
if [ -f "$EXPORT_DIR/ios/App.ipa" ]; then
  ls -lh "$EXPORT_DIR/ios/App.ipa"
fi
