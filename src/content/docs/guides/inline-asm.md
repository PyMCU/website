---
title: Inline assembly
description: "Drop to assembly from Python with asm(): AVR %N register constraints, the ARM operand rules and memory clobber, multi-line blocks, and @naked functions."
---

Occasionally the generated code is not the code you need. A context switch has to own the
stack pointer. A critical section has to be exactly two instructions long. A bit-bang
protocol has to hit a cycle count. `asm()` is the door out.

`asm()` is a compiler intrinsic: it takes a compile-time string and emits it verbatim into
the output for the target you are building. It is PyMCU-specific — there is no MicroPython
or CircuitPython equivalent to tab against.

## Emit one instruction

```python
asm("cli")     # disable interrupts (AVR)
asm("sei")     # enable interrupts (AVR)
asm("nop")     # no-operation
```

The argument must be a **compile-time string**. A string literal or an f-string that folds
to one both work; a variable does not, and gives you a located `CompileError`
(`asm() argument must be a string literal, got variable 'x'`).

`asm` is available as an intrinsic without importing it, but importing it keeps editors and
type checkers quiet:

```python
from pymcu.types import asm
```

## Pass Python variables in — AVR

Add operands after the string and refer to them as `%0`, `%1`, `%2`, `%3`:

```python
from pymcu.types import uint8, asm
from pymcu.chips.atmega328p import GPIOR0


def main():
    result: uint8 = 0
    asm("LDI %0, 42", result)       # result = 42
    GPIOR0.value = result

    src: uint8 = 0xFF
    dst: uint8 = 0
    asm("MOV %0, %1", dst, src)     # dst = 0xFF
    GPIOR0.value = dst

    val: uint8 = 9
    asm("INC %0", val)              # val = 10
    GPIOR0.value = val
```

On AVR the mapping is fixed and documented, which is the whole reason to use this form
rather than hand-written register names:

| Placeholder | Register |
|---|---|
| `%0` | R16 |
| `%1` | R17 |
| `%2` | R18 |
| `%3` | R19 |

The compiler loads each operand into its scratch register, substitutes the register name
into your template, emits the instruction, and then **stores every non-constant operand
back** into its variable. Three consequences worth internalising:

- Operands are `uint8`. Wider values are not loaded or stored as pairs by this form.
- The maximum is four operands. A fifth is a build error: `asm() constraint: maximum 4 operands (%0-%3)`.
- Every variable operand is read-write. `asm("MOV %0, %1", dst, src)` writes `src` back too
  — unchanged, but it is a store you did not ask for. Pass a constant if you only need to
  read.

That is the `asm-constraints` fixture, which checks `GPIOR0` after each block.

### Referring to a global by name

Inside an operand-less AVR block, `{name}` interpolates to the SRAM label of a module
global, so assembly can reach state that Python owns:

```python
_tick: uint16 = 0

asm("""
    lds  r20, {_tick}
    lds  r21, {_tick} + 1
""")
```

The lookup prefers a global in the current module and then an unambiguous cross-module
match. A name the compiler does not recognise is left alone, which is what makes local
labels work. If the variable happens to be **register-allocated** you get a clear build
error — `asm() interpolation: '<name>' is register-allocated; use a Python local to copy
it first` — rather than a wrong address.

This is used in earnest by the AVR `rtos-multitask` example's `rtos.py`.

## Pass Python variables in — ARM

The surface is the same, `%0`-`%3`, and the same four-operand maximum applies. The rules
underneath are different, and the differences matter:

```python
from pymcu.types import uint32
from pymcu.hal.uart import UART


def main():
    uart = UART(115200)
    uart.println("ASM")

    a: uint32 = 41
    asm("adds %0, %0, #1", a)
    print(a)

    b: uint32 = 10
    c: uint32 = 42
    asm("adds %0, %0, %1", b, c)
    print(b)
```

Expected UART output at 115200 baud:

```
ASM
42
52
```

