import { leafPaths } from '../lib/door';

type Lock = {
  n: number;
  plate: HTMLElement;
  fig: HTMLElement;
  steps: number;
  done: number;
  target: number;
  solved: boolean;
  manual: boolean;
  busy: boolean;
  hint: string;
  auto: () => Promise<void>;
  play: () => Promise<void>;
  finish: () => void;
  reset: () => void;
  scrub?: (p: number) => void;
};

// scroll: passing a lock opens it. play: every lock waits for the visitor. tour: the page solves itself.
type Mode = 'scroll' | 'play' | 'tour';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms: number) => new Promise<void>((done) => setTimeout(done, reduced ? 0 : ms));
const $ = <T extends Element>(root: ParentNode, sel: string) => root.querySelector(sel) as T;
const $$ = <T extends Element>(root: ParentNode, sel: string) => [...root.querySelectorAll(sel)] as T[];

const room = { mode: 'scroll' as Mode, start: performance.now(), solved: 0, byHand: 0, escaped: false, elapsed: 0, run: 0 };

// A reload starts the room over rather than landing past every lock.
if (!location.hash) history.scrollRestoration = 'manual';

function count(lock: Lock) {
  $(lock.plate, '[data-count]').textContent = `${lock.done}/${lock.steps}`;
}

function hint(lock: Lock, text: string) {
  $(lock.plate, '[data-hint]').textContent = text;
}

function boil(el: Element, ms = 1400) {
  el.classList.add('is-boiling');
  setTimeout(() => el.classList.remove('is-boiling'), ms);
}

function retrigger(el: Element, cls: string) {
  el.classList.remove(cls);
  void (el as HTMLElement).getBoundingClientRect();
  el.classList.add(cls);
}

function solve(lock: Lock, byHand: boolean) {
  if (lock.solved) return;
  lock.solved = true;
  lock.done = lock.steps;
  count(lock);
  lock.plate.classList.add('is-solved');
  hint(lock, byHand ? 'Picked by hand' : 'Opened');
  if (byHand) room.byHand++;
  $$(document, `[data-padlock="${lock.n}"]`).forEach((p) => p.classList.add('is-open'));
  $$(document, '[data-door]').forEach((d) => boil(d));
  document.querySelector(`[data-status-lock="${lock.n}"]`)?.classList.add('is-open');
  if (++room.solved === locks.length) escape();
  else report();
}

function base(plate: HTMLElement): Lock {
  const lock: Lock = {
    n: Number(plate.dataset.lock),
    plate,
    fig: $(plate, '[data-fig]'),
    steps: Number(plate.dataset.steps),
    done: 0,
    target: 0,
    solved: false,
    manual: false,
    busy: false,
    hint: $(plate, '[data-hint]').textContent ?? '',
    auto: async () => {},
    play: async () => {
      while (!lock.solved && lock.done < lock.steps) await lock.auto();
    },
    finish: () => {},
    reset: () => {}
  };
  return lock;
}

/* 1. Smoothboard: tap four targets to calibrate the Wii Remote. */
function calibrate(plate: HTMLElement): Lock {
  const lock = base(plate);
  const art = $<HTMLElement>(plate, '[data-puzzle]');
  const targets: [number, number][] = JSON.parse(art.dataset.targets!);
  const rest: [number, number] = JSON.parse(art.dataset.rest!);
  const marks = $$<SVGGElement>(art, '[data-target]');
  const pen = $<SVGGElement>(art, '[data-pen]');

  const mark = () =>
    marks.forEach((g, i) => {
      g.classList.toggle('is-done', i < lock.done);
      g.classList.toggle('is-next', i === lock.done && !lock.solved);
    });
  const move = ([x, y]: [number, number]) => (pen.style.transform = `translate(${x}px, ${y}px)`);

  async function tap(i: number, byHand: boolean) {
    if (i !== lock.done || lock.solved) return;
    move(targets[i]);
    await wait(400);
    if (i !== lock.done) return;
    retrigger(pen, 'is-tap');
    lock.done++;
    mark();
    count(lock);
    if (lock.done < lock.steps) return wait(140);
    await wait(260);
    move(rest);
    solve(lock, byHand);
    mark();
  }

  $$<HTMLButtonElement>(art, '[data-hit]').forEach((b) =>
    b.addEventListener('click', () => {
      const i = Number(b.dataset.hit);
      if (i === lock.done) tap(i, true);
      else if (!lock.solved) hint(lock, 'Start with the red one');
    })
  );
  lock.auto = () => tap(lock.done, false);
  lock.finish = () => {
    move(rest);
    solve(lock, false);
    mark();
  };
  lock.reset = () => {
    move(rest);
    mark();
  };
  mark();
  return lock;
}

