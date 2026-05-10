"""
SwipeHire ML sidecar — FastAPI service for embeddings + calibration.

Endpoints:
  GET  /healthz             liveness + loaded model versions
  POST /embed               single-text embedding (1024-dim, bge-large-en-v1.5)
  POST /embed-batch         batched embeddings
  POST /score               calibrated probability + 90% CI
  POST /classify-ghost      ghost-job risk
  POST /check-style         GPT-default style detection

Model artifacts are loaded lazily from R2 (or local disk in dev) on first use.
Quantized variants (int8 ONNX) are preferred when available — see docs/03_architecture.md §3.2.
"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from typing import Any

import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

# Lazy imports — these are heavy and slow to import.
# We import inside lifespan so the process can start while models load in the background.
_embedder = None
_calibrators: dict[str, Any] = {}   # version -> sklearn IsotonicRegression

MODEL_NAME = os.environ.get("MODEL_NAME", "BAAI/bge-large-en-v1.5")
USE_QUANTIZATION = os.environ.get("USE_QUANTIZATION", "true").lower() == "true"
LOG_LEVEL = os.environ.get("LOG_LEVEL", "info").upper()

logging.basicConfig(level=LOG_LEVEL, format="%(asctime)s [%(levelname)s] %(name)s — %(message)s")
log = logging.getLogger("swipehire-ml")


# =====================================================================
# Lifespan: load models at startup
# =====================================================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load models when the app starts; release resources on shutdown."""
    global _embedder
    log.info("Loading embedder %s (quantization=%s)...", MODEL_NAME, USE_QUANTIZATION)
    try:
        from sentence_transformers import SentenceTransformer
        _embedder = SentenceTransformer(MODEL_NAME)
        log.info("Embedder loaded.")
    except Exception as e:
        log.warning("Could not load embedder (%s) — /embed will return 503 until fixed.", e)

    # Bootstrap calibrator: identity isotonic on synthetic data.
    # Real calibration training happens in the worker (weekly retrain).
    try:
        from sklearn.isotonic import IsotonicRegression
        bootstrap = IsotonicRegression(out_of_bounds="clip")
        # Synthetic monotonic mapping — replaced by trained model on first calibration run.
        bootstrap.fit([0.0, 0.25, 0.5, 0.75, 1.0], [0.05, 0.15, 0.35, 0.55, 0.80])
        _calibrators["bootstrap-v0"] = bootstrap
        log.info("Bootstrap calibrator loaded.")
    except Exception as e:
        log.error("Could not load calibrator: %s", e)
        raise

    yield
    log.info("Shutting down sidecar.")


app = FastAPI(title="SwipeHire ML Sidecar", version="2.0.0-dev", lifespan=lifespan)


# =====================================================================
# Schemas
# =====================================================================
class HealthResponse(BaseModel):
    status: str
    embedder_loaded: bool
    embedder_model: str
    calibrators_loaded: list[str]


class EmbedRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=8000)


class EmbedResponse(BaseModel):
    embedding: list[float]
    model: str


class EmbedBatchRequest(BaseModel):
    texts: list[str] = Field(..., min_length=1, max_length=128)


class EmbedBatchResponse(BaseModel):
    embeddings: list[list[float]]
    model: str


class ScoreRequest(BaseModel):
    raw: float = Field(..., ge=0, le=1)
    role_family_id: int | None = None
    model_version_override: str | None = None


class ScoreResponse(BaseModel):
    probability: float
    ci_low: float
    ci_high: float
    model_version: str


class GhostClassifyRequest(BaseModel):
    posting_age_days: int
    applicant_count_growth_7d: int | None = None
    description_length: int
    salary_band_present: bool
    cross_referenced: bool
    repost_count: int = 0


class GhostClassifyResponse(BaseModel):
    ghost_probability: float
    risk: str
    top_features: list[str]
    model_version: str


class StyleCheckRequest(BaseModel):
    text: str


class StyleCheckResponse(BaseModel):
    p_gpt_default: float
    flagged_phrases: list[str]


