---
title: C and C++ interop
description: "Call existing C and C++ from PyMCU firmware with @extern and [tool.pymcu.ffi] — the AVR build integration, the calling convention, and five worked projects."
---

Some code is not worth rewriting. A CRC routine you have validated against a bus analyser,
a vendor's sensor library, an Arduino C++ class that already works — you want to call it,
not port it.

`@extern` declares a C symbol to the compiler and `[tool.pymcu.ffi]` tells the build how to
produce it. PyMCU then compiles your C alongside the generated firmware and links the two
into one image.

:::caution[AVR only]
C interop is **AVR only**. `pymcu build` resolves an FFI-capable toolchain per chip, and
the RP2040 / RP2350 plugin returns none — `@extern` and `[tool.pymcu.ffi]` are not wired
for the ARM or PIC backends. On a non-AVR target the build stops with
`C interop ([tool.pymcu.ffi]) is not supported for chip '<name>'`.
:::

This is a compiler and build feature. There is no MicroPython or CircuitPython equivalent
to tab against — those runtimes have their own, entirely different, native-module story.

## Declare the C function

An `@extern` declaration is a signature and nothing else. The body is a stub the compiler
ignores, so `pass` is fine:

```python
from pymcu.types import uint8
from pymcu.ffi import extern


@extern("c_mul8")
def c_mul8(a: uint8, b: uint8) -> uint8:
    pass


@extern("c_add_saturate")
def c_add_saturate(a: uint8, b: uint8) -> uint8:
    pass
```

The string is the **link symbol**. The Python name is what you call; they are usually the
same, but they do not have to be. The compiler emits a `.extern <symbol>` directive and a
normal `CALL`, and treats the symbol as a live root so it survives dead-code elimination.

Then call it like any other function:

```python
def main():
    uart = UART(9600)
    print("EXTERN")

    m: uint8 = c_mul8(3, 10)                # 30 = 0x1E
    s: uint8 = c_add_saturate(200, 100)     # 255 = 0xFF (saturated)
    a: uint8 = c_add_saturate(4, 6)         # 10 = 0x0A
```

## Write the C

```c
/* c_src/math_helper.c */
#include "math_helper.h"

uint8_t c_mul8(uint8_t a, uint8_t b) {
    return (uint8_t)(a * b);
}

uint8_t c_add_saturate(uint8_t a, uint8_t b) {
    uint16_t result = (uint16_t)a + (uint16_t)b;
    return result > 255u ? 255u : (uint8_t)result;
}
```

Nothing PyMCU-specific: plain freestanding C with `<stdint.h>` types. Give it a header so
the C side type-checks itself.

## Wire it into the build

Add a `[tool.pymcu.ffi]` section to `pyproject.toml`:

```toml
[project]
name = "extern-call"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "pymcu-stdlib>=0.1.2a5",
    "pymcu>=0.1.0a27"
]

[tool.pymcu]
target = "atmega328p"
frequency = 16000000
sources = "src"
entry = "main.py"

# C interop: build c_src/math_helper.c with avr-gcc and link via avr-ld.
[tool.pymcu.ffi]
sources = ["c_src/math_helper.c"]
include_dirs = ["c_src"]
cflags = ["-std=c11", "-Os"]
```

| Key | Type | Meaning |
|---|---|---|
| `sources` | list of paths | C / C++ files to compile, relative to the project root. **Its presence is what switches the build.** |
| `include_dirs` | list of paths | Added as `-I` to every compile |
| `cflags` | list of strings | Passed through verbatim after the built-in `-mmcu=<chip> -Os -c` |
| `linker_script` | path | Optional custom linker script. Omit it and the toolchain writes a chip-appropriate default (`dist/_pymcu.ld`) |

Then build as usual:

```bash
pymcu build
pymcu flash --port /dev/cu.usbmodemXXXX
```

## What the build actually does

A non-empty `sources` list is the trigger. `pymcu build` swaps the default assembler
pipeline for the GNU binutils one and runs four steps:

1. **Assemble** the generated `firmware.asm` to an ELF object with `avr-as`.
2. **Compile** each declared source. `.c` goes to `avr-gcc`; `.cpp`, `.cc`, `.cxx` and `.C`
   go to `avr-g++` with `-fno-exceptions -fno-rtti -std=c++17` added ahead of your
   `cflags`. Both get `-mmcu=<target> -Os -c` and your `include_dirs`.
3. **Link** `firmware.o` plus every C object into `firmware.elf`, using `avr-gcc` as the
   linker driver with `-nostartfiles`. Driving the link through the compiler is what makes
   `libgcc.a` resolve, so C code calling `__divmodhi4` or `__mulhi3` just works.
4. **Convert** the ELF to Intel HEX with `avr-objcopy`.

