"""
security.py
===========
Small helpers for hashing secrets (passwords and security-question answers).

* Passwords and answers are hashed with Werkzeug's salted ``scrypt`` /
  ``pbkdf2`` key-derivation functions - the plain text is never stored.
* Security answers are normalised (trimmed, lower-cased, inner whitespace
  collapsed) before hashing so "Ann  Arbor" and "ann arbor" match.
"""

import re

from werkzeug.security import check_password_hash, generate_password_hash

MIN_PASSWORD_LENGTH = 8


def hash_password(password):
    return generate_password_hash(password)


def verify_password(password_hash, password):
    return bool(password) and check_password_hash(password_hash, password)


def normalize_answer(answer):
    return re.sub(r"\s+", " ", (answer or "").strip().lower())


def hash_answer(answer):
    return generate_password_hash(normalize_answer(answer))


def verify_answer(answer_hash, answer):
    return check_password_hash(answer_hash, normalize_answer(answer))


def password_problem(password):
    """Return a human readable problem with ``password`` or ``None`` if OK."""
    if len(password or "") < MIN_PASSWORD_LENGTH:
        return f"Password must be at least {MIN_PASSWORD_LENGTH} characters."
    if not re.search(r"[A-Za-z]", password) or not re.search(r"\d", password):
        return "Password must contain at least one letter and one number."
    return None
