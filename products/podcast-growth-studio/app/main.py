"""Single-workspace podcast operations service."""
import os
import secrets
import hashlib
import hmac
import json
import logging
import time
from collections import defaultdict, deque
from threading import Lock
from urllib.parse import urlsplit
from contextlib import asynccontextmanager
from datetime import date, datetime, timezone, timedelta
from pathlib import Path
from typing import Literal

import httpx
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import event, text, Date, DateTime, ForeignKey, Integer, String, Text, create_engine, func, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./podcast.db")
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine)
if DATABASE_URL.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def sqlite_foreign_keys(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")


class Base(DeclarativeBase):
    pass

class Episode(Base):
    __tablename__ = "episodes"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    source_url: Mapped[str] = mapped_column(Text, default="")
    published_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    clips: Mapped[list["Clip"]] = relationship(back_populates="episode", cascade="all, delete-orphan")

class Clip(Base):
    __tablename__ = "clips"
    id: Mapped[int] = mapped_column(primary_key=True)
    episode_id: Mapped[int] = mapped_column(ForeignKey("episodes.id"), index=True)
    hook: Mapped[str] = mapped_column(String(250))
    caption: Mapped[str] = mapped_column(Text, default="")
    platform: Mapped[str] = mapped_column(String(32), default="instagram")
    status: Mapped[str] = mapped_column(String(32), default="draft")
    scheduled_for: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    asset_url: Mapped[str] = mapped_column(Text, default="")
    episode: Mapped[Episode] = relationship(back_populates="clips")
    version: Mapped[int] = mapped_column(Integer, default=1)
    __mapper_args__ = {"version_id_col": version}

class Metric(Base):
    __tablename__ = "metrics"
    id: Mapped[int] = mapped_column(primary_key=True)
    recorded_on: Mapped[date] = mapped_column(Date, index=True)
    platform: Mapped[str] = mapped_column(String(32))
    plays: Mapped[int] = mapped_column(Integer, default=0)
    followers: Mapped[int] = mapped_column(Integer, default=0)
    engagement: Mapped[int] = mapped_column(Integer, default=0)

class LoginSession(Base):
    __tablename__ = "login_sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)

class AuditEvent(Base):
    __tablename__ = "audit_events"
    id: Mapped[int] = mapped_column(primary_key=True)
    actor: Mapped[str] = mapped_column(String(200))
    action: Mapped[str] = mapped_column(String(100))
    entity_id: Mapped[int | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class InputModel(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    @field_validator("*", mode="after")
    @classmethod
    def validate_urls(cls, value, info):
        if info.field_name in {"source_url", "asset_url"} and value:
            parsed = urlsplit(value)
            if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
                raise ValueError("Use an HTTP or HTTPS URL without credentials")
        return value

class EpisodeIn(InputModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=10000)
    source_url: str = Field(default="", max_length=2000)
    published_on: date | None = None

class EpisodeOut(EpisodeIn):
    id: int
    model_config = ConfigDict(from_attributes=True)

Platform = Literal["instagram", "facebook", "tiktok", "youtube", "linkedin"]
ClipStatus = Literal["draft", "review", "approved", "scheduled", "published"]

class ClipIn(InputModel):
    episode_id: int
    hook: str = Field(min_length=1, max_length=250)
    caption: str = Field(default="", max_length=5000)
    platform: Platform = "instagram"
    asset_url: str = Field(default="", max_length=2000)

class ClipOut(ClipIn):
    @field_validator("scheduled_for", mode="after", check_fields=False)
    @classmethod
    def utc_dates(cls, value):
        return value.replace(tzinfo=timezone.utc) if value and value.tzinfo is None else value

    id: int
    status: ClipStatus
    scheduled_for: datetime | None
    model_config = ConfigDict(from_attributes=True)

class StatusUpdate(InputModel):
    status: ClipStatus
    scheduled_for: datetime | None = None

class MetricIn(InputModel):
    recorded_on: date
    platform: Platform
    plays: int = Field(ge=0)
    followers: int = Field(ge=0)
    engagement: int = Field(ge=0)

class MetricOut(MetricIn):
    id: int
    model_config = ConfigDict(from_attributes=True)

COOKIE = "pgs_session"
SESSION_HOURS = 12

def token_digest(token):
    return hmac.new(os.environ["APP_PASSWORD"].encode(), token.encode(), hashlib.sha256).hexdigest()

def require_auth(request: Request):
    token = request.cookies.get(COOKIE, "")
    with SessionLocal() as session:
        record = session.get(LoginSession, token_digest(token)) if token else None
        if record is None or record.expires_at.replace(tzinfo=timezone.utc) <= datetime.now(timezone.utc):
            raise HTTPException(401, "Please sign in")
    return os.getenv("APP_USER", "admin")

def audit(db, action, entity_id=None):
    db.add(AuditEvent(actor=os.getenv("APP_USER", "admin"), action=action, entity_id=entity_id))

def db_session():
    with SessionLocal() as session:
        yield session

@asynccontextmanager
async def lifespan(_app: FastAPI):
    password = os.getenv("APP_PASSWORD", "")
    if len(password) < 16 or password in {"change-this-before-running", "change-database-password"}:
        raise RuntimeError("APP_PASSWORD must be a unique secret of at least 16 characters")
    with engine.connect() as connection:
        revision = connection.execute(text("SELECT version_num FROM alembic_version")).scalar()
        if revision != "0003":
            raise RuntimeError("Database requires migration: run alembic upgrade head")
    yield

app = FastAPI(title="Podcast Growth Studio", version="1.0.0", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)

from starlette.middleware.trustedhost import TrustedHostMiddleware
app.add_middleware(TrustedHostMiddleware, allowed_hosts=os.getenv("ALLOWED_HOSTS", "localhost,127.0.0.1,testserver").split(","))
from sqlalchemy.orm.exc import StaleDataError
@app.exception_handler(StaleDataError)
async def conflicting_edit(request, exc):
    return JSONResponse({"detail": "This clip changed during your request. Refresh and retry."}, status_code=409)

logger = logging.getLogger("podcast")
_attempts = defaultdict(deque)
_attempt_lock = Lock()

@app.middleware("http")
async def security_headers(request: Request, call_next):
    request_id = secrets.token_hex(8)
    if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        # Custom header forces browser preflight for cross-origin requests; CORS is disabled.
        origin = request.headers.get("origin")
        expected = os.getenv("APP_ORIGIN", str(request.base_url).rstrip("/"))
        if request.headers.get("x-requested-with") != "PodcastStudio" or (origin and origin != expected) or request.headers.get("sec-fetch-site") == "cross-site":
            return JSONResponse({"detail": "Request origin rejected"}, status_code=403)
        try:
            if int(request.headers.get("content-length", "0")) > 65536:
                return JSONResponse({"detail": "Request too large"}, status_code=413)
        except ValueError:
            return JSONResponse({"detail": "Invalid content length"}, status_code=400)
        # Bound streamed/chunked payloads too, rather than trusting Content-Length.
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > 65536:
                return JSONResponse({"detail": "Request too large"}, status_code=413)
        request._body = bytes(body)
    response = await call_next(request)
    response.headers.update({"X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "same-origin", "Cache-Control": "no-store", "X-Request-ID": request_id,
        "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"})
    if os.getenv("COOKIE_SECURE", "false").lower() == "true":
        response.headers["Strict-Transport-Security"] = "max-age=31536000"
    logger.info("request id=%s method=%s path=%s status=%s", request_id, request.method, request.url.path, response.status_code)
    return response

class LoginIn(InputModel):
    model_config = ConfigDict(str_strip_whitespace=False, extra="forbid")
    username: str = Field(max_length=200)
    password: str = Field(max_length=1000)

@app.post("/api/login")
def login(payload: LoginIn, request: Request, response: Response, db: Session = Depends(db_session)):
    key = request.client.host if request.client else "unknown"
    now = time.monotonic()
    with _attempt_lock:
        for expired in [k for k, v in _attempts.items() if not v or v[-1] <= now - 300]:
            del _attempts[expired]
        attempts = _attempts[key]
        while attempts and attempts[0] <= now - 300:
            attempts.popleft()
        if len(attempts) >= 10:
            raise HTTPException(429, "Too many login attempts. Try again in five minutes", headers={"Retry-After": "300"})
        attempts.append(now)
    user_ok = secrets.compare_digest(payload.username.encode(), os.getenv("APP_USER", "admin").encode())
    password_ok = secrets.compare_digest(payload.password.encode(), os.environ["APP_PASSWORD"].encode())
    if not (user_ok and password_ok):
        raise HTTPException(401, "Invalid username or password")
    token = secrets.token_urlsafe(32)
    # Prune expired records on login.
    from sqlalchemy import delete
    db.execute(delete(LoginSession).where(LoginSession.expires_at < datetime.now(timezone.utc)))
    db.add(LoginSession(token_hash=token_digest(token), expires_at=datetime.now(timezone.utc) + timedelta(hours=SESSION_HOURS)))
    audit(db, "session.login")
    db.commit()
    response.set_cookie(COOKIE, token, httponly=True, secure=os.getenv("COOKIE_SECURE", "false").lower() == "true", samesite="strict", max_age=SESSION_HOURS * 3600, path="/")
    return {"username": payload.username}

@app.get("/api/me", dependencies=[Depends(require_auth)])
def me():
    return {"username": os.getenv("APP_USER", "admin")}

@app.post("/api/logout", dependencies=[Depends(require_auth)])
def logout(request: Request, response: Response, db: Session = Depends(db_session)):
    record = db.get(LoginSession, token_digest(request.cookies[COOKIE]))
    if record:
        db.delete(record)
    audit(db, "session.logout")
    db.commit()
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}

@app.get("/", include_in_schema=False)
def index():
    return FileResponse(Path(__file__).parent / "static" / "index.html")

@app.get("/studio.js", include_in_schema=False)
def script():
    return FileResponse(Path(__file__).parent / "static" / "studio.js", media_type="application/javascript")

@app.get("/api/audit", dependencies=[Depends(require_auth)])
def audit_history(db: Session = Depends(db_session)):
    events = db.scalars(select(AuditEvent).order_by(AuditEvent.id.desc()).limit(100)).all()
    return [{"id": e.id, "actor": e.actor, "action": e.action, "entity_id": e.entity_id, "created_at": e.created_at} for e in events]

@app.get("/ready")
def ready(db: Session = Depends(db_session)):
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        return JSONResponse({"status": "unavailable"}, status_code=503)
    return {"status": "ready"}

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/api/dashboard", dependencies=[Depends(require_auth)])
def dashboard(db: Session = Depends(db_session)):
    return {
        "episodes": db.scalar(select(func.count()).select_from(Episode)) or 0,
        "clips": db.scalar(select(func.count()).select_from(Clip)) or 0,
        "awaiting_review": db.scalar(select(func.count()).select_from(Clip).where(Clip.status == "review")) or 0,
        "approved": db.scalar(select(func.count()).select_from(Clip).where(Clip.status == "approved")) or 0,
        "scheduled": db.scalar(select(func.count()).select_from(Clip).where(Clip.status == "scheduled")) or 0,
        "published": db.scalar(select(func.count()).select_from(Clip).where(Clip.status == "published")) or 0,
    }

@app.get("/api/episodes", response_model=list[EpisodeOut], dependencies=[Depends(require_auth)])
def list_episodes(offset: int = 0, limit: int = 100, db: Session = Depends(db_session)):
    if offset < 0 or not 1 <= limit <= 500:
        raise HTTPException(422, "Invalid pagination")
    return db.scalars(select(Episode).order_by(Episode.id.desc()).offset(offset).limit(limit)).all()

@app.post("/api/episodes", response_model=EpisodeOut, status_code=201, dependencies=[Depends(require_auth)])
def create_episode(payload: EpisodeIn, db: Session = Depends(db_session)):
    episode = Episode(**payload.model_dump())
    db.add(episode)
    db.flush()
    audit(db, "episode.create", episode.id)
    db.commit()
    db.refresh(episode)
    return episode

@app.get("/api/clips", response_model=list[ClipOut], dependencies=[Depends(require_auth)])
def list_clips(offset: int = 0, limit: int = 100, db: Session = Depends(db_session)):
    if offset < 0 or not 1 <= limit <= 500:
        raise HTTPException(422, "Invalid pagination")
    return db.scalars(select(Clip).order_by(Clip.id.desc()).offset(offset).limit(limit)).all()

@app.post("/api/clips", response_model=ClipOut, status_code=201, dependencies=[Depends(require_auth)])
def create_clip(payload: ClipIn, db: Session = Depends(db_session)):
    if not db.get(Episode, payload.episode_id):
        raise HTTPException(404, "Episode not found")
    clip = Clip(**payload.model_dump())
    db.add(clip)
    db.flush()
    audit(db, "clip.create", clip.id)
    db.commit()
    db.refresh(clip)
    return clip

@app.patch("/api/clips/{clip_id}", response_model=ClipOut, dependencies=[Depends(require_auth)])
def update_clip(clip_id: int, payload: StatusUpdate, db: Session = Depends(db_session)):
    clip = db.get(Clip, clip_id)
    if clip is None:
        raise HTTPException(404, "Clip not found")
    allowed = {
        "draft": {"review"}, "review": {"draft", "approved"},
        "approved": {"draft", "scheduled"}, "scheduled": {"approved", "published"},
        "published": set(),
    }
    if payload.status != clip.status and payload.status not in allowed[clip.status]:
        raise HTTPException(422, f"Invalid transition: {clip.status} → {payload.status}")
    if payload.status == "scheduled" and not (payload.scheduled_for or clip.scheduled_for):
        raise HTTPException(422, "scheduled_for is required to schedule a clip")
    if payload.status == "scheduled" and not clip.asset_url:
        raise HTTPException(422, "Add a clip asset URL before scheduling")
    if payload.scheduled_for and payload.status != "scheduled":
        raise HTTPException(422, "Only scheduled clips accept scheduled_for")
    if payload.status == "scheduled":
        scheduled = payload.scheduled_for or clip.scheduled_for
        if scheduled.tzinfo is None and payload.scheduled_for:
            raise HTTPException(422, "Schedule must include a timezone")
        if (scheduled.replace(tzinfo=timezone.utc) if scheduled.tzinfo is None else scheduled.astimezone(timezone.utc)) <= datetime.now(timezone.utc):
            raise HTTPException(422, "Schedule must be in the future")
    audit(db, f"clip.{clip.status}.{payload.status}", clip.id)
    clip.status = payload.status
    if payload.status in {"draft", "review", "approved"}:
        clip.scheduled_for = None
    if payload.scheduled_for:
        clip.scheduled_for = payload.scheduled_for.astimezone(timezone.utc)
    db.commit()
    db.refresh(clip)
    return clip

@app.get("/api/metrics", response_model=list[MetricOut], dependencies=[Depends(require_auth)])
def list_metrics(db: Session = Depends(db_session)):
    return db.scalars(select(Metric).order_by(Metric.recorded_on.desc(), Metric.id.desc()).limit(100)).all()

@app.post("/api/metrics", response_model=MetricOut, status_code=201, dependencies=[Depends(require_auth)])
def add_metric(payload: MetricIn, db: Session = Depends(db_session)):
    metric = Metric(**payload.model_dump())
    db.add(metric)
    db.flush()
    audit(db, "metric.create", metric.id)
    db.commit()
    db.refresh(metric)
    return metric

class CaptionRequest(InputModel):
    episode_id: int
    platform: Platform = "instagram"
    angle: str = Field(default="generational perspectives", max_length=200)

@app.post("/api/ideas", dependencies=[Depends(require_auth)])
async def generate_idea(payload: CaptionRequest, db: Session = Depends(db_session)):
    episode = db.get(Episode, payload.episode_id)
    if not episode:
        raise HTTPException(404, "Episode not found")
    fallback = {"hook": f"Mom and daughter have different takes on {episode.title}!", "caption": f"Two generations, one honest conversation. 🎙️ {episode.title} — what do you think? #MotherDaughterPodcast #PodcastClips", "source": "template"}
    base_url = os.getenv("LLM_BASE_URL", "").rstrip("/")
    if not base_url:
        return fallback
    prompt = f"Produce JSON only with keys hook and caption. Create a non-deceptive podcast promotional idea. Do not invent quotes, claims or facts. Episode title: {episode.title}. Description: {episode.description}. Channel: {payload.platform}. Angle: {payload.angle}. A human must review output."
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(f"{base_url}/chat/completions", headers={"Authorization": f"Bearer {os.getenv('LLM_API_KEY','not-needed')}"}, json={"model": os.getenv("LLM_MODEL", "local-model"), "messages": [{"role": "user", "content": prompt}], "response_format": {"type": "json_object"}})
            response.raise_for_status()
            import json
            result = json.loads(response.json()["choices"][0]["message"]["content"])
            if not isinstance(result, dict) or not isinstance(result.get("hook"), str) or not isinstance(result.get("caption"), str):
                raise ValueError("Invalid model response")
            return {"hook": result["hook"][:250], "caption": result["caption"][:5000], "source": "llm"}
    except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError):
        return {**fallback, "warning": "Local AI unavailable; returned template instead"}

@app.put("/api/episodes/{episode_id}", response_model=EpisodeOut, dependencies=[Depends(require_auth)])
def edit_episode(episode_id: int, payload: EpisodeIn, db: Session = Depends(db_session)):
    episode = db.get(Episode, episode_id)
    if episode is None:
        raise HTTPException(404, "Episode not found")
    for key, value in payload.model_dump().items():
        setattr(episode, key, value)
    audit(db, "episode.edit", episode.id)
    db.commit()
    db.refresh(episode)
    return episode

@app.put("/api/clips/{clip_id}/content", response_model=ClipOut, dependencies=[Depends(require_auth)])
def edit_clip(clip_id: int, payload: ClipIn, db: Session = Depends(db_session)):
    clip = db.get(Clip, clip_id)
    if clip is None:
        raise HTTPException(404, "Clip not found")
    if clip.status not in {"draft", "review"}:
        raise HTTPException(409, "Return the clip to draft before editing approved content")
    if not db.get(Episode, payload.episode_id):
        raise HTTPException(404, "Episode not found")
    for key, value in payload.model_dump().items():
        setattr(clip, key, value)
    clip.status = "draft"
    audit(db, "clip.edit", clip.id)
    db.commit()
    db.refresh(clip)
    return clip

@app.delete("/api/clips/{clip_id}", dependencies=[Depends(require_auth)])
def delete_clip(clip_id: int, db: Session = Depends(db_session)):
    clip = db.get(Clip, clip_id)
    if clip is None:
        raise HTTPException(404, "Clip not found")
    if clip.status not in {"draft", "review"}:
        raise HTTPException(409, "Only draft or review clips can be deleted")
    db.delete(clip)
    audit(db, "clip.delete", clip_id)
    db.commit()
    return {"ok": True}

@app.delete("/api/metrics/{metric_id}", dependencies=[Depends(require_auth)])
def delete_metric(metric_id: int, db: Session = Depends(db_session)):
    metric = db.get(Metric, metric_id)
    if metric is None:
        raise HTTPException(404, "Snapshot not found")
    db.delete(metric)
    audit(db, "metric.delete", metric_id)
    db.commit()
    return {"ok": True}

@app.get("/api/export", dependencies=[Depends(require_auth)])
def export_workspace(db: Session = Depends(db_session)):
    return JSONResponse({"exported_at": datetime.now(timezone.utc).isoformat(), "schema_version": 1,
        "episodes": [EpisodeOut.model_validate(e).model_dump(mode="json") for e in db.scalars(select(Episode))],
        "clips": [ClipOut.model_validate(c).model_dump(mode="json") for c in db.scalars(select(Clip))],
        "metrics": [MetricOut.model_validate(m).model_dump(mode="json") for m in db.scalars(select(Metric))]},
        headers={"Content-Disposition": 'attachment; filename="podcast-workspace.json"'})
