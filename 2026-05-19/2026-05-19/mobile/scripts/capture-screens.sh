#!/bin/bash
# Capture screenshots of all key app screens via ADB
DEVICE="b2538081"
OUT="D:/pepsico dubai/farmley-sfa-v2/mobile/screenshots"
APP="com.farmleysfa"

shot() {
  local name=$1
  local wait=${2:-2}
  sleep $wait
  adb -s $DEVICE shell "screencap -p /sdcard/shot.png"
  adb -s $DEVICE pull //sdcard/shot.png "$OUT/$name.png"
  echo "✓ $name.png"
}

echo "=== Farmley SFA Screenshots ==="

# 1. Login Screen
adb -s $DEVICE shell am force-stop $APP
sleep 1
adb -s $DEVICE shell "am start -n $APP/.MainActivity"
shot "01-login" 4

# 2. Fill credentials and login
adb -s $DEVICE shell "input tap 610 1050"   # username field (approximate center)
sleep 0.5
adb -s $DEVICE shell "input text admin"
sleep 0.5
adb -s $DEVICE shell "input tap 610 1180"   # password field
sleep 0.5
adb -s $DEVICE shell "input text farmley123"
sleep 0.5
adb -s $DEVICE shell "input tap 610 1350"   # Sign In button
shot "02-dashboard" 8

# 3. Stores tab
adb -s $DEVICE shell "input tap 305 2630"   # Stores tab (2nd tab)
shot "03-stores-list" 3

# 4. Tap first store (approximate position)
adb -s $DEVICE shell "input tap 610 500"
shot "04-customer-visit-map" 4

# 5. Press Check In button
adb -s $DEVICE shell "input tap 610 2550"   # Check In button at bottom
shot "05-customer-dashboard" 6

# 6. Tap Place Order tile
adb -s $DEVICE shell "input tap 310 550"    # First tile (Place Order)
shot "06-order-screen" 3

# 7. Go back
adb -s $DEVICE shell "input keyevent 4"
sleep 2

# 8. Tap Store Check tile
adb -s $DEVICE shell "input tap 610 550"    # Second tile (Store Check)
shot "07-store-check" 3

# 9. Go back
adb -s $DEVICE shell "input keyevent 4"
sleep 2

# 10. Settings tab
adb -s $DEVICE shell "input keyevent 4"    # back to Stores
sleep 1
adb -s $DEVICE shell "input tap 915 2630"  # Settings tab (4th tab)
shot "08-settings" 2

echo ""
echo "=== Done! Screenshots saved to: $OUT ==="
ls "$OUT"/*.png 2>/dev/null | while read f; do echo "  $(basename $f)"; done
