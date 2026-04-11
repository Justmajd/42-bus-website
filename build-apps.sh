#!/bin/bash

# Build and Export iOS and Android Apps
# Creates optimized builds and saves them to app_export/

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXPORT_DIR="$PROJECT_ROOT/app_export"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "📱 42 Bus App Builder"
echo "===================="
echo ""

# Create export directories
mkdir -p "$EXPORT_DIR/ios" "$EXPORT_DIR/android"

# Step 1: Build web assets
echo "🔨 Step 1: Building web assets..."
npm run build
echo "✓ Web build complete"
echo ""

# Step 2: Sync to native projects
echo "🔄 Step 2: Syncing to native projects..."
npx cap sync
echo "✓ Sync complete"
echo ""

# Step 3: Build Android
echo "📱 Step 3: Building Android debug APK..."
cd "$PROJECT_ROOT/android"
./gradlew assembleDebug 2>/dev/null || {
  echo "✗ Android build failed"
  exit 1
}
echo "✓ Android APK built"
cp "$PROJECT_ROOT/android/app/build/outputs/apk/debug/app-debug.apk" \
   "$EXPORT_DIR/android/app-debug.apk"
echo "✓ Android APK exported to app_export/android/"
echo ""

# Step 4: Build iOS
echo "🍎 Step 4: Building iOS app..."
cd "$PROJECT_ROOT/ios/App"
xcodebuild -project App.xcodeproj -scheme App -configuration Release \
  -destination generic/platform=iOS CODE_SIGN_IDENTITY="" CODE_SIGNING_REQUIRED=NO \
  -archivePath App.xcarchive archive > /dev/null 2>&1
echo "✓ iOS archive built"

# Convert archive to IPA
IPA_WORK="/tmp/ipa_build_$$"
mkdir -p "$IPA_WORK/Payload"
cp -r "/Users/justmajd/Library/Developer/Xcode/DerivedData/App-gievwrncesvaegdgflzkbviekvnb/Build/Products/Release-iphoneos/App.app" \
  "$IPA_WORK/Payload/"
cd "$IPA_WORK"
zip -r -q "App.ipa" Payload/
mv "App.ipa" "$EXPORT_DIR/ios/App.ipa"
rm -rf "$IPA_WORK"
echo "✓ iOS IPA exported to app_export/ios/"
echo ""

# Summary
echo "✅ Build Complete!"
echo "===================="
echo ""
echo "📂 Export Location: $EXPORT_DIR"
echo ""
echo "iOS:"
ls -lh "$EXPORT_DIR/ios/App.ipa"
echo ""
echo "Android:"
ls -lh "$EXPORT_DIR/android/app-debug.apk"
echo ""
echo "Next steps:"
echo "  iOS:     Open App.ipa in Xcode or use TestFlight"
echo "  Android: adb install app-debug.apk"
