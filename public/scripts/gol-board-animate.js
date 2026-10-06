// Animates every <canvas data-gol-frames="..."> element on the page with
// frames this project decoded from a real I2C trace (see pymcu-avr's
// ssd1306-trace-dump tool): the actual bytes the compiled firmware sends
// on the wire, run through an emulated Arduino Uno. The canvas sits over
// the real Wokwi SSD1306 board artwork (wokwi-boards, board.svg, see
// /images/wokwi-ssd1306-board.svg and its SOURCE.md); this script paints
// only the canvas and never touches that artwork.

const ON = 'rgb(120, 230, 255)';
const OFF = 'rgb(6, 10, 16)';
const FPS = 8;

function paint(ctx, frame, width, height) {
  ctx.fillStyle = OFF;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = ON;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (frame[y * width + x]) ctx.fillRect(x, y, 1, 1);
    }
  }
}

async function animate(canvas) {
  const src = canvas.dataset.golFrames;
  if (!src) return;
  const { width, height, frames } = await fetch(src).then((r) => r.json());
  if (!frames || !frames.length) return;

  const ctx = canvas.getContext('2d');
  let i = 0;
  const tick = () => {
    paint(ctx, frames[i], width, height);
    i = (i + 1) % frames.length;
  };
  tick();
  setInterval(tick, 1000 / FPS);
}

function init() {
  document.querySelectorAll('canvas[data-gol-frames]').forEach(animate);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
