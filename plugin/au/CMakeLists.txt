# AUv2 wrapper for the Rust CLAP (macOS only). Untested here (no macOS in the dev box): see ../README.md.
# Usage: cmake -S plugin/au -B build-au -DCLAP_WRAPPER_DIR=/path/to/clap-wrapper -DU2C_CLAP="/path/to/U2C Studio.clap"
cmake_minimum_required(VERSION 3.21)
project(u2c_studio_au LANGUAGES C CXX OBJC OBJCXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_OSX_DEPLOYMENT_TARGET 11.0)
set(CLAP_WRAPPER_DOWNLOAD_DEPENDENCIES TRUE CACHE BOOL "")
set(CLAP_WRAPPER_BUILD_AUV2 TRUE CACHE BOOL "")
add_subdirectory(${CLAP_WRAPPER_DIR} clap-wrapper)

# A stub target carries the AU; the prebuilt Rust CLAP is embedded into the .component.
file(WRITE ${CMAKE_BINARY_DIR}/stub.cpp "")
add_library(u2c_studio_au MODULE ${CMAKE_BINARY_DIR}/stub.cpp)
target_add_auv2_wrapper(
  TARGET u2c_studio_au
  OUTPUT_NAME "U2C Studio"
  BUNDLE_IDENTIFIER "com.uche2crazyyy.u2c-studio.au"
  BUNDLE_VERSION "0.1.0"
  MANUFACTURER_NAME "UCHE2CRAZYYY"
  MANUFACTURER_CODE "U2Cz"
  SUBTYPE_CODE "U2Cs"
  INSTRUMENT_TYPE "aufx"
  CLAP_TARGET_CLONE_SOURCE "${U2C_CLAP}"
  MACOS_EMBEDDED_CLAP_LOCATION "${U2C_CLAP}")