Those two C++ flags are the point of the exercise. Turning off exceptions and RTTI is what
makes an Arduino C++ library linkable into a bare-metal AVR image without dragging in a
runtime that has nowhere to live. Note that C++ symbols are mangled — an `@extern("f")`
declaration matches an unmangled symbol, so give anything you intend to call from PyMCU
`extern "C"` linkage on the C++ side.

## The calling convention

PyMCU emits calls that follow the avr-gcc ABI, so the C side sees exactly what it expects:

| Position | Register |
|---|---|
| Argument 0 | R24 |
| Argument 1 | R22 |
| Argument 2 | R20 |
| Argument 3 | R18 |
| Return value | R24 |

Wider types occupy the register pair upward from that slot, so a `uint16` argument 0
arrives in R25:R24. The `ffi-arduino` example passes three `uint16` values in one call
(`arduino_map(x, in_max, out_max)`) and gets a `uint16` back.

You do not have to take this on faith. The `ffi-abi` example is a set of probes that each
echo one argument back:

```python
@extern("abi_echo_arg0")
def abi_echo_arg0(a: uint8, b: uint8, c: uint8) -> uint8:
    pass
```

```c
uint8_t abi_echo_arg0(uint8_t a, uint8_t b, uint8_t c) { (void)b; (void)c; return a; }
```

Calling `abi_echo_arg0(10, 20, 30)` and getting `10` back proves argument 0 travelled in
R24. `abi_sub8(100, 30)` is non-commutative and returns `70` (`0x46`) rather than `186`
(`0xBA`), which proves the *order*. A final probe stores `0xAA` in a local, makes a C call,
and reads the local back — verifying callee-saved registers survive the boundary. Expected
UART output at 9600 baud:

```
ABI
0:0A
1:14
2:1E
3:04
S:46
K:AA
OK
```

## Five projects to start from

All five live in `examples/` in the AVR backend repository and ship a README with the
expected UART output. Four of them are covered by integration tests that build the example
and assert that output.

| Example | What it shows | Tested |
|---|---|---|
| `extern-call` | The minimal complete setup — two C functions, a `c_src/` directory, a full `pyproject.toml`. Start here. | Yes |
| `ffi-crc8` | Linking against **avr-libc**: `crc8.c` wraps `_crc_ibutton_update()` from `<util/crc16.h>`, the same CRC-8 the Arduino OneWire library uses to validate a DS18B20 ROM code | No |
| `ffi-abi` | Calling-convention probes, as above | Yes |
| `ffi-arduino` | Arduino's `map()` and `constrain()` as portable C, plus an ADC-to-PWM converter — the helpers a ported sketch reaches for. 32-bit intermediate math, `uint16` across the boundary | Yes |
| `ffi-dsp` | **Multiple C files in one build** (`math_utils.c` + `filter.c`), six `@extern` declarations covering clamp, lerp, scale, IIR smoothing and deadband | Yes |

`ffi-crc8` is the one to read if your motivation is "I want the library the Arduino
ecosystem already uses". It calls straight into avr-libc, and its README shows the
`OneWire::crc8()` snippet that produces the same number.

Multiple sources are just more list entries:

```toml
[tool.pymcu.ffi]
sources = [
    "c_src/math_utils.c",
    "c_src/filter.c",
]
include_dirs = ["c_src"]
cflags = ["-std=c11", "-Os"]
```

## Limits

- **AVR only.** Not RP2040, not RP2350, not PIC.
- **Scalar arguments and returns.** The examples cover `uint8` and `uint16` in both
  directions. Passing structs, pointers to Python objects or arrays across the boundary is
  not something the shipped examples exercise — treat it as unverified.
- **Four register arguments.** Beyond that, avr-gcc spills to the stack; the `ffi-arduino`
  header notes that its functions were deliberately reduced to three arguments so
  everything stays in registers.
- **The C side is on its own.** It is freestanding code linked with `-nostartfiles`. There
  is no C runtime startup, no `malloc` you should be calling, and no interaction with
  PyMCU's exception model — a C function cannot raise a Python exception.
- **Symbols must be unmangled.** Use `extern "C"` for anything you call from C++.

## Where this is tested

This guide is built from the `extern-call`, `ffi-abi`, `ffi-arduino`, `ffi-dsp` and
`ffi-crc8` examples in the AVR backend repository, and from the build driver's FFI path
(`src/driver/commands/build.py`) plus the AVR toolchain's `compile_c` / `link` steps. The
first four have integration tests that build the firmware and assert the UART output, so
the code above is exactly what is verified.

## See also

- [Language reference](/language-reference/) — `@extern` in the decorator table, and the
  full import rules
- [Limitations](/limitations/) — the AVR and ARM platform notes, including why this is
  AVR-only
- [Inline assembly](/guides/inline-asm/) — when you need one instruction rather than a
  whole C file
- [Targets](/targets/) — what each backend supports
