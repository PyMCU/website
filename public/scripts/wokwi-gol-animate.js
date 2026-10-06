// Animates every <wokwi-ssd1306> element on the page that carries a
// data-gol-frames attribute, using frames this project decoded from a real
// I2C trace (see pymcu-avr's ssd1306-trace-dump tool): the actual bytes the
// compiled firmware sends on the wire, run through an emulated Arduino Uno.
//
// This script only calls the component's own public API, `imageData` /
// `redraw()` (see https://github.com/wokwi/wokwi-elements), and touches
// nothing else about it: no styling, no internals, no fork. The component
// itself loads from the unmodified, official build published on npm as
// @wokwi/elements (version pinned alongside this script's own <script> tag).

const ON = [120, 230, 255];
const OFF = [6, 10, 16];
const FPS = 8;

function paint(el, frame, width, height) {
  const w = el.screenWidth;
  const h = el.screenHeight;
  const buf = new Uint8ClampedArray(w * h * 4);
  for (let p = 0; p < w * h; p++) {
    const base = p * 4;
    buf[base] = OFF[0];
    buf[base + 1] = OFF[1];
    buf[base + 2] = OFF[2];
    buf[base + 3] = 255;
  }
  for (let y = 0; y < height && y < h; y++) {
    for (let x = 0; x < width && x < w; x++) {
      if (!frame[y * width + x]) continue;
      const base = (y * w + x) * 4;
      buf[base] = ON[0];
      buf[base + 1] = ON[1];
      buf[base + 2] = ON[2];
      buf[base + 3] = 255;
    }
  }
  el.imageData = new ImageData(buf, w, h);
  el.redraw();
}

async function animate(el) {
  const src = el.dataset.golFrames;
  if (!src) return;
  const { width, height, frames } = await fetch(src).then((r) => r.json());
  if (!frames || !frames.length) return;

  let i = 0;
  const tick = () => {
    paint(el, frames[i], width, height);
    i = (i + 1) % frames.length;
  };
  tick();
  setInterval(tick, 1000 / FPS);
}

function init() {
  const elements = document.querySelectorAll('wokwi-ssd1306[data-gol-frames]');
  if (!elements.length) return;
  customElements.whenDefined('wokwi-ssd1306').then(() => {
    elements.forEach(animate);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
