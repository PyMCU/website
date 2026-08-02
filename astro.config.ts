import { defineConfig } from 'astro/config';

import starlight from '@astrojs/starlight';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  site: 'https://docs.pymcu.dev',
  output: 'static',

  integrations: [
    starlight({
      title: 'PyMCU',
      description:
        'PyMCU compiles a statically-typed, allocation-free subset of Python to bare-metal firmware for AVR, ARM (RP2040 / RP2350) and PIC.',
      favicon: '/favicon.svg',
      head: [
        {
          tag: 'link',
          attrs: { rel: 'icon', href: '/favicon.ico', sizes: '32x32' },
        },
      ],
      // origin is https://github.com/PyMCU/website.git, default branch main.
      editLink: {
        baseUrl: 'https://github.com/PyMCU/website/edit/main/',
      },
      lastUpdated: true,
      components: {
        SiteTitle: './src/components/starlight/SiteTitle.astro',
      },
      customCss: [
        './src/styles/custom.css',
      ],
      social: [
        { label: 'GitHub', href: 'https://github.com/PyMCU/PyMCU', icon: 'github' },
      ],
      sidebar: [
        {
          label: 'Getting Started',
          items: [
            { label: 'Introduction', slug: 'index' },
            { label: 'Installation', slug: 'getting-started/installation' },
            { label: 'Quick Start', slug: 'getting-started/quickstart' },
            { label: 'Supported Targets', slug: 'targets' },
            { label: 'Troubleshooting & FAQ', slug: 'troubleshooting' },
            // Debugging & Profiling is unpublished (draft) until the debugger,
            // profiler and editor extensions ship.
          ],
        },
        {
          // Migration and Compatibility were two groups covering the same four
          // pages; paired dialect-major so "port it" sits beside "look it up".
          label: 'MicroPython & CircuitPython',
          items: [
            { label: 'Port a MicroPython project', slug: 'migration/from-micropython' },
            { label: 'MicroPython API reference', slug: 'compat/micropython' },
            { label: 'Port a CircuitPython project', slug: 'migration/from-circuitpython' },
            { label: 'CircuitPython API reference', slug: 'compat/circuitpython' },
          ],
        },
        {
          label: 'Standard Library',
          collapsed: true,
          items: [
            { label: 'Overview', slug: 'stdlib' },
            { label: 'GPIO', slug: 'stdlib/gpio' },
            { label: 'UART', slug: 'stdlib/uart' },
            { label: 'ADC', slug: 'stdlib/adc' },
            { label: 'SPI', slug: 'stdlib/spi' },
            { label: 'I2C', slug: 'stdlib/i2c' },
            { label: 'PWM', slug: 'stdlib/pwm' },
            { label: 'Timer', slug: 'stdlib/timer' },
            { label: 'Delays (time)', slug: 'stdlib/time' },
            { label: 'Interrupts', slug: 'stdlib/interrupts' },
            { label: 'EEPROM', slug: 'stdlib/eeprom' },
            { label: 'Watchdog', slug: 'stdlib/watchdog' },
            { label: 'Power / sleep', slug: 'stdlib/power' },
            { label: 'FixedDict (collections)', slug: 'stdlib/collections' },
            {
              // ARM-only: keeps an AVR reader from scanning past two modules
              // their chip cannot run.
              label: 'Raspberry Pi Pico only',
              items: [
                { label: 'PIO (@rp2.asm_pio)', slug: 'stdlib/pio' },
                { label: 'WiFi & MQTT (CYW43)', slug: 'stdlib/wifi' },
              ],
            },
            {
              label: 'Drivers',
              collapsed: true,
              items: [
                { label: 'DHT11', slug: 'stdlib/drivers/dht11' },
                { label: 'DS18B20', slug: 'stdlib/drivers/ds18b20' },
                { label: 'BMP280', slug: 'stdlib/drivers/bmp280' },
                { label: 'HD44780 LCD', slug: 'stdlib/drivers/lcd' },
                { label: 'SSD1306 OLED', slug: 'stdlib/drivers/ssd1306' },
                { label: 'MAX7219', slug: 'stdlib/drivers/max7219' },
                { label: 'WS2812 NeoPixel', slug: 'stdlib/drivers/neopixel' },
              ],
            },
          ],
        },
        {
          // Narrative and read-in-order, deliberately kept apart from the
          // lookup-only Reference group so it can grow without bloating it.
          label: 'Language guides',
          items: [
            { label: 'Zero-cost classes', slug: 'guides/zero-cost-classes' },
            { label: 'Exceptions', slug: 'guides/exceptions' },
            { label: 'f-strings', slug: 'guides/f-strings' },
            { label: 'dict, set and FixedDict', slug: 'guides/dicts' },
            { label: 'Generators (yield)', slug: 'guides/generators' },
            { label: 'async / await', slug: 'guides/async' },
            { label: 'Calling C with @extern', slug: 'guides/c-interop' },
            { label: 'Inline assembly', slug: 'guides/inline-asm' },
          ],
        },
        {
          label: 'Examples',
          collapsed: true,
          items: [
            { label: 'Overview', slug: 'examples' },
            { label: 'Blink', slug: 'examples/blink' },
            { label: 'UART Echo', slug: 'examples/uart-echo' },
            { label: 'Tuple Operations', slug: 'examples/tuple-ops' },
            { label: 'Sensor Dashboard', slug: 'examples/sensor-dashboard' },
            { label: 'Class Inheritance', slug: 'examples/inheritance-zca' },
            { label: 'Raspberry Pi Pico / Pico 2', slug: 'examples/rp2040' },
          ],
        },
        {
          // Consulted, never read start to finish.
          label: 'Reference',
          items: [
            { label: 'Language Reference', slug: 'language-reference' },
            { label: 'pymcu CLI', slug: 'driver' },
            { label: 'Limitations', slug: 'limitations' },
          ],
        },
        {
          label: 'Project',
          items: [
            { label: 'Roadmap', slug: 'roadmap' },
            { label: 'Changelog', slug: 'changelog' },
            { label: 'Contributing', slug: 'contributing' },
          ],
        },
      ],
    }),
    tailwind({
      applyBaseStyles: false,
    }),
  ],
});
