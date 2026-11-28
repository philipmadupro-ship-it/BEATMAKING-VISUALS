#!/bin/bash
# U2C Studio + U2C Send: double-click to install into /Library/Audio/Plug-Ins (asks for your Mac password once).
cd "$(dirname "$0")"
D=/Library/Audio/Plug-Ins
sudo mkdir -p "$D/VST3" "$D/CLAP" "$D/Components"
for N in "U2C Studio" "U2C Send"; do
  sudo rm -rf "$D/VST3/$N.vst3" "$D/CLAP/$N.clap" "$D/Components/$N.component"
  [ -e "$N.vst3" ] && sudo cp -R "$N.vst3" "$D/VST3/"
  [ -e "$N.clap" ] && sudo cp -R "$N.clap" "$D/CLAP/"
  [ -e "$N.component" ] && sudo cp -R "$N.component" "$D/Components/"
  sudo xattr -dr com.apple.quarantine "$D/VST3/$N.vst3" "$D/CLAP/$N.clap" "$D/Components/$N.component" 2>/dev/null
done
killall -9 AudioComponentRegistrar 2>/dev/null
echo "Installed U2C Studio (put it on the master) and U2C Send (put it on any track you want to react)."
echo "In FL Studio: Options > Manage plugins > Find more plugins."
read -n1 -p "Press any key to close."
