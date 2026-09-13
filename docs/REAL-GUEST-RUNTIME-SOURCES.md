# MTP2026 Real Guest Runtime Sources

MTP2026 uses published open-source projects as runtime components instead of pretending that the launcher UI itself is an operating system.

## Browser ARM64 runtime

Primary upstream source:

- `ktock/qemu-wasm` — browser-capable QEMU with AArch64 system emulation support.
- Upstream: https://github.com/ktock/qemu-wasm

MTP2026 should consume/build the `qemu-system-aarch64` WebAssembly target from this project rather than implementing a fake ARM64 guest executor.

## Android ARM64 runtime

Preferred open-source guest/runtime sources:

- `jqssun/android-lineage-qemu` — LineageOS virtual-machine images and QEMU/UTM-oriented ARM64 builds.
  - https://github.com/jqssun/android-lineage-qemu
- `Ccccccccvvm/qemu-android-arm64` — documented ARM64 Android QEMU/Cuttlefish/Emulator integration paths.
  - https://github.com/Ccccccccvvm/qemu-android-arm64
- `aarch64-android-emulator/aarch64-qemu` — QEMU fork with AArch64 Android emulator support.
  - https://github.com/aarch64-android-emulator/aarch64-qemu

The launcher must not silently download an arbitrary third-party Android image. It should use a declared source, verify integrity, respect the upstream license, and expose the source/version in the guest manifest.

## Gaming ARM64 runtime

Gaming OS is treated as an open-source ARM64 Linux guest/runtime, not as a proprietary OS. It can use the same published QEMU AArch64 engine and a declared Linux/Android-derived guest image that is compatible with the selected machine configuration.

## Windows / iOS

MTP2026 does **not** bundle or redistribute proprietary Windows or Apple OS images from random GitHub repositories. The launcher can consume a user-supplied or otherwise authorized image only when the runtime and license allow it.

## Integration rule

Every guest definition must identify:

1. runtime engine repository,
2. exact commit/tag/release,
3. guest image source,
4. image SHA-256,
5. guest architecture,
6. machine/boot configuration,
7. license/redistribution status.

A guest is never considered `installed` merely because a UI mode exists. It is installed only after the real runtime verifies the image and the runtime provider reports that the guest can boot.