What is different from AVR:

- **LLVM picks the registers.** There is no `%0` = R16 rule. A snippet that assumes a
  specific register number is wrong on ARM — refer to operands only through `%N`.
- **Operands are 32-bit.** Values are passed and written back as `i32`.
- **Non-constant operands are tied read-write**, exactly as on AVR: loaded before, stored
  back after. Constant operands become immediates instead and are not written back.
- **The condition flags and memory are clobbered** for you (`~{cc}`, `~{memory}`), so LLVM
  will not cache a value across your block.

### The constraint syntax question

You never write constraints in PyMCU source. The compiler derives them, and when it writes
textual LLVM IR it spells a tied read-write operand as an output `"=r"` plus an input tied
by number (`"0"`) — **not** as `"+r"`, which textual LLVM IR does not accept in this
position. That is an implementation detail of the emitter rather than something you choose,
but it is the reason you will not find a `"+r"` form documented anywhere: it does not exist
on this path.

Built from the `asm-ops-rp2040` example.

### Operand-less `asm()` on ARM clobbers memory

This one is recent and worth understanding, because the failure mode is silent.

An `asm()` call with no operands is emitted as a side-effecting barrier that **also clobbers
memory**. Without that clobber, LLVM is free to hoist a load above the snippet or sink a
store below it — and since `enable_interrupts()` / `disable_interrupts()` lower to
`asm("cpsie i")` / `asm("cpsid i")` on Cortex-M, that optimisation would move the body of a
critical section outside the very instructions meant to protect it. The code would look
right, compile clean, and race.

```python
from pymcu.hal.irq import enable_interrupts, disable_interrupts

counter: uint32 = 0


def bump():
    global counter
    disable_interrupts()
    counter = counter + 1
    enable_interrupts()
```

Expected UART output:

```
IRQ
C:3
OK
```

The `irq-critical-rp2040` example exists specifically to assert that `cpsid` / `cpsie` are
emitted, correctly encoded, and memory-fenced. If you are writing your own critical section
with a raw `asm("cpsid i")`, you get the same fence.

## Multi-line blocks

A triple-quoted string is a single compile-time constant, so it is the natural form for
anything longer than one instruction. The leading newline after the opening quote is
stripped; the rest is passed through verbatim. Both `"""` and `'''` work.

```python
asm("""
    LDI r16, 42
    STS 0x3E, r16
""")
```

Fixture: `asm-triple-quote`.

An f-string works too, as long as every interpolated expression is a compile-time constant.
This is how you build a parameterised instruction — `SBI` and `CBI` need their operands as
immediates, so they cannot be `%N` register operands:

```python
from pymcu.types import const, uint8, inline, asm


@inline
def sbi(port: const[uint8], bit: const[uint8]):
    asm(f"SBI {port}, {bit}")


@inline
def cbi(port: const[uint8], bit: const[uint8]):
    asm(f"CBI {port}, {bit}")


def main():
    sbi(0x0A, 5)    # DDRD  bit 5 -> PD5 is an output
    sbi(0x0B, 5)    # PORTD bit 5 -> PD5 high
    cbi(0x0B, 5)    # PORTD bit 5 -> PD5 low
```

If an interpolation does not fold, the build stops with `asm() f-string did not resolve to
a string constant`. Fixture: `asm-fstring`.

## Labels inside `@inline` do not work

An `@inline` function is expanded at **every** call site. If its body contains an assembly
block with a label, that label is emitted once per call site and the assembler rejects the
duplicate.

So: an `@inline` function containing `asm()` with labels must delegate to a non-inline
helper. Put the labelled block in a plain `def` (or a `@naked` one) and call it.

```python
# Wrong: called twice -> the assembler sees `_loop:` defined twice
@inline
def spin():
    asm("""
        ldi  r18, 40
    _loop:
        dec  r18
        brne _loop
    """)


# Right: one copy of the body, one definition of the label, called as often as you like
def spin():
    asm("""
        ldi  r18, 40
    _loop:
        dec  r18
        brne _loop
    """)
```

