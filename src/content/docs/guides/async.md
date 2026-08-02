---
title: Async and await
description: Write cooperative tasks with async def and await in PyMCU — sleeping, return values, executors, and the time base each target actually provides.
---

`async def` and `await` give you several jobs making progress at once without an RTOS,
without threads and without a scheduler in RAM. Each coroutine is compiled to a zero-cost
state-machine class with a `poll()` method — the same thing you would hand-write, generated
for you.

Async is a **compiler feature**. It behaves identically whether you import `machine`,
`board` or `pymcu.hal.*` — there is no MicroPython or CircuitPython variant of this page.

## Blink two LEDs at different rates

```python
import asyncio
from pymcu.types import ptr, uint32
from pymcu.hal.gpio import Pin


def toggle(mask: uint32):
    xor: ptr[uint32] = ptr(0xD0000028)     # RP2350 SIO GPIO_OUT_XOR
    xor.value = mask


async def blink_a():
    while True:
        toggle(1 << 14)                    # GP14
        await asyncio.sleep_ms(400)


async def blink_b():
    while True:
        toggle(1 << 15)                    # GP15, 4x faster
        await asyncio.sleep_ms(100)


def main():
    Pin(14, Pin.OUT)                       # configure the pads as outputs
    Pin(15, Pin.OUT)
    a = blink_a()
    b = blink_b()
    while True:                            # cooperative executor
        a.poll()
        b.poll()
```

Two things are worth noticing. `import asyncio` is **required** — using `async def` without
it is a compile error, mirroring how CPython pairs the keywords with the runtime. And
calling `blink_a()` does not run anything: it constructs the state machine. Work happens
only when something polls it.

## `await` anywhere in the body

The awaitables are `asyncio.sleep(seconds)` and `asyncio.sleep_ms(ms)`, and they may appear
anywhere in a coroutine body — inside `if` / `elif` / `else`, inside `while <cond>`, and
inside `for i in range(...)`, at any nesting depth, with `break` and `continue` targeting
those loops:

```python
import asyncio
from pymcu.types import uint32
from pymcu.hal.uart import UART


async def worker(n: uint32):
    total: uint32 = 0
    for i in range(n):
        if i == 2:
            await asyncio.sleep_ms(2)
            total = total + 10
        else:
            await asyncio.sleep_ms(1)
            total = total + 1
    return total


async def pinger():
    k: uint32 = 0
    while k < 3:
        await asyncio.sleep_ms(1)
        k = k + 1
        if k == 2:
            continue
    print("P")
```

Locals are lifted to state-machine fields **only** when they must survive a suspension —
everything else stays in a register.

## Get a value back

`return expr` inside a coroutine stores the result, which you read from `._value` once the
coroutine has finished:

```python
def main():
    uart = UART(115200)
    uart.println("AV2")
    w = worker(4)
    p = pinger()
    asyncio.gather(w, p)
    r: uint32 = w._value
    print(f"T:{r}")
    while True:
        pass
```

### What you should see

```
AV2
P
T:13
```

`worker(4)` adds 1 for `i = 0`, 1 for `i = 1`, 10 for `i = 2` (the `if` branch) and 1 for
`i = 3` — total 13.

## Three ways to drive the tasks

| Executor | What it does | When to use it |
|---|---|---|
| `asyncio.run(coro)` | Polls one coroutine until it finishes (blocking) | A single task that terminates |
| `asyncio.gather(a, b)` | Polls two coroutines concurrently until both finish | Two tasks; the arity is **fixed at two** |
| Your own `while True:` loop calling `a.poll()` | Whatever you want | Three or more tasks, or tasks that never finish |

`gather` takes exactly two coroutines because a state machine has no runtime
representation to put in an array. For more tasks, nest gathers or write the poll loop
yourself — which is all `gather` is anyway:

```python
async def blink(): ...
async def sample(): ...
async def report(): ...


def main():
    a = blink()
    b = sample()
    c = report()
    while True:
        a.poll()
        b.poll()
        c.poll()
```

That three-task shape — heartbeat LED, sensor sampling, UART reporting — is the
`dht-async-rp2350` example, running on real Cortex-M33 silicon.

## The time base — check your target first

Every `await` waits on `asyncio.ticks()`, a free-running monotonic microsecond counter.
What backs it depends on the chip, and on two families **there is no backing at all**:

| Target | Time base | Resolution |
|---|---|---|
| RP2040 / RP2350 | Hardware `TIMER` (1 MHz) | 1 us, exact |
| ATmega (328P, 2560, 32U4, …) | Timer0 overflow counter + `TCNT0` — the same counter `pymcu.time` reads | 4 us at 16 MHz with prescaler 64; wraps every ~71 minutes, which `uint32` subtraction handles correctly |
| ATtiny, PIC, RISC-V | **None** — `ticks()` returns 0 | An `await` there never completes |

:::caution[No time base means an await that blocks forever]
On ATtiny, PIC and RISC-V the counter is frozen at 0, so the wait condition
`ticks() - start < duration` never clears and the coroutine is stuck at its first `await`.
These targets need a hardware time base before async is usable — use a plain
`while True:` loop with [`delay_ms`](/pymcu/stdlib/time/) instead.
:::

On ATmega, **Timer0 is reserved** for the async time base: `pymcu build` injects the
`millis_init()` call when it sees an `async def` in your sources, so do not also drive PWM
from Timer0 in an async program.

## What is not supported yet

| Not supported | Notes |
|---|---|
| `await` on another coroutine or a future | Only `asyncio.sleep` / `asyncio.sleep_ms` can be awaited. The compiler raises a clear error rather than miscompiling it |
| `await` as an expression (`x = await f()`) | `await` is statement-only — `await sleep_ms(n)` on its own line |
| More than two tasks in one `gather` | Nest gathers, or write the poll loop by hand |

See [Limitations](/pymcu/limitations/) and the [Roadmap](/pymcu/roadmap/).

## Where this is tested

This guide is built from three ARM examples that compile and run in CI:
`examples/async-v2-rp2040/` (await in `if` / `while` / `for`, `break` / `continue`,
`gather`, `._value`), `examples/async-blink-rp2350/` (two blink tasks, hand-written
executor) and `examples/dht-async-rp2350/` (three tasks with a real DHT11 sensor). The
runtime itself is `lib/src/pymcu/asyncio.py` in the monorepo — re-check both if this page
looks out of date.

## See also

- [Generators](/pymcu/guides/generators/) — the same state-machine lowering, without a time base
- [Time and delays](/pymcu/stdlib/time/) — the blocking alternative
- [UART](/pymcu/stdlib/uart/)
