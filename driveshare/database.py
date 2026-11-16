"""
database.py
===========
SQLite persistence layer for DriveShare.

This module owns the database schema and hands out connections. Every other
module talks to the database through ``get_db()`` so there is exactly one
place that knows the file location and connection settings.

Tables (see docs/REPORT.md for the full ER diagram):
    users              - account, hashed password, simulated wallet balance
    security_questions - the three recovery questions per user (answers hashed)
    cars               - a car listing built by CarListingBuilder
    car_availability   - date/time windows in which an owner offers a car
    bookings           - a renter's reservation of a car for a time window
    payments           - simulated payments processed through PaymentProxy
    watches            - renter "watch" criteria used by the Observer pattern
    notifications      - in-app notifications (also mirrored to email outbox)
    messages           - owner <-> renter direct messages
    reviews            - ratings left by owner and renter after a rental
"""

import os
import sqlite3

from flask import g, current_app

# --------------------------------------------------------------------------- #
# Schema                                                                      #
# --------------------------------------------------------------------------- #
SCHEMA = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    email           TEXT    NOT NULL UNIQUE,
    name            TEXT    NOT NULL,
    password_hash   TEXT    NOT NULL,
    balance         REAL    NOT NULL DEFAULT 1000.0,   -- simulated wallet
    failed_recovery INTEGER NOT NULL DEFAULT 0,        -- recovery lockout counter
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS security_questions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    position    INTEGER NOT NULL CHECK (position BETWEEN 1 AND 3),
    question    TEXT    NOT NULL,
    answer_hash TEXT    NOT NULL,
    UNIQUE (user_id, position)
);

CREATE TABLE IF NOT EXISTS cars (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    make          TEXT    NOT NULL,
    model         TEXT    NOT NULL,
    year          INTEGER NOT NULL,
    mileage       INTEGER NOT NULL,
    location      TEXT    NOT NULL,
    price_per_day REAL    NOT NULL,
    car_type      TEXT,                 -- optional (Sedan, SUV, ...)
    seats         INTEGER,              -- optional
    transmission  TEXT,                 -- optional
    fuel_type     TEXT,                 -- optional
    features      TEXT,                 -- optional, comma separated
    description   TEXT,                 -- optional
    is_active     INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS car_availability (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    car_id     INTEGER NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
    start_time TEXT    NOT NULL,        -- ISO 8601 'YYYY-MM-DDTHH:MM'
    end_time   TEXT    NOT NULL,
    CHECK (end_time > start_time)
);

CREATE TABLE IF NOT EXISTS bookings (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    car_id      INTEGER NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
    renter_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    start_time  TEXT    NOT NULL,
    end_time    TEXT    NOT NULL,
    total_price REAL    NOT NULL,
    -- pending -> confirmed -> paid ; or declined / cancelled
    status      TEXT    NOT NULL DEFAULT 'pending',
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    CHECK (end_time > start_time)
);

CREATE TABLE IF NOT EXISTS payments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
    payer_id   INTEGER NOT NULL REFERENCES users(id),
    payee_id   INTEGER NOT NULL REFERENCES users(id),
    amount     REAL    NOT NULL,
    reference  TEXT    NOT NULL,        -- simulated transaction id
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS watches (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    renter_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    car_id       INTEGER NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
    max_price    REAL,                  -- notify when price_per_day <= max_price
    start_time   TEXT,                  -- notify when available for this window
    end_time     TEXT,
    active       INTEGER NOT NULL DEFAULT 1,
    last_notified TEXT,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE (renter_id, car_id)
);

CREATE TABLE IF NOT EXISTS notifications (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind       TEXT    NOT NULL,        -- booking / payment / watch / message / review
    message    TEXT    NOT NULL,
    link       TEXT,
    is_read    INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    car_id       INTEGER REFERENCES cars(id) ON DELETE SET NULL,
    body         TEXT    NOT NULL,
    is_read      INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reviews (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id  INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    reviewer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reviewee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment     TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE (booking_id, reviewer_id)   -- one review per side per booking
);

-- Defence in depth for "no double booking": even if application code had a
-- bug, the database itself refuses an overlapping active booking.
CREATE TRIGGER IF NOT EXISTS prevent_double_booking
BEFORE INSERT ON bookings
WHEN EXISTS (
    SELECT 1 FROM bookings
    WHERE car_id = NEW.car_id
      AND status IN ('pending', 'confirmed', 'paid')
      AND start_time < NEW.end_time
      AND end_time   > NEW.start_time
)
BEGIN
    SELECT RAISE(ABORT, 'Car is already booked for an overlapping period');
END;

CREATE INDEX IF NOT EXISTS idx_bookings_car  ON bookings(car_id, start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_avail_car     ON car_availability(car_id);
CREATE INDEX IF NOT EXISTS idx_notif_user    ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_watch_car     ON watches(car_id, active);
"""


def _connect(path):
    """Open a SQLite connection that returns rows addressable by column name."""
    conn = sqlite3.connect(path, detect_types=sqlite3.PARSE_DECLTYPES)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def get_db():
    """
    Return the connection bound to the current Flask request (``g``).

    A new connection is created lazily the first time it is needed in a
    request and closed automatically by ``close_db`` at teardown.
    """
    if "db" not in g:
        g.db = _connect(current_app.config["DATABASE"])
    return g.db


def close_db(_exc=None):
    """Teardown hook: close the per-request connection if one was opened."""
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db(path):
    """Create every table (idempotent - safe to call on each start-up)."""
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    conn = _connect(path)
    conn.executescript(SCHEMA)
    conn.commit()
    conn.close()


def init_app(app):
    """Register the teardown hook and make sure the schema exists."""
    app.teardown_appcontext(close_db)
    init_db(app.config["DATABASE"])
