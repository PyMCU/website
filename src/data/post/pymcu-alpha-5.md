---
publishDate: 2026-08-13T00:00:00Z
author: PyMCU Team
title: 'PyMCU Alpha 5: Install It Anywhere, Trust What It Downloads'
excerpt: Alpha 5 is the release that makes the first five minutes work. macOS wheels install again, every toolchain download is checked against a SHA-256 and matched to your actual architecture, and the whole tutorial was walked end to end on Ubuntu ARM64, Windows 11 ARM64 and macOS — flashing real boards, not emulators.
image: https://images.unsplash.com/photo-1518770660439-4636190af475?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80
category: Release
tags:
  - release
  - alpha
  - toolchain
  - avr
---

Alpha 4 could compile. Alpha 5 is about everything that happens _before_ the compiler
runs — installing, downloading a toolchain, scaffolding a project — on machines that
aren't the one PyMCU was developed on.

```bash
pipx install --pip-args="--pre" "pymcu-compiler[avr]"
```

## Installation actually installs

**macOS wheels are installable again** on macOS 14 and 15. The arm64 wheels were tagged
for a platform newer than most people are running, so `pip` simply refused to see them.
They are now tagged `macosx_14_0` and resolve normally.

`--pip-args="--pre"` is not optional: PyMCU has no stable release yet, so without it the
resolver finds nothing. And `pipx` rather than plain `pip` — modern Ubuntu ships an
externally-managed Python that rejects `pip install` outside a virtualenv.

## Downloads you can check

Toolchains and programmers are fetched at first use, and that path got serious:

- **avrdude downloads are verified against a SHA-256** before anything is unpacked.
- **Architecture-aware downloads.** Linux ARM64 and ARMv6 get their own builds, and
  Windows ARM64 gets a native binary instead of an emulated x64 one.
- **Robust TLS.** Downloads use a proper certificate bundle instead of whatever the
  system happened to hand over.
- **A toolchain cache keyed by payload**, so two projects that need the same toolchain
  share one copy — plus `pymcu toolchain clean` when you want the disk space back.

## Smaller things that bite

- `pymcu new` scaffolds MicroPython and CircuitPython projects with a **top-level script**,
  the way those ecosystems actually write code.
- `pymcu new` no longer dies on machines **without a console or without git** installed.
- The **flash metric is honest**: `pymcu build` reports 38 bytes for the blink — everything
  from `main` onward, once the 104-byte interrupt-vector table is deducted. The complete
  `.hex` is still 142 bytes.

## Walked, not assumed

The getting-started path was run end to end on **Ubuntu ARM64, Windows 11 ARM64 and
macOS**, each time flashing a real board — install, `pymcu new`, `pymcu build`,
`pymcu flash`, LED blinking. Most of the fixes above are things that only showed up by
doing exactly that.

Full release notes are on
[GitHub](https://github.com/PyMCU/PyMCU/releases/tag/v0.1.0a5).
