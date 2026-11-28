#!/bin/bash
# U2C Studio: double-click to install into /Library/Audio/Plug-Ins (asks for your Mac password once).
cd "$(dirname "$0")"
D=/Library/Audio/Plug-Ins
sudo mkdir -p "$D/VST3" "$D/CLAP" "$D/Components"
sudo rm -rf "$D/VST3/U2C Studio.vst3" "$D/CLAP/U2C Studio.clap" "$D/Components/U2C Studio.component"
sudo cp -R "U2C Studio.vst3" "$D/VST3/"
sudo cp -R "U2C Studio.clap" "$D/CLAP/"
[ -e "U2C Studio.component" ] && sudo cp -R "U2C Studio.component" "$D/Components/"
sudo xattr -dr com.apple.quarantine "$D/VST3/U2C Studio.vst3" "$D/CLAP/U2C Studio.clap" "$D/Components/U2C Studio.component" 2>/dev/null
killall -9 AudioComponentRegistrar 2>/dev/null
echo "Installed. In FL Studio: Options > Manage plugins > Find more plugins."
read -n1 -p "Press any key to close."
