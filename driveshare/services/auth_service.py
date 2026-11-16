"""
auth_service.py
===============
Registration, login and "who is the current user?" helpers.

The session itself is managed by the ``SessionManager`` Singleton; this module
only stores the opaque token it issues inside Flask's signed cookie.
"""

import re
from functools import wraps

from flask import flash, g, redirect, request, session, url_for

from driveshare.database import get_db
from driveshare.patterns.session_manager import SessionManager
from driveshare.security import hash_answer, hash_password, password_problem, verify_password

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

#: Suggested questions offered on the registration form.
QUESTION_CHOICES = [
    "What was the name of your first pet?",
    "In what city were you born?",
    "What is your mother's maiden name?",
    "What was the make of your first car?",
    "What was the name of your elementary school?",
    "What is your favorite book?",
    "What street did you grow up on?",
]


class AuthError(ValueError):
    pass


def register_user(db, name, email, password, questions, answers):
    """
    Create a user with three security questions.

    :param questions: list of 3 question strings (must be distinct)
    :param answers:   list of 3 answer strings (must be non-empty)
    :returns: new user id
    """
    name, email = (name or "").strip(), (email or "").strip().lower()
    if not name:
        raise AuthError("Name is required.")
    if not EMAIL_RE.match(email):
        raise AuthError("Please enter a valid email address.")
    problem = password_problem(password)
    if problem:
        raise AuthError(problem)
    if len(questions) != 3 or len(answers) != 3:
        raise AuthError("Exactly three security questions are required.")
    if any(not (q or "").strip() for q in questions) or len({q.strip() for q in questions}) != 3:
        raise AuthError("Please choose three different security questions.")
    if any(not (a or "").strip() for a in answers):
        raise AuthError("Please answer all three security questions.")
    if db.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone():
        raise AuthError("An account with this email already exists.")

    cur = db.execute("INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)",
                     (email, name, hash_password(password)))
    user_id = cur.lastrowid
    for pos, (q, a) in enumerate(zip(questions, answers), start=1):
        db.execute("INSERT INTO security_questions (user_id, position, question, answer_hash) "
                   "VALUES (?, ?, ?, ?)", (user_id, pos, q.strip(), hash_answer(a)))
    db.commit()
    return user_id


def authenticate(db, email, password):
    """Return the user row if the credentials are valid, else ``None``."""
    user = db.execute("SELECT * FROM users WHERE email = ?",
                      ((email or "").strip().lower(),)).fetchone()
    if user and verify_password(user["password_hash"], password):
        return user
    return None


def login_user(user_id):
    """Ask the Singleton for a token and keep it in the signed cookie."""
    session.clear()
    session["token"] = SessionManager().create_session(user_id)


def logout_user():
    SessionManager().end_session(session.get("token"))
    session.clear()


def load_current_user():
    """``before_request`` hook: resolve the token to ``g.user``."""
    g.user = None
    user_id = SessionManager().get_user_id(session.get("token"))
    if user_id is not None:
        g.user = get_db().execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    elif "token" in session:
        session.clear()                   # expired / revoked token


def login_required(view):
    """Decorator protecting views that need an authenticated user."""
    @wraps(view)
    def wrapped(*args, **kwargs):
        if g.get("user") is None:
            flash("Please log in to continue.", "warning")
            return redirect(url_for("auth.login", next=request.path))
        return view(*args, **kwargs)
    return wrapped


def get_questions(db, user_id):
    return db.execute("SELECT position, question FROM security_questions "
                      "WHERE user_id = ? ORDER BY position", (user_id,)).fetchall()
