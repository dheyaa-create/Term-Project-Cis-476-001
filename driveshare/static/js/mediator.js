/**
 * mediator.js  -  MEDIATOR PATTERN (UI components)
 * =================================================
 *
 * Problem
 * -------
 * Several widgets on a page depend on each other. On the car page, changing
 * the pick-up date must refresh the price quote, enable/disable the "Book"
 * button and pre-fill the "Watch" form. If every widget referenced every
 * other widget directly we would get a tangled many-to-many web that is hard
 * to change.
 *
 * Solution
 * --------
 * Widgets (``Component`` subclasses) never talk to each other. They only
 * call ``this.emit(event, payload)``, which forwards to their mediator. The
 * concrete mediator is the single place that knows how the widgets
 * cooperate and decides who must react:
 *
 *   BookingMediator  : DateRangePicker, PriceQuote, BookButton, WatchForm
 *   SearchMediator   : SearchFilters, ResultsList, ResultCount
 *   NavMediator      : Poller, NotificationBell, Toast
 *
 * Adding a new widget means touching only the mediator, not the others.
 */

/* ======================================================================= */
/* Abstract mediator and component                                         */
/* ======================================================================= */
class Mediator {
  constructor() { this.components = {}; }

  /** Register a component under a name and give it a back-reference. */
  register(name, component) {
    this.components[name] = component;
    component.setMediator(this, name);
    return this;
  }

  /** Called by components. Concrete mediators override this. */
  notify(sender, event, payload) {
    throw new Error("notify() must be implemented by a concrete mediator");
  }
}

class Component {
  constructor(element) { this.el = element; this.mediator = null; this.name = ""; }
  setMediator(mediator, name) { this.mediator = mediator; this.name = name; }
  /** The ONLY way a component communicates with the rest of the page. */
  emit(event, payload) { if (this.mediator) this.mediator.notify(this, event, payload); }
}

const money = (n) => "$" + Number(n).toFixed(2);
const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ======================================================================= */
/* Car page: booking panel components                                      */
/* ======================================================================= */
class DateRangePicker extends Component {
  constructor(startInput, endInput) {
    super(startInput);
    this.start = startInput; this.end = endInput;
    const changed = () => {
      // keep drop-off after pick-up: a small local rule, no other widget involved
      if (this.start.value) this.end.min = this.start.value;
      this.emit("datesChanged", this.range());
    };
    this.start.addEventListener("change", changed);
    this.end.addEventListener("change", changed);
  }
  range() { return { start: this.start.value, end: this.end.value }; }
}

class PriceQuote extends Component {
  show(q) {
    this.el.className = "quote ok";
    this.el.innerHTML = `${q.days} day${q.days > 1 ? "s" : ""} &times; ${money(q.price_per_day)}
      = <strong>${money(q.total)}</strong>`;
  }
  error(reason) { this.el.className = "quote bad"; this.el.textContent = reason; }
  hint(text) { this.el.className = "quote"; this.el.textContent = text; }
}

class BookButton extends Component {
  enable(total) { this.el.disabled = false; this.el.textContent = `Request to book · ${money(total)}`; }
  disable(label) { this.el.disabled = true; this.el.textContent = label || "Request to book"; }
}

class WatchForm extends Component {
  /** Copy the dates the renter is looking at into the watch form. */
  prefill(range) {
    if (!this.el) return;
    this.el.querySelector("[name=start]").value = range.start;
    this.el.querySelector("[name=end]").value = range.end;
  }
  highlight(on) { if (this.el) this.el.classList.toggle("pulse", on); }
}

class BookingMediator extends Mediator {
  constructor(carId) { super(); this.carId = carId; }

  async notify(sender, event, payload) {
    const { quote, book, watch } = this.components;
    if (event !== "datesChanged") return;
    if (!payload.start || !payload.end) {
      quote.hint("Choose pick-up and drop-off times to see the price.");
      book.disable(); watch.highlight(false);
      return;
    }
    watch.prefill(payload);
    quote.hint("Checking availability…");
    const params = new URLSearchParams({ car_id: this.carId, ...payload });
    try {
      const res = await fetch(`/api/quote?${params}`);
      const q = await res.json();
      if (q.ok) { quote.show(q); book.enable(q.total); watch.highlight(false); }
      else {
        quote.error(q.reason + " Tip: watch this car to be notified when it frees up.");
        book.disable("Not available for these dates");
        watch.highlight(true);
      }
    } catch (e) { quote.error("Could not reach the server."); book.disable(); }
  }
}

