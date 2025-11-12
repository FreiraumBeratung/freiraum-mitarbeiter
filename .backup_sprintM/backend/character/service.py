from __future__ import annotations

from typing import Iterable, Tuple, List

import re

from collections import Counter

from sqlalchemy.orm import Session

from .models import ConversationEvent, UserState, PersonalityProfile



# --- Mini-Lexikon (de/en) für schnelle Stimmungserkennung ---

VALENCE = {

    "super": 0.8, "genial": 0.9, "geil": 0.8, "stark": 0.7, "top": 0.6, "gut": 0.5,

    "danke": 0.4, "cool": 0.5, "happy": 0.6, "freu": 0.6, "liebe": 0.9, "krass": 0.5,

    "wow": 0.6, "nice": 0.5, "läuft": 0.4, "erfolg": 0.6,

    "schlecht": -0.6, "schlimm": -0.7, "fuck": -0.7, "mist": -0.6, "kacke": -0.8,

    "fehler": -0.5, "problem": -0.4, "absturz": -0.7, "kaputt": -0.7, "nervt": -0.6,

    "traurig": -0.7, "müde": -0.4, "stress": -0.5, "hektik": -0.4, "wütend": -0.8

}



TOPIC_KEYWORDS = {

    "offers": ["angebot", "offers", "pdf", "preis", "kalkulation"],

    "email": ["email", "imap", "smtp", "postfach", "mail"],

    "reports": ["report", "kpi", "zahlen", "dashboard"],

    "followups": ["follow-up", "followup", "nachfassen", "erinnerung"],

    "voice": ["sprache", "stimme", "micro", "whisper", "tts", "ptt"],

    "scheduler": ["scheduler", "cron", "timer", "termin"],

    "license": ["lizenz", "license", "elite"],

    "db": ["db", "datenbank", "alembic", "migration"],

    "ui": ["ui", "tailwind", "theme", "dark", "design"],

    "health": ["status", "health", "audit"],

    "nutrition": ["keto", "essen", "abendessen", "ernährung"],

}



def _tokenize(text: str) -> List[str]:

    return re.findall(r"[a-zA-ZäöüÄÖÜß]+", text.lower())



def score_sentiment(text: str) -> float:

    toks = _tokenize(text)

    if not toks:

        return 0.0

    score = sum(VALENCE.get(t, 0.0) for t in toks) / max(1, len(toks))

    if re.search(r"!{2,}", text):

        score += 0.1

    if re.search(r"[A-ZÄÖÜ]{4,}", text):

        score += 0.05

    return max(-1.0, min(1.0, score))



def classify_mood(sentiment: float) -> Tuple[str, float]:

    if sentiment > 0.15:

        return "positive", min(1.0, 0.5 + sentiment)

    if sentiment < -0.15:

        return "negative", min(1.0, 0.5 + abs(sentiment))

    return "neutral", min(1.0, 0.3 + abs(sentiment))



def extract_topics(text: str) -> List[str]:

    toks = set(_tokenize(text))

    hits = []

    for name, kws in TOPIC_KEYWORDS.items():

        if any(kw in toks for kw in kws):

            hits.append(name)

    return hits



def summarize_recent_texts(texts: Iterable[str], limit: int = 3) -> str:

    arr = list(texts)[-limit:]

    return " | ".join(s.strip().replace("\n", " ")[:200] for s in arr)



def ensure_user_state(db: Session, user_id: str) -> UserState:

    st = db.query(UserState).filter_by(user_id=user_id).first()

    if not st:

        st = UserState(user_id=user_id, mood="neutral", intensity=0.0,

                       confidence=0.5, last_summary=None, recent_topics=[])

        db.add(st); db.flush()

    return st



def ensure_profile(db: Session, user_id: str) -> PersonalityProfile:

    p = db.query(PersonalityProfile).filter_by(user_id=user_id).first()

    if not p:

        p = PersonalityProfile(

            user_id=user_id,

            tone="partnerschaftlich, direkt, motivierend",

            humor="dezent",

            formality="mittel",

            focus=["SHK", "ERP", "E-Mail", "Leads"],

            style_notes="Schwarz-Orange, High-End, klar, ergebnisorientiert."

        )

        db.add(p); db.flush()

    return p



def register_event(db: Session, user_id: str, role: str, text: str) -> ConversationEvent:

    sentiment = score_sentiment(text)

    mood, intensity = classify_mood(sentiment)

    topics = extract_topics(text)

    ev = ConversationEvent(

        user_id=user_id, role=role, text=text,

        sentiment=sentiment, mood=mood, intensity=intensity, topics=topics

    )

    db.add(ev); db.flush()



    st = ensure_user_state(db, user_id)

    alpha = 0.6

    new_intensity = alpha * intensity + (1 - alpha) * (st.intensity or 0.0)

    new_mood = mood if (intensity >= 0.6 or st.mood == "neutral") else st.mood



    q = db.query(ConversationEvent).filter_by(user_id=user_id).order_by(ConversationEvent.id.desc()).limit(6)

    recent_texts = [r.text for r in q][::-1]

    last_summary = summarize_recent_texts(recent_texts, limit=3)



    from collections import Counter

    recent_topics = (st.recent_topics or []) + topics

    top_topics = [t for t, _ in Counter(recent_topics).most_common(5)]



    st.mood = new_mood

    st.intensity = round(new_intensity, 3)

    st.confidence = round(0.5 + min(0.5, abs(sentiment)), 3)

    st.recent_topics = top_topics

    st.last_summary = last_summary

    db.flush()

    return ev



def get_state(db: Session, user_id: str) -> UserState:

    return ensure_user_state(db, user_id)



def get_profile(db: Session, user_id: str) -> PersonalityProfile:

    return ensure_profile(db, user_id)



def update_profile(db: Session, user_id: str, **kwargs) -> PersonalityProfile:

    p = ensure_profile(db, user_id)

    for k, v in kwargs.items():

        if v is not None and hasattr(p, k):

            setattr(p, k, v)

    db.flush()

    return p



def reset_user(db: Session, user_id: str, purge_events: bool = False):

    st = db.query(UserState).filter_by(user_id=user_id).first()

    if st:

        st.mood = "neutral"

        st.intensity = 0.0

        st.confidence = 0.5

        st.recent_topics = []

        st.last_summary = None

        db.flush()

    if purge_events:

        db.query(ConversationEvent).filter_by(user_id=user_id).delete()








