---
title: Debugging
description: Source-level debugging of AVR firmware from VS Code, plus cycle-accurate profiling with speedscope.
draft: true
---

<!-- NOT PUBLISHED. draft: true keeps this page out of the production build while the
     debugger, the profiler and the editor extensions are unfinished. To bring it back:
     drop this frontmatter flag, re-add the sidebar entry in astro.config.ts, and restore
     the links removed from quickstart and driver. -->

PyMCU ships a **source-level debugger** for AVR firmware. You can set breakpoints on Python
lines, step through them, and inspect registers and SRAM directly from VS Code — no debug
probe or JTAG adapter required.

The debugger speaks the
[Debug Adapter Protocol (DAP)](https://microsoft.github.io/debug-adapter-protocol/) and runs
the AVR8Sharp simulator in-process, so you debug at full speed on your development machine
without touching hardware.

## Prerequisites

| What | Where |
|---|---|
| VS Code | [code.visualstudio.com](https://code.visualstudio.com) |
| PyMCU VS Code extension | Search **PyMCU** in the Marketplace |
| PyMCU compiler | See [Installation](/pymcu/getting-started/installation/) — the `[avr]` extra |

## Quick start

1. Open your PyMCU project folder in VS Code.

2. Add `.vscode/launch.json`:

   ```json
   {
     "version": "0.2.0",
     "configurations": [
       {
         "type": "pymcu-avr",
         "request": "launch",
         "name": "Debug firmware",
         "program": "${workspaceFolder}/src/main.py",
         "stopOnEntry": true
       }
     ]
   }
   ```

3. Press **F5** (or **Run → Start Debugging**). PyMCU compiles the project, starts the
   simulator with the generated firmware, and opens the debug panel with registers, memory
   and the call stack.

4. Click the gutter next to any Python line to set a **breakpoint**.

## Features

### Breakpoints on Python lines

Breakpoints map to the compiled AVR instructions for each source statement. Click in the
editor gutter or press `F9`. Conditional breakpoints are not yet supported.

### Step commands

| Command | Shortcut | Description |
|---|---|---|
| Continue | F5 | Run until the next breakpoint |
| Step Over | F10 | Execute the current statement, skipping into calls |
| Step Into | F11 | Step into function calls |
| Step Out | Shift+F11 | Run until the current function returns |

### Registers panel

The **Variables** panel shows all 32 general-purpose registers (R0-R31), the Stack Pointer
(SP), and the Status Register (SREG) with each flag decoded (I, T, H, S, V, N, Z, C). Values
that changed since the last stop are highlighted.

### Memory view

The **Memory** tab inspects SRAM at any address and refreshes after every step.

```
Address  00  01  02  03  04  05  06  07   ASCII
0x0100   00  00  00  00  ff  ff  00  42   ......B
0x0108   ...
```

### Call stack

The **Call Stack** panel shows Python-level frames where source mapping is available, and
falls back to raw instruction addresses otherwise.

## How it works

```
VS Code extension
      |
      |  DAP (JSON over TCP)
      v
pymcuc-avr-debugserver        <- bundled with the AVR backend
      |
      |  AVR8Sharp simulator API
      v
AVR8Sharp (in-process)        <- simulates the ATmega328P cycle-accurately
```

The debug server binary ships with the AVR backend and is launched automatically by the
extension; it speaks newline-delimited JSON over a local TCP socket. The **line map**
(`.linemap.json`) is written by `pymcu build` next to the firmware and maps each instruction
address back to a Python file and line.

## Known limitations

- **Simulation only** — peripherals (UART, SPI, I2C) emit and receive data inside the
  simulator; firmware already flashed to real hardware is not controllable this way.
- **ATmega328P only** — other targets are not yet wired into the debug adapter.
- **Interrupts** — ISRs step correctly, but the timing of interrupt delivery can differ
  slightly from real silicon.
- **`@naked` functions** — stepping through bare-metal asm blocks works at the instruction
  level; `asm()` lines have no source mapping.

## Profiling instead of debugging

For performance work, `pymcu profile` simulates the firmware and writes a
[Speedscope](https://speedscope.app) flamegraph:

```bash
pymcu profile --ms 5000 -o profile.speedscope.json
# then drag profile.speedscope.json onto speedscope.app
```

The profiler understands RTOS firmware with several tasks — each task gets its own profile
tab. For a terminal table of per-function cycle counts instead of a flamegraph, use
`pymcu bench`.

See the [CLI Driver](/pymcu/driver/) reference for every flag, including
`--assert-cycles-lt` for enforcing a cycle budget in CI.