/* 2. Smoothboard Air: each phone scans the code and adds a stroke. */
function join(plate: HTMLElement): Lock {
  const lock = base(plate);
  const art = $<HTMLElement>(plate, '[data-puzzle]');
  const phones = $$<SVGGElement>(art, '[data-phone]');
  const sights = $$<SVGLineElement>(art, '[data-sight]');
  const strokes = $$<SVGPathElement>(art, '[data-stroke]');
  const joined = new Set<number>();

  async function scan(i: number, byHand: boolean) {
    if (joined.has(i) || lock.solved) return;
    joined.add(i);
    phones[i].classList.add('is-scanning');
    await wait(480);
    phones[i].classList.add('is-joined');
    sights[i].classList.add('is-on');
    strokes[lock.done].classList.add('is-drawn');
    lock.done++;
    count(lock);
    if (lock.done < lock.steps) return wait(220);
    await wait(800);
    solve(lock, byHand);
  }

  $$<HTMLButtonElement>(art, '[data-hit]').forEach((b) =>
    b.addEventListener('click', () => scan(Number(b.dataset.hit), true))
  );
  lock.auto = () => scan(phones.findIndex((_, i) => !joined.has(i)), false);
  lock.finish = () => {
    phones.forEach((p, i) => {
      joined.add(i);
      p.classList.add('is-joined');
      sights[i].classList.add('is-on');
    });
    strokes.forEach((s) => s.classList.add('is-drawn'));
    solve(lock, false);
  };
  lock.reset = () => {
    joined.clear();
    phones.forEach((p) => p.classList.remove('is-scanning', 'is-joined'));
    sights.forEach((s) => s.classList.remove('is-on'));
    strokes.forEach((s) => s.classList.remove('is-drawn'));
  };
  return lock;
}

/* 3. Deck.Toys: a direction lock that wants the route drawn on the map. */
function path(plate: HTMLElement): Lock {
  const lock = base(plate);
  const art = $<HTMLElement>(plate, '[data-puzzle]');
  const stops: [number, number][] = JSON.parse(art.dataset.stops!);
  const route = ['up', 'right', 'down', 'right'];
  const turn: Record<string, number> = { up: 0, right: 90, down: 180, left: -90 };
  const slots = $$<SVGPathElement>(art, '[data-slot]');
  const legs = $$<SVGPathElement>(art, '[data-leg]');
  const marks = $$<SVGGElement>(art, '[data-stop]');
  const walker = $<SVGGElement>(art, '[data-walker]');
  const dlock = $<SVGGElement>(art, '[data-dlock]');
  const keypad = $<HTMLElement>(plate, '[data-keypad]');
  let wrong = false;

  const walk = () => {
    const [x, y] = stops[lock.done];
    walker.style.transform = `translate(${x}px, ${y}px)`;
    legs.forEach((l, i) => l.classList.toggle('is-walked', i < lock.done));
    marks.forEach((m, i) => m.classList.toggle('is-reached', i <= lock.done));
  };
  const set = (i: number, dir: string) => {
    slots[i].setAttribute('transform', `translate(${292.5 + i * 21} 123) rotate(${turn[dir]})`);
    slots[i].classList.add('is-set');
  };

  async function press(dir: string, byHand: boolean) {
    if (lock.solved || wrong) return;
    const key = keypad.querySelector(`[data-key="${dir}"]`);
    const pad = art.querySelector(`[data-dir="${dir}"]`);
    if (key) retrigger(key, 'is-pressed');
    if (pad) retrigger(pad, 'is-pressed');
    const i = lock.done;
    set(i, dir);

    if (dir !== route[i]) {
      wrong = true;
      retrigger(dlock, 'is-wrong');
      hint(lock, 'Not that way. Follow the dots from the flag');
      await wait(520);
      slots.forEach((s) => s.classList.remove('is-set'));
      lock.done = 0;
      walk();
      count(lock);
      wrong = false;
      return;
    }
    lock.done++;
    walk();
    count(lock);
    if (lock.done < lock.steps) return wait(240);
    await wait(420);
    solve(lock, byHand);
  }

  $$<HTMLButtonElement>(keypad, '[data-key]').forEach((b) =>
    b.addEventListener('click', () => press(b.dataset.key!, true))
  );
  keypad.addEventListener('keydown', (e) => {
    const dir = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key];
    if (!dir) return;
    e.preventDefault();
    lock.manual = true;
    press(dir, true);
  });
  lock.auto = () => press(route[lock.done], false);
  lock.finish = () => {
    route.forEach((dir, i) => set(i, dir));
    lock.done = lock.steps;
    walk();
    solve(lock, false);
  };
  lock.reset = () => {
    slots.forEach((s) => s.classList.remove('is-set'));
    walk();
  };
  return lock;
}

