#!/bin/sh
# The real Metal compiler is a separately downloaded toolchain that only xcrun can locate;
# Xcode's own Toolchains/.../usr/bin/metal is a stub that fails when called directly.
exec env DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun -sdk macosx metal "$@"
