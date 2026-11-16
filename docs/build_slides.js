const pptxgen = require('pptxgenjs');
const sharp = require('sharp');
const { applyTheme } = require('./apply_theme.js') /* pptx skill helper; optional */;
const D = '/home/claude/DriveShare/docs/';
const THEME = { name: 'DriveShare Mono', headFontFace: 'Arial', bodyFontFace: 'Calibri',
  colors: { dk1: '000000', lt1: 'FFFFFF', dk2: '000000', lt2: 'F2F2F2', accent1: '000000', accent2: '404040',
            accent3: '595959', accent4: '7F7F7F', accent5: 'BFBFBF', accent6: '595959', hlink: '000000', folHlink: '404040' } };

(async () => {
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE'; // 13.333 x 7.5
  pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
  pres.title = 'DriveShare – Term Project';
  const C = pres.SchemeColor;

  pres.defineSlideMaster({ title: 'DARK', background: { color: C.text2 },
    objects: [
      { placeholder: { options: { name: 'title', type: 'title', x: 0.8, y: 2.3, w: 11.7, h: 1.4, fontSize: 54, bold: true, color: C.background1, valign: 'bottom', align: 'left' }, text: '' } },
      { placeholder: { options: { name: 'body', type: 'body', x: 0.8, y: 3.8, w: 11.7, h: 1.6, fontSize: 22, color: C.accent5, valign: 'top', align: 'left' }, text: '' } },
    ] });
  pres.defineSlideMaster({ title: 'CONTENT', background: { color: C.background1 },
    objects: [
      { placeholder: { options: { name: 'title', type: 'title', x: 0.6, y: 0.4, w: 12.1, h: 0.9, fontSize: 34, bold: true, color: C.text2, valign: 'middle', align: 'left', margin: 0 }, text: '' } },
      { text: { text: 'DriveShare · Design Patterns Term Project', options: { x: 0.6, y: 7.0, w: 8, h: 0.3, fontSize: 10, color: C.accent6, margin: 0 } } },
    ],
    slideNumber: { x: 12.2, y: 7.0, w: 0.5, h: 0.3, fontSize: 10, color: C.accent6, align: 'right' } });

  const img = async (slide, file, box) => {      // fit image inside box keeping aspect ratio
    // black-and-white deck: embed a grayscale copy of every screenshot / diagram
    const fs = require('fs'), path = require('path');
    const gray = '/tmp/claude-0/bw/' + file;
    fs.mkdirSync(path.dirname(gray), { recursive: true });
    await sharp(D + file).grayscale().toFile(gray);
    const m = await sharp(gray).metadata();
    const r = Math.min(box.w / m.width, box.h / m.height);
    const w = m.width * r, h = m.height * r;
    slide.addImage({ path: gray, x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h, altText: file });
  };
  const card = (slide, x, y, w, h, fill) => slide.addShape(pres.shapes.ROUNDED_RECTANGLE,
    { x, y, w, h, rectRadius: 0.12, fill: { color: fill || C.background2 }, line: { color: fill || C.background2 } });
  const chip = (slide, text, x, y, w, fill) => {
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h: 0.38, rectRadius: 0.19, fill: { color: fill || C.accent1 }, line: { color: fill || C.accent1 } });
    slide.addText(text, { x, y, w, h: 0.38, fontSize: 12, bold: true, color: C.background1, align: 'center', valign: 'middle', margin: 0, isTextBox: true });
  };
  const bullets = (items, opts) => items.map((t, i) => {
    const runs = typeof t === 'string' ? [{ text: t }] : t;
    return runs.map((r, j) => ({ text: r.text, options: { ...(r.options || {}), bullet: true, paraSpaceAfter: 8, breakLine: j === runs.length - 1 && i < items.length - 1 } }));
  }).flat();
  const add = (section, master = 'CONTENT') => pres.addSlide({ masterName: master, sectionTitle: section });

  // 1 Title
  pres.addSection({ title: 'Intro' });
  let s = add('Intro', 'DARK');
  s.addText('DriveShare', { placeholder: 'title' });
  s.addText([{ text: 'A peer-to-peer car rental platform built with six design patterns', options: { breakLine: true } },
             { text: 'Your Name · Software Design Term Project · Fall 2026', options: { fontSize: 16, color: C.background2 } }], { placeholder: 'body' });
  s.addNotes('Introduce yourself and DriveShare: a Turo-style web app where owners list cars and renters search, watch, book, pay, message and review.');

  // 2 Agenda
  s = add('Intro'); s.addText('What this video covers', { placeholder: 'title' });
  [['1', 'Live demo', 'Every feature, end to end, as owner and renter'], ['2', 'Architecture', 'Flask + SQLite, services and pattern layers'],
   ['3', 'Six design patterns', 'Singleton, Observer, Mediator, Builder, Proxy, Chain'], ['4', 'Code walkthrough', 'Observer and Chain of Responsibility in detail'],
   ['5', 'Data model and testing', 'Schema, no-double-booking, 17 automated tests']].forEach(([n, h, d], i) => {
    const y = 1.6 + i * 1.02;
    s.addShape(pres.shapes.OVAL, { x: 0.8, y, w: 0.7, h: 0.7, fill: { color: C.accent1 }, line: { color: C.accent1 } });
    s.addText(n, { x: 0.8, y, w: 0.7, h: 0.7, fontSize: 20, bold: true, color: C.background1, align: 'center', valign: 'middle', margin: 0, isTextBox: true });
    s.addText(h, { x: 1.8, y: y - 0.02, w: 5, h: 0.4, fontSize: 20, bold: true, color: C.text2, margin: 0, isTextBox: true });
    s.addText(d, { x: 1.8, y: y + 0.38, w: 6, h: 0.35, fontSize: 15, color: C.accent6, margin: 0, isTextBox: true });
  });
  await img(s, 'screenshots/05_car_detail_quote.png', { x: 8.0, y: 1.5, w: 4.7, h: 5.2 });

  // 3 Features
  pres.addSection({ title: 'Demo' });
  s = add('Demo'); s.addText('Every required feature, plus the optional ones', { placeholder: 'title' });
  const feats = [['Register & login', 'Email/password + 3 hashed security questions'], ['List & manage cars', 'Price, availability calendar, details, unlist'],
    ['Search & book', 'Location, dates, price, type, seats, keyword, sort'], ['No double booking', 'Locked transaction + DB trigger'],
    ['Watch list', 'Alert on target price and/or free dates'], ['Messaging & alerts', 'Chat, bell badge, toast, email outbox'],
    ['Payment', 'Pay button moves balances, notifies both'], ['History & reviews', 'Owner/renter tabs, 1–5 star ratings']];
  feats.forEach(([h, d], i) => {
    const x = 0.6 + (i % 4) * 3.07, y = 1.6 + Math.floor(i / 4) * 2.65;
    card(s, x, y, 2.85, 2.35);
    s.addText(h, { x: x + 0.25, y: y + 0.3, w: 2.4, h: 0.8, fontSize: 19, bold: true, color: C.accent1, margin: 0, valign: 'top', isTextBox: true });
    s.addText(d, { x: x + 0.25, y: y + 1.15, w: 2.4, h: 1.0, fontSize: 15, color: C.text1, margin: 0, valign: 'top', isTextBox: true });
  });

  // 4 Demo script
  s = add('Demo'); s.addText('Demo script', { placeholder: 'title' });
  [['Sign up', 'three security questions; log in (Singleton)'], ['Alice lists a car', 'optional extras + availability (Builder)'],
   ['Bob searches', 'city and dates; live results (Mediator)'], ['Bob watches the Tesla', 'Alice drops the price → alert (Observer)'],
   ['Bob books the Camry', 'an overlapping request is blocked'], ['Alice confirms, Bob pays', 'balances change, both notified (Proxy)'],
   ['Message, history, reviews', 'both sides rate each other'], ['Forgot password', 'wrong answer rejected, then reset (Chain)']].forEach(([h, d], i) => {
    const y = 1.5 + i * 0.66;
    s.addShape(pres.shapes.OVAL, { x: 0.6, y, w: 0.46, h: 0.46, fill: { color: C.accent1 }, line: { color: C.accent1 } });
    s.addText(String(i + 1), { x: 0.6, y, w: 0.46, h: 0.46, fontSize: 14, bold: true, color: C.background1, align: 'center', valign: 'middle', margin: 0, isTextBox: true });
    s.addText(h, { x: 1.25, y, w: 2.75, h: 0.46, fontSize: 15, bold: true, color: C.text2, valign: 'middle', margin: 0, isTextBox: true });
    s.addText(d, { x: 4.0, y, w: 3.1, h: 0.46, fontSize: 14, color: C.text1, valign: 'middle', margin: 0, isTextBox: true });
  });
  await img(s, 'screenshots/13_notifications_renter.png', { x: 7.3, y: 1.6, w: 5.4, h: 5.0 });

  // 5 Architecture
  pres.addSection({ title: 'Design' });
  s = add('Design'); s.addText('Architecture: routes, services, patterns', { placeholder: 'title' });
  await img(s, 'diagrams/architecture.png', { x: 0.6, y: 1.45, w: 12.1, h: 5.4 });

  // 6-11 pattern slides
  const patterns = [
    ['Singleton', 'one SessionManager for all logins', 'patterns/session_manager.py', 'diagrams/singleton.png',
      ['Double-checked locking in __new__ → one instance per process', 'Random 256-bit tokens; only SHA-256 hashes kept', '30-min sliding idle timeout, logout revocation', 'Password reset revokes all of a user’s sessions']],
    ['Builder', 'step-by-step car listings', 'patterns/car_builder.py', 'diagrams/builder.png',
      ['6 required + 8 optional attributes, fluent set_* calls', 'Each step validates; build() checks completeness', 'Returns an immutable CarListing product', 'Director presets: economy_sedan, family_suv']],
    ['Observer', 'alerts for watched cars', 'patterns/observer.py', 'diagrams/observer.png',
      ['CarListingSubject keeps a list of CarObservers', 'One WatchObserver per active watch row', 'Fires on price change, new availability, cancel/decline', 'Dependencies injected → unit-testable without a DB']],
    ['Mediator', 'coordinating UI widgets', 'static/js/mediator.js', 'diagrams/mediator.png',
      ['BookingMediator: dates → quote, Book button, Watch form', 'SearchMediator: filters → results + count + URL', 'NavMediator: poller → bell badge + toast', 'New widget = change one mediator, not every widget']],
    ['Proxy', 'guarding the payment gateway', 'patterns/payment_proxy.py', 'diagrams/proxy.png',
      ['Same PaymentGateway interface as the real subject', 'Checks login, renter, confirmed, amount, balance', 'Audit log with masked card; rejects double payment', 'Real gateway created lazily; one atomic transaction']],
    ['Chain of Responsibility', 'password recovery', 'patterns/password_recovery.py', 'diagrams/chain.png',
      ['Lockout → Q1 → Q2 → Q3 → Reset', 'One handler per security question', 'Generic error hides which answer failed', '5 failures lock recovery; success revokes sessions']],
  ];
  for (const [name, headline, file, diagram, pts] of patterns) {
    s = add('Design'); s.addText(`${name}: ${headline}`, { placeholder: 'title' });
    chip(s, file, 0.6, 1.5, 3.6);
    s.addText(bullets(pts), { x: 0.6, y: 2.15, w: 4.7, h: 4.6, fontSize: 16, color: C.text1, valign: 'top', isTextBox: true });
    card(s, 5.6, 1.45, 7.1, 5.35, 'F7F7F7');
    await img(s, diagram, { x: 5.75, y: 1.6, w: 6.8, h: 5.05 });
  }

  // 12-13 code walkthroughs
  pres.addSection({ title: 'Code' });
  const code = (title, file, snippet, notes) => {
    s = add('Code'); s.addText(title, { placeholder: 'title' });
    chip(s, file, 0.6, 1.5, 3.6);
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.6, y: 2.1, w: 7.6, h: 4.7, rectRadius: 0.1, fill: { color: C.text2 }, line: { color: C.text2 } });
    s.addText(snippet, { x: 0.85, y: 2.25, w: 7.2, h: 4.45, fontFace: 'Courier New', fontSize: 12, color: 'FFFFFF', valign: 'top', margin: 0, isTextBox: true });
    s.addText(bullets(notes), { x: 8.6, y: 2.1, w: 4.1, h: 4.7, fontSize: 16, color: C.text1, valign: 'top', isTextBox: true });
  };
  code('Code walkthrough: Observer', 'patterns/observer.py',
`class WatchObserver(CarObserver):
    def criteria_met(self, car):
        max_price = self.watch.get("max_price")
        if max_price is not None and \\
           car["price_per_day"] > max_price:
            return False
        start, end = self.watch["start_time"], ...
        if start and not self._is_available(
                car["id"], start, end):
            return False
        return True

    def update(self, car, event):
        if self.criteria_met(car):
            self._notifier(self.watch["renter_id"],
                           "watch", message, link)

class CarListingSubject:
    def notify_observers(self, event):
        for observer in list(self._observers):
            observer.update(self.car, event)`,
    ['update_price() publishes PRICE_CHANGED', 'Publisher attaches one observer per watch', 'Each observer decides for itself', 'Listing code never knows who is watching']);
  code('Code walkthrough: Chain of Responsibility', 'patterns/password_recovery.py',
`class RecoveryHandler(ABC):
    def set_next(self, handler):
        self._next = handler
        return handler            # enables chaining

    def handle(self, request):
        result = self.check(request)
        if result is not None:    # this link rejects
            return result
        if self._next is None:
            return RecoveryResult(True, "reset")
        return self._next.handle(request)

def build_recovery_chain(db, on_reset=None):
    head = AccountLockoutHandler(db)
    (head.set_next(SecurityQuestionHandler(db, 1))
         .set_next(SecurityQuestionHandler(db, 2))
         .set_next(SecurityQuestionHandler(db, 3))
         .set_next(PasswordResetHandler(db, on_reset)))
    return head`,
    ['Template method: handle() is shared, check() varies', 'Any link can stop the request', 'Add a CAPTCHA or email-code step = one new class', 'Test proves failure is detected at question_2']);

  // 14 Schema
  pres.addSection({ title: 'Data' });
  s = add('Data'); s.addText('Database: 10 tables in SQLite', { placeholder: 'title' });
  await img(s, 'diagrams/er.png', { x: 0.6, y: 1.4, w: 8.4, h: 5.45 });
  s.addText(bullets(['bookings.status: pending → confirmed → paid', 'payments.booking_id unique → no double charge', 'reviews unique per (booking, reviewer)', 'Secrets stored only as salted hashes']),
    { x: 9.3, y: 1.6, w: 3.4, h: 5.0, fontSize: 15, color: C.text1, valign: 'top', isTextBox: true });

  // 15 Double booking + tests
  s = add('Data'); s.addText('Correctness and testing', { placeholder: 'title' });
  [['2', 'layers stop overlaps', 'BEGIN IMMEDIATE lock + SQLite trigger'], ['17', 'automated tests', 'Every pattern + full HTTP rental flow'], ['6', 'design patterns', 'Each in its own module, matching diagrams']].forEach(([n, l, d], i) => {
    const x = 0.6 + i * 4.1;
    card(s, x, 1.6, 3.8, 2.7);
    s.addText(n, { x: x + 0.3, y: 1.75, w: 3.2, h: 1.2, fontSize: 64, bold: true, color: C.accent1, margin: 0, isTextBox: true });
    s.addText(l, { x: x + 0.3, y: 2.95, w: 3.2, h: 0.45, fontSize: 18, bold: true, color: C.text2, margin: 0, isTextBox: true });
    s.addText(d, { x: x + 0.3, y: 3.4, w: 3.2, h: 0.75, fontSize: 14, color: C.accent6, margin: 0, isTextBox: true });
  });
  s.addText('Overlap rule:  start₁ < end₂  AND  start₂ < end₁   (back-to-back rentals are allowed)', { x: 0.6, y: 4.7, w: 12.1, h: 0.5, fontSize: 18, bold: true, color: C.text2, margin: 0, isTextBox: true });
  s.addText('Two renters clicking “Book” at the same moment: the first takes SQLite’s write lock, inserts, commits; the second re-checks inside its own locked transaction, sees the conflict and is refused. If code ever skipped the check, the prevent_double_booking trigger aborts the insert.',
    { x: 0.6, y: 5.3, w: 12.1, h: 1.3, fontSize: 15, color: C.text1, margin: 0, valign: 'top', isTextBox: true });

  // 16 Task summary
  pres.addSection({ title: 'Wrap-up' });
  s = add('Wrap-up'); s.addText('Task summary', { placeholder: 'title' });
  const rows = [['Task', 'Who'], ['Requirements, architecture and UML / ER design', 'Your Name'], ['Database schema, seed data', 'Your Name'],
    ['Auth, Singleton session, Chain password recovery', 'Your Name'], ['Listings (Builder), search, booking, no-double-booking', 'Your Name'],
    ['Watch list (Observer), messaging, notifications', 'Your Name'], ['Payment (Proxy), history, reviews', 'Your Name'],
    ['UI templates and Mediator JavaScript', 'Your Name'], ['Tests, report, slides, video', 'Your Name']];
  s.addTable(rows.map((r, i) => r.map(t => ({ text: t, options: i === 0 ? { bold: true, color: C.background1, fill: { color: C.accent1 } } : { color: C.text1, fill: { color: i % 2 ? C.background1 : C.background2 } } }))),
    { x: 0.6, y: 1.5, w: 12.1, colW: [8.6, 3.5], fontSize: 15, rowH: 0.52, border: { type: 'solid', pt: 0.5, color: 'D9D9D9' }, valign: 'middle' });

  // 17 Close
  s = add('Wrap-up', 'DARK');
  s.addText('Thank you', { placeholder: 'title' });
  s.addText([{ text: 'Code, report, diagrams and slides: github.com/your-username/DriveShare', options: { breakLine: true } },
             { text: 'Run it: pip install -r requirements.txt · python seed.py · python run.py', options: { fontSize: 16, color: C.background2 } }], { placeholder: 'body' });

  await pres.writeFile({ fileName: D + 'DriveShare_Presentation.pptx' });
  await applyTheme(D + 'DriveShare_Presentation.pptx', THEME);
  console.log('done');
})();