/* 4. AI: an open-answer lock judged by a simulated decision model. It runs in the page:
   cue words, plurals, joined words and near-misspellings score each choice, and a softmax
   turns the scores into the kind of probabilities a small classifier returns. */
type Verdict = { choice: string; probs: Record<string, number> };

const CUES: Record<string, [string, number][]> = {
  wii_remote: [
    ['wii', 1], ['wiimote', 1], ['wiiremote', 1], ['nintendo', 1], ['gamecontroller', 0.9], ['controller', 0.75],
    ['gamepad', 0.75], ['joystick', 0.6], ['remote', 0.65], ['wand', 0.6], ['infrared', 0.5], ['console', 0.5]
  ],
  phone: [
    ['phone', 1], ['smartphone', 1], ['handphone', 1], ['cellphone', 1], ['telephone', 0.8], ['iphone', 1],
    ['android', 0.9], ['mobile', 0.9], ['cell', 0.6], ['tablet', 0.6], ['ipad', 0.6], ['qrcode', 0.7], ['qr', 0.6]
  ],
  lock: [['lock', 1], ['padlock', 1], ['unlock', 0.8], ['locked', 0.8], ['combination', 0.6], ['latch', 0.6], ['key', 0.5]]
};

// Edit distance with transpositions, so "phoen" is one slip from "phone".
function distance(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

function match(word: string, cue: string) {
  if (word === cue) return 1;
  if (cue.length < 5) return 0;
  const slack = cue.length >= 8 ? 2 : 1;
  return Math.abs(word.length - cue.length) <= slack && distance(word, cue) <= slack ? 0.8 : 0;
}

function judgeLocally(text: string): Verdict {
  const words = text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/'s\b/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));
  const tokens = [...words, ...words.slice(1).map((w, i) => words[i] + w)];

  // Deterministic jitter, so different wrong answers don't all draw the same bars.
  let seed = [...text].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261);
  const jitter = () => ((seed = Math.imul(seed ^ (seed >>> 15), 2246822507)) >>> 0) / 2 ** 32 / 2 - 0.25;

  const logits: Record<string, number> = { none: (words.join('').length < 2 ? 4 : 1.5) + jitter() };
  for (const [key, cues] of Object.entries(CUES)) {
    const miss = cues.reduce((m, [cue, w]) => m * (1 - w * Math.max(0, ...tokens.map((t) => match(t, cue)))), 1);
    logits[key] = 5 * (1 - miss) + jitter();
  }
  const top = Math.max(...Object.values(logits));
  const exp = Object.fromEntries(Object.entries(logits).map(([k, l]) => [k, Math.exp(l - top)]));
  const total = Object.values(exp).reduce((a, b) => a + b, 0);
  const probs = Object.fromEntries(Object.entries(exp).map(([k, e]) => [k, e / total]));
  const choice = Object.keys(probs).reduce((a, b) => (probs[b] > probs[a] ? b : a));
  return { choice, probs };
}

