---
title: Installation
description: Install the PyMCU compiler and the toolchain for your target — AVR, ARM (RP2040 / RP2350) or PIC.
---

PyMCU ships as a single PyPI package, `pymcu-compiler`, plus one extra per architecture.
Each extra pulls in its own backend **and** its own assembler/linker binaries, so there is
nothing to install from your system package manager.

:::caution[Alpha release]
The current release is **v0.1.0a3**. `pip`, `uv` and `pipx` skip pre-releases unless you ask
for them, so every command on this page carries a `--pre` flag. Once `0.1.0` stable ships,
`--pre` will no longer be needed.
:::

## Requirements

- **Python 3.11 or newer**
- One of `pipx`, `uv` or `pip`

That is the whole list. No `avr-gcc`, no ARM GNU toolchain, no MPLAB.

## Install with pipx (recommended)

```bash
pipx install --pip-args=--pre "pymcu-compiler[avr]"    # AVR (ATmega / ATtiny)
pipx install --pip-args=--pre "pymcu-compiler[arm]"    # RP2040 / RP2350 (Pico / Pico 2)
pipx install --pip-args=--pre "pymcu-compiler[pic]"    # PIC16
pipx install --pip-args=--pre "pymcu-compiler[all]"    # everything
```

`pipx` installs into an isolated environment and puts the `pymcu` command on your PATH.
If the command is not found afterwards, run `pipx ensurepath` and open a new shell.

## Install with uv

```bash
uv tool install --pre "pymcu-compiler[avr]"
uv tool install --pre "pymcu-compiler[arm]"
uv tool install --pre "pymcu-compiler[pic]"
uv tool install --pre "pymcu-compiler[all]"
```

`uv tool install` also places `pymcu` on your PATH globally, isolated in its own virtual
environment — no activation step. Requires **uv 0.11 or newer** (`uv self update`).

## Install with pip

```bash
pip install --pre "pymcu-compiler[avr]"
```

Use this inside a virtual environment you manage yourself, or when adding PyMCU to an
existing project's dependencies.

## Verify

```bash
pymcu --version
```

This prints a small table rather than a single version string:

```text
        PyMCU Ecosystem Version Info
+----------------+-----------------------+----------+
| Package        | Description           | Version  |
+----------------+-----------------------+----------+
| pymcu-compiler | Compiler & CLI Driver | 0.1.0a3  |
| pymcu-stdlib   | Standard Library      | ...      |
| python         | Python Interpreter    | 3.11+    |
+----------------+-----------------------+----------+
```

Anything missing shows as **Not Installed** instead of being left out, so this is also the
quickest way to check that the standard library is on the path.

:::note[Package name]
PyMCU is published as `pymcu-compiler` while a PEP 541 request to reclaim the `pymcu` name
is under review. Once approved, a `pymcu` metapackage will alias `pymcu-compiler` — installs
and project configs will stay compatible.
:::

## Compat packages

Two optional packages give you the MicroPython and CircuitPython APIs. **During the alpha
these are the recommended way to write firmware** — they are stable and community-specified,
while the native `pymcu.hal.*` API may still change between releases.

```bash
pip install --pre pymcu-micropython     # machine (Pin/UART/ADC/PWM/SPI/I2C/Timer/WDT), utime
pip install --pre pymcu-circuitpython   # board, digitalio, analogio, busio, pwmio, time, neopixel
```

In a project, add the one you want to `[project] dependencies` in `pyproject.toml` — see the
[Quick Start](/pymcu/getting-started/quickstart/).

## Per-target notes

### AVR

Everything needed to *compile* is bundled. To *flash* an Arduino Uno you need **avrdude** on
your host:

```bash
brew install avrdude          # macOS
sudo apt-get install avrdude  # Debian / Ubuntu
```

On Windows, grab a build from the
[avrdude releases page](https://github.com/avrdudes/avrdude/releases).

Then:

```bash
pymcu flash --port /dev/cu.usbmodem*   # macOS
pymcu flash --port /dev/ttyACM0        # Linux
pymcu flash --port COM3                # Windows
```

### ARM (RP2040 / RP2350)

The `[arm]` extra lowers PyMCU's IR to **LLVM IR** and drives an LLVM toolchain
(`opt` → `llc` → `ld.lld` → `llvm-objcopy`). On Linux x64/arm64, Windows x64 and macOS
arm64 the prebuilt `pymcu-arm-toolchain` wheel is pulled in automatically. On any other
platform, install a system LLVM instead:

```bash
brew install llvm lld        # macOS
sudo apt install llvm lld    # Debian / Ubuntu
```

A build produces a flat `dist/firmware.bin`. Flashing a Pico is the usual bootloader dance:
hold **BOOTSEL** while plugging the board in, and it mounts as a USB mass-storage device —
then drop the UF2 onto it, or let the driver do it:

```bash
pymcu flash
```

### PIC

The `[pic]` extra bundles **gputils** (`gpasm`) as a wheel for every supported platform, so
there is nothing else to install. `pymcu flash` drives a PICkit 2 by default (`pk2cmd` is
fetched on first use).

## Build from source

For contributors, or anyone who wants the latest development build.

**Requirements**

- [.NET 10 SDK](https://dotnet.microsoft.com/download)
- Python 3.11 or newer
- [`uv`](https://docs.astral.sh/uv/) and [`just`](https://github.com/casey/just)

**Steps**

```bash
git clone https://github.com/PyMCU/PyMCU.git
cd PyMCU

# Build the C# compiler (.NET 10, AOT)
dotnet publish src/compiler/PyMCU.csproj -c Release -o build/bin --nologo

# Set up the Python environment
uv venv && source .venv/bin/activate
uv sync
just sync-stdlib      # editable stdlib: uv pip install --no-deps -e lib/
pip install -e src/driver
```

`just sync-stdlib` only has to run once — after that, edits under `lib/src/pymcu/` are picked
up live.

:::danger[Never copy the stdlib into site-packages]
Copying `lib/src/pymcu/` into `.venv/.../site-packages/pymcu/` shadows the editable `.pth`
install, and your edits silently stop taking effect — with no error to tell you why. If
stdlib changes seem to be ignored, check `pymcu.__file__` and delete any physical copy you
find in site-packages.
:::

Verify:

```bash
pymcu --version
```

Backends live in their own repositories — [`PyMCU/pymcu-avr`](https://github.com/PyMCU/pymcu-avr),
[`PyMCU/pymcu-arm`](https://github.com/PyMCU/pymcu-arm) and
[`PyMCU/pymcu-pic`](https://github.com/PyMCU/pymcu-pic) — see [Contributing](/pymcu/contributing/)
for the full layout.

## Next steps

- [Quick Start](/pymcu/getting-started/quickstart/) — create a project and blink an LED
- [Supported Targets](/pymcu/targets/) — chips, peripherals and per-architecture capabilities