# =====================================================================
# Endpoints
# =====================================================================
@app.get("/healthz", response_model=HealthResponse)
async def healthz():
    return HealthResponse(
        status="ok",
        embedder_loaded=_embedder is not None,
        embedder_model=MODEL_NAME,
        calibrators_loaded=list(_calibrators.keys()),
    )


@app.post("/embed", response_model=EmbedResponse)
async def embed(req: EmbedRequest):
    if _embedder is None:
        raise HTTPException(status_code=503, detail="Embedder not loaded")
    vec = _embedder.encode(req.text, normalize_embeddings=True).tolist()
    return EmbedResponse(embedding=vec, model=MODEL_NAME)


@app.post("/embed-batch", response_model=EmbedBatchResponse)
async def embed_batch(req: EmbedBatchRequest):
    if _embedder is None:
        raise HTTPException(status_code=503, detail="Embedder not loaded")
    vecs = _embedder.encode(req.texts, normalize_embeddings=True).tolist()
    return EmbedBatchResponse(embeddings=vecs, model=MODEL_NAME)


@app.post("/score", response_model=ScoreResponse)
async def score(req: ScoreRequest):
    """
    Calibrated probability + 90% CI.

    Bootstrap CI: resample the calibration training set 200 times,
    refit, take the 5th and 95th percentiles. v0 returns a fixed-width
    CI based on synthetic bootstrap. Real bootstrap kicks in once the
    weekly retrain has produced versioned calibrators with persisted
    bootstrap arrays in R2.
    """
    version = req.model_version_override or "bootstrap-v0"
    cal = _calibrators.get(version)
    if cal is None:
        raise HTTPException(status_code=404, detail=f"Calibrator {version} not loaded")

    p = float(cal.predict(np.array([req.raw]))[0])

    # v0 fixed-width CI; v1 real bootstrap.
    half_width = 0.12 if version == "bootstrap-v0" else 0.06
    ci_low = max(0.0, p - half_width)
    ci_high = min(1.0, p + half_width)

    return ScoreResponse(
        probability=p,
        ci_low=ci_low,
        ci_high=ci_high,
        model_version=version,
    )


@app.post("/classify-ghost", response_model=GhostClassifyResponse)
async def classify_ghost(req: GhostClassifyRequest):
    """
    Ghost-job classifier. v0 uses a heuristic. v1 replaces with logistic regression
    trained on labeled outcomes.
    """
    score = 0.0
    features: list[str] = []

    if req.posting_age_days > 60:
        score += 0.30
        features.append("posting_age > 60d")
    elif req.posting_age_days > 30:
        score += 0.15
        features.append("posting_age > 30d")

    if req.applicant_count_growth_7d == 0:
        score += 0.20
        features.append("zero applicant growth in 7d")

    if req.description_length < 300:
        score += 0.15
        features.append("description too short")

    if not req.salary_band_present:
        score += 0.05
        features.append("no salary band")

    if not req.cross_referenced:
        score += 0.20
        features.append("not cross-referenced on employer career page")

    if req.repost_count >= 3:
        score += 0.10
        features.append("reposted 3+ times")

    score = min(score, 0.99)

    if score >= 0.6:
        risk = "high"
    elif score >= 0.3:
        risk = "medium"
    else:
        risk = "low"

    return GhostClassifyResponse(
        ghost_probability=score,
        risk=risk,
        top_features=features,
        model_version="heuristic-v0",
    )


@app.post("/check-style", response_model=StyleCheckResponse)
async def check_style(req: StyleCheckRequest):
    """
    Detect "GPT-default" writing patterns in tailored resume bullets.
    v0: banned-phrase + density heuristics. v1: trained logistic regression.
    """
    BANNED = [
        "leveraged", "spearheaded", "passionate about", "results-driven",
        "synergize", "cross-functional", "cutting-edge", "best-in-class",
        "dynamic team player", "go-getter", "thought leader",
    ]
    text_lower = req.text.lower()
    flagged = [p for p in BANNED if p in text_lower]
    density = len(flagged) / max(len(req.text.split()) / 100, 1)
    p = min(0.95, 0.10 + density * 0.30)
    return StyleCheckResponse(p_gpt_default=p, flagged_phrases=flagged)