The AVR `rtos-multitask` example states the rule directly in its systick ISR: the
save/restore context blocks are written out inline precisely "because `@inline` + `asm()` +
labels would duplicate labels at each call site".

## `@naked` — own the whole function

`@naked` tells the compiler to emit **no prolog and no epilog**. Nothing is pushed, nothing
is popped, no frame is set up, and no return instruction is appended. At entry the registers
hold raw calling-convention values, and the body is responsible for returning.

```python
from pymcu.types import naked
```

On **AVR**, `@naked` suppresses the trailing `RET`, so your assembly must end with one:

```python
@naked
def delay_ms(ms: uint16):
    # r24:r25 = ms at entry (AVR calling convention). r18-r23 are caller-saved
    # scratch, so callee-saved registers are untouched.
    asm("""
    mov  r18, r24
    mov  r19, r25
    lds  r20, {_tick}
    lds  r21, {_tick} + 1
_rtos_dl_lp:
    lds  r22, {_tick}
    lds  r23, {_tick} + 1
    sub  r22, r20
    sbc  r23, r21
    cp   r22, r18
    cpc  r23, r19
    brcs _rtos_dl_lp
    ret
    """)
```

That is what makes the argument readable as a raw register pair: with a prolog in the way,
`ms` would already have been spilled to a frame slot.

On **ARM**, the function is emitted with LLVM's `naked noinline` attributes and the block
ends in `unreachable` — the compiler assumes your assembly returns by itself, via `bx lr`,
a `pop {..., pc}`, or an exception return. This is what lets a scheduler written in Python
perform a real context switch:

```python
@naked
def taskYIELD():
    asm("""
        push {r4-r7, lr}
        mov  r4, r8
        ...
        pop  {r4-r7, pc}
    """)
```

Both snippets are from shipped RTOS examples: `rtos-multitask` on AVR and
`rtos-coop-blink` / `rtos-preempt-blink` on ARM.

`@naked` also composes with `@interrupt(vector)` on AVR, which suppresses the automatic
context save and restore — appropriate only when your assembly does the saving itself, as a
preemptive scheduler's systick must.

## Limits

| Limit | Detail |
|---|---|
| String must be compile-time | Literal, triple-quoted literal, or a fully-folding f-string. Not a variable |
| Four operands maximum | `%0`-`%3` on both AVR and ARM |
| AVR operands are `uint8` | Wider variables are not handled as register pairs by the `%N` form |
| ARM operands are `i32` | And LLVM, not you, chooses the register |
| Every variable operand is written back | Even if your instruction only reads it. Pass a constant to avoid the store |
| Labels forbid `@inline` | Delegate to a non-inline helper |
| `@naked` gives you no return | You must write it |
| The assembly is not portable | Nothing checks that an AVR mnemonic makes sense on a Cortex-M0+. Guard target-specific blocks with `match __CHIP__.arch:` |

## Where this is tested

This guide is built from the `asm-constraints`, `asm-triple-quote` and `asm-fstring`
fixtures in the AVR integration suite (`tests/integration/fixtures/`), the `asm-ops-rp2040`
and `irq-critical-rp2040` examples in the ARM backend repository, and the `rtos-multitask`
(AVR) and `rtos-coop-blink` / `rtos-preempt-blink` (ARM) examples for `@naked`. All of them
compile and run in CI, so the code above is exactly what is verified — check there first if
anything on this page looks out of date.

## See also

- [Language reference](/language-reference/) — `asm()`, `ptr[T]`, `const[T]` and `__CHIP__`
  in the MCU-specific extensions section
- [Limitations](/limitations/) — including the Z-register pointer-walk idiom
- [C and C++ interop](/guides/c-interop/) — when a whole C file beats a snippet
- [Zero-cost classes](/guides/zero-cost-classes/) — the other half of "the compiler gets out
  of your way"
