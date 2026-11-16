# DriveShare – Design Report

**Project:** DriveShare, a peer-to-peer car rental platform
**Team:** _Your Name_ (individual)
**Repository:** _https://github.com/your-username/DriveShare_
**Video:** _https://…_

---

## 1. Overview

DriveShare is a Flask web application backed by SQLite. It uses a three-layer structure:

1. **Presentation**: Jinja2 templates plus `static/js/mediator.js`. The JavaScript Mediator coordinates the interactive widgets.
2. **Application**: `routes.py` has thin Flask controllers that delegate to the `services/` modules, which hold the business rules.
3. **Patterns and persistence**: `patterns/` contains the six GoF design patterns. `database.py` defines the schema.

![Architecture](diagrams/architecture.png)

### Requirement → implementation map

| Requirement | Where |
|---|---|
| Register with email/password and 3 security questions | `services/auth_service.register_user`, `templates/auth/register.html` |
| List car (model, year, mileage, availability calendar, location, price) | `patterns/car_builder.py`, `services/car_service.save_listing` |
| Update availability and price | `car_service.update_price / add_availability / remove_availability` |
| Prevent overlapping rentals | `booking_service.create_booking` (`BEGIN IMMEDIATE`) + DB trigger `prevent_double_booking` |
| Search by location, date and preferences | `car_service.search`, `/api/search` |
| Watch cars (availability / price) | `patterns/observer.py`, `community_service.add_watch` |
| Booking for a specific period | `booking_service` life-cycle |
| Messaging | `community_service.send_message / conversations / thread` |
| Notifications (in-app + email) | `notification_service.notify` (+ `instance/email_outbox.log`) |
| Payment button changing balances and notifying both parties | `patterns/payment_proxy.py`, `community_service.pay_booking` |
| Rental history | `templates/bookings.html` (renter and owner tabs) |
| Reviews | `community_service.add_review`, profile and car pages |

---

## 2. Class diagrams and descriptions

The diagrams were drawn from the code. The Mermaid sources are in `docs/diagrams/*.mmd`, so the diagrams can be regenerated whenever the code changes.

### 2.1 Singleton – `SessionManager` (`patterns/session_manager.py`)

![Singleton](diagrams/singleton.png)

`SessionManager.__new__` uses double-checked locking, so only one instance exists per process, even when Flask runs multiple threads. That instance is the only place that:

- issues 256-bit random tokens (`secrets.token_urlsafe(32)`);
- stores only the SHA-256 hash of each token, so a memory dump does not reveal usable tokens;
- applies a sliding 30-minute idle timeout;
- revokes sessions on logout, and revokes all of a user's sessions after a password reset.

The browser holds the raw token only inside Flask's signed, HttpOnly cookie. `auth_service.load_current_user` runs before each request and resolves the token to `g.user`.

### 2.2 Builder – `CarListingBuilder` (`patterns/car_builder.py`)

![Builder](diagrams/builder.png)

A listing has six required attributes and many optional ones. The builder exposes a fluent interface: each `set_*` / `add_*` method validates its own input and returns `self`. `build()` checks that all required parts are present and returns an immutable `CarListing` (a frozen dataclass).

`CarListingDirector` holds reusable recipes such as `economy_sedan` and `family_suv`, which `seed.py` uses. `car_service.builder_from_form` drives the builder from the HTML form. Editing a listing re-runs the builder, so the same validation applies to create and update.

### 2.3 Observer – watch notifications (`patterns/observer.py`)

![Observer](diagrams/observer.png)

- **Subject:** `CarListingSubject` wraps one car and keeps a list of `CarObserver`s.
- **Concrete observer:** `WatchObserver`, one per active row in `watches`. `update()` checks the renter's criteria (`price_per_day ≤ max_price` and/or the car being available and unbooked for the requested window). It notifies only when every criterion is met.
- **Publisher:** `CarEventPublisher` loads the active watches for a car, attaches a `WatchObserver` for each, and fires the event. The availability checker and the notifier are injected, so the pattern code has no dependency on SQL or Flask and can be unit-tested with plain dictionaries.
- **Events that trigger it:** `PRICE_CHANGED` (owner edits price), `AVAILABILITY_CHANGED` (owner adds a window), `BOOKING_RELEASED` (a booking is cancelled or declined, which frees the dates), and `WATCH_CREATED` (a new watch is evaluated immediately).

### 2.4 Mediator – UI components (`static/js/mediator.js`)

![Mediator](diagrams/mediator.png)

Components never reference each other. They call `emit(event, payload)`, and their mediator decides what happens next.

| Mediator | Components | Coordination |
|---|---|---|
| `BookingMediator` (car page) | `DateRangePicker`, `PriceQuote`, `BookButton`, `WatchForm` | On `datesChanged` it calls `/api/quote`, then shows the price or the reason the car is unavailable, enables or disables the Book button, pre-fills the Watch form with the same dates, and highlights it when the car is unavailable. |
| `SearchMediator` (search page) | `SearchFilters`, `ResultsList`, `ResultCount` | On `filtersChanged` (debounced) it calls `/api/search`, re-renders the results and the count, and updates the URL. |
| `NavMediator` (every page) | `Poller`, `NotificationBell`, `Toast` | On each `tick` it fetches the unread count, updates the bell badge, and shows a toast if new notifications arrived. |