function reader(plate: HTMLElement): Lock {
  const lock = base(plate);
  const art = $<HTMLElement>(plate, '[data-puzzle]');
  const form = $<HTMLFormElement>(art, '[data-form]');
  const input = $<HTMLInputElement>(art, '[data-input]');
  const button = $<HTMLButtonElement>(art, '[data-submit]');
  const card = $<HTMLElement>(art, '.card');
  const meta = $<HTMLElement>(art, '[data-meta]');
  const bars = $$<HTMLLIElement>(art, '[data-bar]');
  const idle = meta.textContent ?? '';
  const sample = 'the white Nintendo wand';
  let asked = false;
  let pending = false;

  function show(v: Verdict) {
    bars.forEach((li) => {
      const p = v.probs[li.dataset.bar!] ?? 0;
      li.style.setProperty('--p', `${(p * 100).toFixed(1)}%`);
      li.classList.toggle('is-top', li.dataset.bar === v.choice);
      $(li, '.bar-val').textContent = `${Math.round(p * 100)}%`;
    });
    meta.textContent = idle;
  }

  async function judge(text: string, byHand: boolean) {
    text = text.trim();
    if (!text) return hint(lock, 'Type an answer first');
    if (pending) return;
    pending = asked = true;
    const run = room.run;
    button.disabled = true;
    meta.textContent = 'Reading…';
    await wait(380);
    const v = judgeLocally(text);
    if (run !== room.run) return;
    show(v);
    pending = button.disabled = false;
    const heard = v.choice !== 'none' && v.probs[v.choice] >= 0.4;
    if (heard || !byHand) return solve(lock, byHand);
    asked = false;
    retrigger(card, 'is-wrong');
    hint(lock, 'Not in this room. Try again');
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    lock.manual = true;
    judge(input.value, true);
  });
  input.addEventListener('input', () => (lock.manual = true));
  lock.scrub = (p) => {
    if (asked) return;
    input.value = sample.slice(0, Math.round(p * sample.length));
    if (p >= 1) judge(sample, false);
  };
  lock.play = async () => {
    if (asked) return;
    for (let i = input.value.length; i <= sample.length; i++) {
      input.value = sample.slice(0, i);
      await wait(45);
    }
    await judge(sample, false);
  };
  lock.finish = () => {
    if (lock.solved) return;
    if (!asked) {
      input.value = sample;
      judge(sample, false);
    }
    solve(lock, false);
  };
  lock.reset = () => {
    asked = pending = false;
    button.disabled = false;
    input.value = '';
    meta.textContent = idle;
    bars.forEach((li) => {
      li.style.removeProperty('--p');
      li.classList.remove('is-top');
      $(li, '.bar-val').textContent = '–';
    });
  };
  return lock;
}

/* The door: padlocks drop as locks open, then it swings out. Reset swings it back. */
const OPEN = 1.22;

function swing(door: HTMLElement, from: number, to: number, delay: number, ms: number) {
  const parts = Object.fromEntries($$<SVGElement>(door, '[data-leaf]').map((el) => [el.dataset.leaf, el]));
  const draw = (theta: number) => {
    const g = leafPaths(theta);
    for (const key of ['leaf', 'moulding', 'panels', 'bevels', 'plate'] as const) parts[key].setAttribute('d', g[key]);
    parts.shade.setAttribute('d', g.leaf);
    parts.shade.setAttribute('opacity', (Math.sin(theta) * 0.65).toFixed(2));
    for (const [k, v] of Object.entries(g.knob)) parts.knob.setAttribute(k, v);
  };
  return new Promise<void>((done) => {
    const t0 = performance.now() + (reduced ? 0 : delay);
    const frame = (now: number) => {
      const t = reduced ? 1 : Math.min(1, Math.max(0, (now - t0) / ms));
      const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
      draw(from + (to - from) * e);
      if (t < 1) requestAnimationFrame(frame);
      else done();
    };
    requestAnimationFrame(frame);
  });
}

async function open(door: HTMLElement) {
  if (door.dataset.open) return;
  door.dataset.open = '1';
  door.classList.add('is-chain-gone');
  boil(door, 2800);
  await swing(door, 0, OPEN, 650, 1700);
  if (door.dataset.open) door.classList.add('is-escaped');
}

async function close(door: HTMLElement) {
  door.classList.remove('is-escaped');
  if (door.dataset.open) {
    delete door.dataset.open;
    boil(door, 1600);
    await swing(door, OPEN, 0, 0, 900);
  }
  door.classList.remove('is-chain-gone');
}

function visible(el: Element) {
  const r = el.getBoundingClientRect();
  return r.height > 0 && r.bottom > innerHeight * 0.15 && r.top < innerHeight * 0.85;
}

const doors = $$<HTMLElement>(document, '[data-door]');
const later = new IntersectionObserver(
  (entries) =>
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      later.unobserve(e.target);
      open(e.target as HTMLElement);
    }),
  { threshold: 0.4 }
);
let opening = 0;

function escape() {
  room.escaped = true;
  room.elapsed = performance.now() - room.start;
  tick();
  report();
  document.body.classList.add('is-escaped');
  opening = window.setTimeout(() => doors.forEach((d) => (visible(d) ? open(d) : later.observe(d))), reduced ? 0 : 1100);
}

/* The exit's game line: time and score once out, or what's still shut. */
const stat = document.querySelector('[data-stat]');
const again = document.querySelector<HTMLButtonElement>('[data-again]');
const rest = document.querySelector<HTMLButtonElement>('[data-finish]');

