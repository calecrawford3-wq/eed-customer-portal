const noop = () => {};
const storage = { getItem: () => null, setItem: noop, removeItem: noop };
global.localStorage = storage;
global.window = {
  self: {}, top: {}, addEventListener: noop, removeEventListener: noop,
  location: { href: "https://portal.example/offer", search: "", pathname: "/" },
  history: { replaceState: noop, pushState: noop, state: null },
  localStorage: storage, sessionStorage: storage,
  matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }),
  navigator: { userAgent: "node" }, innerWidth: 390, innerHeight: 844,
  requestAnimationFrame: (cb) => setTimeout(cb, 0), cancelAnimationFrame: noop,
  setTimeout, clearTimeout,
};
global.document = {
  title: "",
  createElement: () => ({ style: {}, setAttribute: noop, appendChild: noop, classList: { add: noop, remove: noop } }),
  head: { appendChild: noop }, body: { appendChild: noop }, documentElement: { style: {} },
  addEventListener: noop, removeEventListener: noop, querySelector: () => null, querySelectorAll: () => [],
  createTextNode: () => ({}), getElementById: () => null,
};
global.navigator = { userAgent: "node" };
global.matchMedia = global.window.matchMedia;
global.history = global.window.history;