### 2.5 Proxy – payment (`patterns/payment_proxy.py`)

![Proxy](diagrams/proxy.png)

`PaymentProxy` and `SimulatedPaymentGateway` both implement `PaymentGateway`. The service layer only ever talks to the proxy. Before delegating, the proxy runs these checks:

1. **Authentication:** the payer is logged in.
2. **Authorisation:** the payer is the renter on the booking.
3. **State:** the booking is confirmed and not already paid (idempotency).
4. **Integrity:** the amount equals the booking total.
5. **Funds:** the renter's balance is sufficient.
6. **Audit:** it logs the request with the card number masked.

The real gateway is created lazily, only when a payment passes every check (virtual-proxy behaviour). It debits the renter, credits the owner, writes a `payments` row and marks the booking `paid`, all in one transaction. `community_service.pay_booking` then notifies both parties.

### 2.6 Chain of Responsibility – password recovery (`patterns/password_recovery.py`)

![Chain](diagrams/chain.png)

`build_recovery_chain` links the handlers:

```
AccountLockoutHandler → SecurityQuestionHandler(1) → SecurityQuestionHandler(2) → SecurityQuestionHandler(3) → PasswordResetHandler
```

Each handler either returns a failure, which stops the chain, or passes the request to its successor. The three question handlers are built from the user's three security questions.

- A failed answer increments `users.failed_recovery`. After 5 failures, the lockout handler stops all further attempts.
- All three answers are submitted together and every failure returns the same generic message, so an attacker cannot tell which answer was wrong.
- The final handler enforces password strength, stores the new hash, resets the counter, and calls `SessionManager().end_all_sessions_for(user_id)`.

---

## 3. Database schema

![ER diagram](diagrams/er.png)

| Table | Purpose / key constraints |
|---|---|
| `users` | Account, `password_hash`, simulated `balance` (starts at $1,000), `failed_recovery` counter. `email` is unique. |
| `security_questions` | Exactly three rows per user (`position` 1–3, unique per user). Answers are hashed after normalisation (trimmed, lower-case). |
| `cars` | Listing created by the Builder. Optional columns are nullable. `is_active` hides a listing without deleting its history. |
| `car_availability` | Windows in which the owner offers the car. `CHECK end_time > start_time`. Adjacent or overlapping windows are merged when checked. |
| `bookings` | `status` ∈ pending / confirmed / paid / declined / cancelled. The trigger `prevent_double_booking` aborts any insert that overlaps an active booking of the same car. |
| `payments` | One per booking (`booking_id` unique), payer, payee, amount and a simulated reference. |
| `watches` | Renter's Observer criteria: `max_price` and/or `start_time`–`end_time`. Unique per (renter, car). |
| `notifications` | In-app notifications (`kind`: booking / payment / watch / message / review). Each one is mirrored to the email outbox. |
| `messages` | Direct messages between users, optionally linked to a car. |
| `reviews` | 1–5 rating and comment. Unique (`booking_id`, `reviewer_id`), so each side can review a rental once. |

**Overlap rule.** Two windows [s1, e1) and [s2, e2) overlap exactly when `s1 < e2 AND s2 < e1`. Back-to-back rentals (one ends at 10:00 and the next starts at 10:00) are therefore allowed.

**Pricing.** Every started 24-hour period counts as one day: `total = ceil(hours / 24) × price_per_day`, with a minimum of one day.

---

## 4. User-interface screenshots

| | |
|---|---|
| ![](screenshots/01_home.png) Home / search hero | ![](screenshots/02_register.png) Registration with 3 security questions |
| ![](screenshots/04_search_mediator.png) Live search (Mediator) | ![](screenshots/05_car_detail_quote.png) Car page – live quote (Mediator) |
| ![](screenshots/06_double_booking_blocked.png) Overlapping dates blocked; Watch form highlighted | ![](screenshots/07_list_car_builder.png) List a car (Builder) |
| ![](screenshots/08_owner_booking_request.png) Owner confirms a request | ![](screenshots/09_manage_listing.png) Manage price & availability (Observer trigger) |
| ![](screenshots/10_renter_pay_button.png) Pay button (Proxy) | ![](screenshots/11_payment_done.png) Payment complete – balance updated |
| ![](screenshots/12_watchlist.png) Watch list | ![](screenshots/13_notifications_renter.png) Renter notifications (watch alert, payment) |
| ![](screenshots/14_messaging.png) Messaging | ![](screenshots/15_notifications_owner.png) Owner notifications |
| ![](screenshots/16_rental_history_owner.png) Rental history (owner) | ![](screenshots/17_profile_reviews.png) Profile & reviews |
| ![](screenshots/18_password_recovery_chain.png) Password recovery (Chain) – wrong answer rejected | ![](screenshots/19_about_patterns.png) Pattern overview page |

---

## 5. Testing

`tests/test_patterns.py` contains 17 pytest tests:

- Singleton identity and the session life-cycle.
- Builder required fields, Director presets, and invalid windows.
- Observer: price drop, and a watch triggered when a booking is released.
- No double booking, at both the service level and the DB-trigger level, including back-to-back bookings.
- Proxy: rejects pending bookings, the wrong user, the wrong amount and double payment, and creates the real gateway lazily.
- Chain: identifies which link failed, a full successful pass, and lockout.
- Two end-to-end HTTP tests covering register → recover → login, and book → confirm → pay → review → message → notifications.
