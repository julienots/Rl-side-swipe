#!/usr/bin/env bash
# Construit dist/bolidball.apk sans SDK Android complet :
#   javac (JDK) + android.jar (API 34) → dx (AOSP) → AXML/ARSC (android/tools/binres.py) → zip aligné → apksig.
# Variables optionnelles : ANDROID_KEYSTORE, ANDROID_KEYSTORE_PASS, ANDROID_KEY_ALIAS (sinon clé de débogage locale).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CACHE="${ANDROID_TOOLS_CACHE:-$ROOT/.android-cache}"
BUILD="$ROOT/build/android"
VERSION_NAME="$(node -p "require('$ROOT/package.json').version")"
VERSION_CODE="${VERSION_CODE:-1}"
MAVEN=https://repo.maven.apache.org/maven2
mkdir -p "$CACHE" "$ROOT/dist"

fetch() { # fetch <fichier> <url>
  [ -s "$CACHE/$1" ] && return 0
  for i in 1 2 3 4 5; do curl -sSfL -o "$CACHE/$1" "$2" && return 0; sleep $((i * 4)); done
  echo "Échec du téléchargement de $2" >&2; exit 1
}
fetch android.jar https://raw.githubusercontent.com/Reginer/aosp-android-jar/main/android-34/android.jar
fetch dx.jar "$MAVEN/com/jakewharton/android/repackaged/dalvik-dx/14.0.0_r21/dalvik-dx-14.0.0_r21.jar"
fetch apksig.jar "$MAVEN/com/android/tools/build/apksig/2.3.0/apksig-2.3.0.jar"

rm -rf "$BUILD" && mkdir -p "$BUILD/classes" "$BUILD/signer"
echo "1/5 Compilation Java"
javac -nowarn -Xlint:-options -source 8 -target 8 -bootclasspath "$CACHE/android.jar" -d "$BUILD/classes" \
  $(find "$ROOT/android/src" -name '*.java')
echo "2/5 Conversion en DEX"
java -cp "$CACHE/dx.jar" com.android.dx.command.Main --dex --min-sdk-version=24 --output="$BUILD/classes.dex" "$BUILD/classes"
echo "3/5 Manifeste binaire et ressources"
python3 "$ROOT/android/tools/binres.py" "$BUILD" "$VERSION_CODE" "$VERSION_NAME"
echo "4/5 Empaquetage"
python3 "$ROOT/android/tools/package.py" "$BUILD" "$ROOT" "$BUILD/unsigned.apk"
echo "5/5 Signature"
KS="${ANDROID_KEYSTORE:-$CACHE/debug.p12}"; PASS="${ANDROID_KEYSTORE_PASS:-android}"; ALIAS="${ANDROID_KEY_ALIAS:-bolidball}"
if [ ! -f "$KS" ]; then
  keytool -genkeypair -keystore "$KS" -storetype PKCS12 -storepass "$PASS" -keypass "$PASS" -alias "$ALIAS" \
    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Bolid'Ball Debug, O=Bolid'Ball, C=FR" 2>/dev/null
fi
javac -nowarn -cp "$CACHE/apksig.jar" -d "$BUILD/signer" "$ROOT/android/tools/Sign.java"
java --add-exports java.base/sun.security.x509=ALL-UNNAMED --add-exports java.base/sun.security.pkcs=ALL-UNNAMED --add-exports java.base/sun.security.util=ALL-UNNAMED -cp "$CACHE/apksig.jar:$BUILD/signer" Sign "$KS" "$PASS" "$ALIAS" "$BUILD/unsigned.apk" "$ROOT/dist/bolidball.apk"
ls -la "$ROOT/dist/bolidball.apk"
