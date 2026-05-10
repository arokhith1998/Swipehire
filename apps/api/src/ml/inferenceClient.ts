/**
 * inferenceClient — single interface to the ML sidecar.
 *
 * The sidecar runs Python + sentence-transformers + sklearn.
 * Endpoints: POST /embed, POST /score, POST /classify-ghost, POST /check-style.
 *
 * Fallback: if sidecar is unreachable and ML_FALLBACK_ENABLED, use in-process
 * approximations (lower quality but the system stays online).
 */

import { request } from 'undici';
import { flags } from '../config/flags.js';

const ML_URL = process.env.ML_SIDECAR_URL ?? 'http://localhost:8001';
const TIMEOUT = parseInt(process.env.ML_SIDECAR_TIMEOUT_MS ?? '2000', 10);

class SidecarUnavailable extends Error {
  constructor(public underlying: unknown) {
    super('ML sidecar unavailable');
  }
}

async function callSidecar<T>(path: string, body: unknown): Promise<T> {
  try {
    const { statusCode, body: respBody } = await request(`${ML_URL}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      bodyTimeout: TIMEOUT,
      headersTimeout: TIMEOUT,
    });
    if (statusCode >= 400) {
      throw new Error(`Sidecar ${path} returned ${statusCode}`);
    }
    return (await respBody.json()) as T;
  } catch (err) {
    throw new SidecarUnavailable(err);
  }
}

// =====================================================================
// /embed
// =====================================================================
export async function embed(text: string): Promise<number[]> {
  try {
    const r = await callSidecar<{ embedding: number[] }>('/embed', { text });
    return r.embedding;
  } catch (err) {
    if (flags.ML_FALLBACK_ENABLED) return wasmEmbedFallback(text);
    throw err;
  }
}

export async function batchEmbed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  try {
    const r = await callSidecar<{ embeddings: number[][] }>('/embed-batch', { texts });
    return r.embeddings;
  } catch (err) {
    if (flags.ML_FALLBACK_ENABLED) return Promise.all(texts.map(wasmEmbedFallback));
    throw err;
  }
}

// =====================================================================
// /score (calibration)
// =====================================================================
export interface ScoreRequest {
  raw: number;
  role_family_id: number | null;
  model_version_override?: string;
}

export interface ScoreResponse {
  probability: number;
  ci_low: number;
  ci_high: number;
  model_version: string;
}

export async function score(req: ScoreRequest): Promise<ScoreResponse> {
  return callSidecar<ScoreResponse>('/score', req);
}

// =====================================================================
// /classify-ghost
// =====================================================================
export interface GhostClassifyRequest {
  posting_age_days: number;
  applicant_count_growth_7d: number | null;
  description_length: number;
  salary_band_present: boolean;
  cross_referenced: boolean;
  repost_count: number;
}

export interface GhostClassifyResponse {
  ghost_probability: number;
  risk: 'low' | 'medium' | 'high';
  top_features: string[];
  model_version: string;
}

export async function classifyGhost(req: GhostClassifyRequest): Promise<GhostClassifyResponse> {
  return callSidecar<GhostClassifyResponse>('/classify-ghost', req);
}

// =====================================================================
// /check-style
// =====================================================================
export async function checkStyle(text: string): Promise<{ p_gpt_default: number; flagged_phrases: string[] }> {
  return callSidecar('/check-style', { text });
}

// =====================================================================
// Fallback embedder (WASM, very slow but keeps the system alive)
// =====================================================================
let _wasmEmbedder: ((t: string) => Promise<number[]>) | null = null;

async function wasmEmbedFallback(text: string): Promise<number[]> {
  if (!_wasmEmbedder) {
    // TODO(v2.1): wire @xenova/transformers ONNX-WASM embedder.
    // For now: deterministic hash-based vector. Quality is poor but it's a fallback.
    _wasmEmbedder = async (t: string) => hashVector(t, 1024);
  }
  return _wasmEmbedder(text);
}

function hashVector(s: string, dims: number): number[] {
  const out = new Array(dims).fill(0);
  for (let i = 0; i < s.length; i++) {
    out[i % dims] += s.charCodeAt(i);
  }
  // L2 normalize
  let norm = 0;
  for (const v of out) norm += v * v;
  norm = Math.sqrt(norm) + 1e-9;
  for (let i = 0; i < dims; i++) out[i] /= norm;
  return out;
}