/* ======================================================================= */
/* Search page components                                                  */
/* ======================================================================= */
class SearchFilters extends Component {
  constructor(form) {
    super(form);
    let timer = null;
    const fire = () => {
      clearTimeout(timer);                       // debounce typing
      timer = setTimeout(() => this.emit("filtersChanged", this.params()), 300);
    };
    form.addEventListener("input", fire);
    form.addEventListener("change", fire);
  }
  params() {
    const p = new URLSearchParams(new FormData(this.el));
    [...p.keys()].forEach((k) => { if (!p.get(k)) p.delete(k); });
    return p;
  }
}

class ResultCount extends Component {
  set(n) { this.el.textContent = `${n} car${n === 1 ? "" : "s"} found`; }
  error(msg) { this.el.textContent = msg; }
}

class ResultsList extends Component {
  render(results, query) {
    if (!results.length) {
      this.el.innerHTML = `<div class="empty">No cars match these filters. Try widening your search.</div>`;
      return;
    }
    const dates = query.get("start") && query.get("end")
      ? `?start=${encodeURIComponent(query.get("start"))}&end=${encodeURIComponent(query.get("end"))}` : "";
    this.el.innerHTML = results.map((c) => `
      <a class="car-card" href="/cars/${c.id}${dates}">
        <div class="car-thumb" data-type="${escapeHtml(c.car_type || "Car")}">${escapeHtml(c.make[0])}</div>
        <div class="car-body">
          <h3>${c.year} ${escapeHtml(c.make)} ${escapeHtml(c.model)}</h3>
          <p class="muted">${escapeHtml(c.location)} · ${Number(c.mileage).toLocaleString()} mi
            ${c.seats ? "· " + c.seats + " seats" : ""}</p>
          <p class="muted">Hosted by ${escapeHtml(c.owner_name)}
            ${c.avg_rating ? "· ★ " + c.avg_rating : ""}</p>
        </div>
        <div class="car-price">${money(c.price_per_day)}<span>/day</span></div>
      </a>`).join("");
  }
}

class SearchMediator extends Mediator {
  async notify(sender, event, params) {
    if (event !== "filtersChanged") return;
    const { list, count } = this.components;
    history.replaceState(null, "", `/search?${params}`);   // shareable URL
    const res = await fetch(`/api/search?${params}`);
    const data = await res.json();
    if (!data.ok) { count.error(data.reason); list.render([], params); return; }
    count.set(data.results.length);
    list.render(data.results, params);
  }
}

/* ======================================================================= */
/* Navigation bar: notification bell + toast                               */
/* ======================================================================= */
class Poller extends Component {
  constructor(intervalMs) {
    super(null);
    setInterval(() => this.emit("tick"), intervalMs);
  }
}

class NotificationBell extends Component {
  constructor(el) { super(el); this.count = Number(el?.dataset.count || 0); }
  setCount(n) {
    this.count = n;
    if (!this.el) return;
    const badge = this.el.querySelector(".badge");
    badge.textContent = n; badge.hidden = n === 0;
  }
}

class Toast extends Component {
  show(text) {
    this.el.textContent = text;
    this.el.classList.add("show");
    setTimeout(() => this.el.classList.remove("show"), 5000);
  }
}

class NavMediator extends Mediator {
  async notify(sender, event) {
    if (event !== "tick") return;
    const { bell, toast } = this.components;
    try {
      const data = await (await fetch("/api/notifications/unread")).json();
      if (data.count > bell.count && data.latest) toast.show("🔔 " + data.latest);
      bell.setCount(data.count);
    } catch (e) { /* offline - ignore */ }
  }
}

/* ======================================================================= */
/* Page wiring                                                             */
/* ======================================================================= */
document.addEventListener("DOMContentLoaded", () => {
  // Navigation bar (every page, logged-in users only)
  const bellEl = document.getElementById("notif-bell");
  if (bellEl) {
    new NavMediator()
      .register("bell", new NotificationBell(bellEl))
      .register("toast", new Toast(document.getElementById("toast")))
      .register("poller", new Poller(8000));
  }

  // Car page booking panel
  const panel = document.getElementById("booking-panel");
  if (panel) {
    const start = panel.querySelector("[name=start]");
    const end = panel.querySelector("[name=end]");
    const m = new BookingMediator(panel.dataset.carId)
      .register("dates", new DateRangePicker(start, end))
      .register("quote", new PriceQuote(panel.querySelector(".quote")))
      .register("book", new BookButton(panel.querySelector("button[type=submit]")))
      .register("watch", new WatchForm(document.getElementById("watch-form")));
    m.notify(m.components.dates, "datesChanged", m.components.dates.range());
  }

  // Search page
  const filters = document.getElementById("search-filters");
  if (filters) {
    new SearchMediator()
      .register("filters", new SearchFilters(filters))
      .register("list", new ResultsList(document.getElementById("results")))
      .register("count", new ResultCount(document.getElementById("result-count")));
  }
});
