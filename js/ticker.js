// Background tabs throttle main-thread timers (Chrome goes down to once a minute), which starves
// the host's game loop and the PeerJS heartbeats. Timers inside a worker keep their pace, so the
// worker posts ticks and the page does its periodic work on those.
const SOURCE = 'let id; onmessage = (e) => { clearInterval(id); id = setInterval(() => postMessage(0), e.data); };';

export function every(ms, fn) {
  try {
    const url = URL.createObjectURL(new Blob([SOURCE], { type: 'text/javascript' }));
    const worker = new Worker(url);
    URL.revokeObjectURL(url);
    worker.onmessage = () => fn();
    worker.postMessage(ms);
    return () => worker.terminate();
  } catch {
    const id = setInterval(fn, ms);
    return () => clearInterval(id);
  }
}