function report() {
  if (!stat || !again || !rest) return;
  const shut = locks.filter((l) => !l.solved).map((l) => l.n);
  again.hidden = !room.escaped;
  rest.hidden = room.escaped || room.mode !== 'play';
  if (room.escaped) stat.textContent = `Escaped in ${clock(room.elapsed)} · picked ${room.byHand} of 4 by hand`;
  else if (room.mode === 'play') stat.textContent = `Still shut: lock ${shut.join(', ')}`;
  else stat.textContent = '';
}

/* Timer */
const timer = document.querySelector('[data-timer]');
const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
function tick() {
  if (timer) timer.textContent = clock(room.escaped ? room.elapsed : performance.now() - room.start);
}
setInterval(tick, 1000);

/* Locks */
const kinds: Record<string, (plate: HTMLElement) => Lock> = { calibrate, join, path, reader };
const locks = $$<HTMLElement>(document, '[data-lock]').map((plate) => {
  const lock = kinds[$<HTMLElement>(plate, '[data-puzzle]').dataset.puzzle!](plate);
  lock.fig.addEventListener('pointerdown', (e) => {
    if ((e.target as Element).closest('button, input')) lock.manual = true;
  });
  return lock;
});

async function pump(lock: Lock) {
  if (lock.busy) return;
  lock.busy = true;
  while (!lock.manual && !lock.solved && lock.done < lock.target) await lock.auto();
  lock.busy = false;
}

let queued = false;
function onScroll() {
  queued = false;
  if (room.mode === 'tour') return;
  const vh = innerHeight;
  for (const lock of locks) {
    if (lock.solved) continue;
    const r = lock.fig.getBoundingClientRect();
    if (r.bottom < 0) {
      if (room.mode === 'scroll') lock.finish();
      continue;
    }
    if (lock.manual) continue;
    const [start, end] = [vh * 0.85, vh * 0.3];
    const p = Math.min(1, Math.max(0, (start - r.top) / (start - end)));
    if (lock.scrub) {
      lock.scrub(p);
      continue;
    }
    lock.target = Math.max(lock.target, Math.floor(p * lock.steps + 1e-6));
    pump(lock);
  }
}
addEventListener(
  'scroll',
  () => {
    if (!queued) requestAnimationFrame(onScroll);
    queued = true;
  },
  { passive: true }
);
addEventListener('resize', onScroll);

/* Ways in: try the locks yourself, or watch the page solve them. */
function goTo(el: Element, block: number) {
  const top = el.getBoundingClientRect().top + scrollY - innerHeight * block;
  scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' });
}

function play() {
  room.mode = 'play';
  locks.forEach((l) => (l.manual = true));
  report();
  const first = locks.find((l) => !l.solved);
  if (!first) return;
  goTo(first.plate, 0);
  first.fig.querySelector<HTMLElement>('button:not([disabled]), input')?.focus({ preventScroll: true });
}

async function tour() {
  room.mode = 'tour';
  const run = ++room.run;
  const stop = () => {
    if (room.run === run && room.mode === 'tour') room.mode = 'scroll';
  };
  ['wheel', 'touchstart', 'keydown'].forEach((ev) => addEventListener(ev, stop, { once: true, passive: true }));
  for (const lock of locks) {
    if (lock.solved) continue;
    goTo(lock.fig, 0.18);
    await wait(750);
    if (room.mode !== 'tour' || room.run !== run) return;
    lock.manual = true;
    await lock.play();
    await wait(650);
    if (room.mode !== 'tour' || room.run !== run) return;
  }
  goTo(document.querySelector('#exit')!, 0);
  room.mode = 'scroll';
}

async function reset() {
  room.run++;
  clearTimeout(opening);
  later.disconnect();
  Object.assign(room, { solved: 0, byHand: 0, escaped: false, elapsed: 0, start: performance.now() });
  document.body.classList.remove('is-escaped');
  $$(document, '[data-status-lock]').forEach((s) => s.classList.remove('is-open'));
  locks.forEach((lock) => {
    Object.assign(lock, { solved: false, done: 0, target: 0, manual: false });
    lock.plate.classList.remove('is-solved');
    hint(lock, lock.hint);
    count(lock);
    lock.reset();
  });
  tick();
  play();
  await Promise.all(doors.map(close));
  $$(document, '[data-padlock]').forEach((p) => p.classList.remove('is-open'));
}

$$<HTMLButtonElement>(document, '[data-start]').forEach((b) =>
  b.addEventListener('click', () => (b.dataset.start === 'play' ? play() : tour()))
);
again?.addEventListener('click', reset);
rest?.addEventListener('click', () => locks.forEach((l) => l.finish()));
document.querySelector('[data-skip]')?.addEventListener('click', () => locks.forEach((l) => l.finish()));

onScroll();
