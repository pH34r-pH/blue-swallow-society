#!/usr/bin/env python3
"""Point-in-time shadow strategy synthesis for the Mosaic & Murmurs paper engine.

This module implements the safe QuantAgent subset: immutable candidates, delayed
labels, experience retrieval, typed formula synthesis, uncertainty penalties, and
shadow-only promotion. It has no brokerage, wallet, exchange, or live-order path.
"""

from __future__ import annotations

import hashlib
import json
import math
from datetime import datetime, timedelta, timezone
from typing import Any

from mosaic_murmurs_paper_engine import (
    STRATEGY_INSTRUMENT_TYPES,
    STRATEGY_SPECS,
    estimate_round_trip_cost_bps,
    instrument_fresh,
)

CANDIDATE_SCHEMA = "bss.strategy_candidate.v1"
EXPERIENCE_SCHEMA = "bss.strategy_experience.v1"
POLICY_SCHEMA = "bss.strategy_policy.v1"
FEATURES = ("momentum", "mosaic", "murmurs", "truth_market_delta")
MIN_PROMOTION_EXPERIENCES = 30
MAX_RETRIEVED_EXPERIENCES = 64

BASE_WEIGHTS: dict[str, dict[str, float]] = {
    "prediction_markets": {"momentum": 0.10, "mosaic": 0.10, "murmurs": 0.10, "truth_market_delta": 0.70},
    "crypto": {"momentum": 0.70, "mosaic": 0.10, "murmurs": 0.10, "truth_market_delta": 0.10},
    "equity_watch": {"momentum": 0.65, "mosaic": 0.20, "murmurs": 0.10, "truth_market_delta": 0.05},
    "local_event_watch": {"momentum": 0.40, "mosaic": 0.35, "murmurs": 0.20, "truth_market_delta": 0.05},
    "ai_cyber_watch": {"momentum": 0.45, "mosaic": 0.15, "murmurs": 0.35, "truth_market_delta": 0.05},
    "cross_asset_momentum": {"momentum": 0.70, "mosaic": 0.10, "murmurs": 0.10, "truth_market_delta": 0.10},
    "contrarian_reversion": {"momentum": -0.70, "mosaic": 0.10, "murmurs": 0.10, "truth_market_delta": 0.10},
    "volatility_barbell": {"momentum": 0.55, "mosaic": 0.15, "murmurs": 0.20, "truth_market_delta": 0.10},
}


def iso_z(value: datetime) -> str:
    return value.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def iso_z_precise(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def parse_iso(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def stable_id(prefix: str, value: Any) -> str:
    material = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return f"{prefix}_{hashlib.sha256(material.encode('utf-8')).hexdigest()[:24]}"


def finite_number(value: Any, default: float = 0.0) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        return default
    return float(value)


def clip(value: float, minimum: float = -1.0, maximum: float = 1.0) -> float:
    return min(maximum, max(minimum, value))


def _normalized_features(instrument: dict[str, Any]) -> dict[str, float]:
    return {
        "momentum": round(clip(finite_number(instrument.get("momentum_score")) / 10.0), 8),
        "mosaic": round(clip(finite_number(instrument.get("mosaic_score"))), 8),
        "murmurs": round(clip(finite_number(instrument.get("murmurs_score"))), 8),
        "truth_market_delta": round(clip(finite_number(instrument.get("truth_market_delta", instrument.get("signal_score"))) / 10.0), 8),
    }


def _normalize_weights(weights: dict[str, float]) -> dict[str, float]:
    magnitude = sum(abs(finite_number(weights.get(feature))) for feature in FEATURES)
    if magnitude <= 0:
        return {feature: 0.0 for feature in FEATURES}
    return {feature: round(finite_number(weights.get(feature)) / magnitude, 8) for feature in FEATURES}


def _eligible_instrument(strategy_id: str, instrument: dict[str, Any], now: datetime) -> bool:
    tags = instrument.get("book_tags")
    return (
        isinstance(tags, list)
        and strategy_id in tags
        and instrument.get("instrument_type") in STRATEGY_INSTRUMENT_TYPES[strategy_id]
        and instrument.get("settled") is not True
        and instrument_fresh(instrument, now)[0]
    )


def _resolved_experiences(experiences: list[dict[str, Any]], strategy_id: str, now: datetime) -> list[dict[str, Any]]:
    resolved = []
    for record in experiences:
        if not isinstance(record, dict) or record.get("schema_version") != EXPERIENCE_SCHEMA or record.get("strategy_id") != strategy_id:
            continue
        resolved_at = parse_iso(record.get("label_resolved_at"))
        if resolved_at is not None and resolved_at <= now:
            resolved.append(record)
    return sorted(resolved, key=lambda item: (str(item.get("label_resolved_at")), str(item.get("experience_id"))))


def synthesize_shadow_policies(experiences: list[dict[str, Any]], now: datetime) -> list[dict[str, Any]]:
    """Create typed deterministic challengers from matured experience only.

    Policies are never promoted here. Eligibility evidence is surfaced, but an
    independent governance path must approve and activate any future version.
    """
    policies: list[dict[str, Any]] = []
    for spec in STRATEGY_SPECS:
        strategy_id = spec["strategy_id"]
        matured = _resolved_experiences(experiences, strategy_id, now)
        base = dict(BASE_WEIGHTS[strategy_id])
        if matured:
            quality = {
                feature: sum(
                    finite_number(record.get("features", {}).get(feature))
                    * finite_number(record.get("net_excess_return_bps"))
                    * (1 if finite_number(record.get("direction")) >= 0 else -1)
                    for record in matured
                ) / len(matured)
                for feature in FEATURES
            }
            adjusted = {feature: base[feature] + clip(quality[feature] / 500.0, -0.20, 0.20) for feature in FEATURES}
        else:
            adjusted = base
        weights = _normalize_weights(adjusted)
        returns = [finite_number(record.get("net_excess_return_bps")) for record in matured]
        mean = sum(returns) / len(returns) if returns else 0.0
        variance = sum((value - mean) ** 2 for value in returns) / max(1, len(returns) - 1) if len(returns) > 1 else 0.0
        standard_error = math.sqrt(variance) / math.sqrt(len(returns)) if returns else 0.0
        sparse_penalty = 100.0 / math.sqrt(len(returns) + 1)
        pessimistic = mean - 1.96 * standard_error - sparse_penalty
        evidence_ready = len(matured) >= MIN_PROMOTION_EXPERIENCES and pessimistic > 0
        blockers = ["operator_governance_required", "shadow_only_runtime"]
        if len(matured) < MIN_PROMOTION_EXPERIENCES:
            blockers.append("insufficient_mature_experiences")
        if pessimistic <= 0:
            blockers.append("nonpositive_pessimistic_excess_return")
        body = {
            "strategy_id": strategy_id,
            "formula": "weighted_sum_v1",
            "weights": weights,
            "mature_experience_count": len(matured),
            "experience_ids": [record["experience_id"] for record in matured[-MAX_RETRIEVED_EXPERIENCES:]],
            "mean_net_excess_return_bps": round(mean, 6),
            "pessimistic_net_excess_return_bps": round(pessimistic, 6),
            "evidence_ready": evidence_ready,
            "generated_at": iso_z_precise(now),
        }
        policies.append({
            "schema_version": POLICY_SCHEMA,
            "policy_id": stable_id("strategy_policy", body),
            **body,
            "promotion_state": "shadow",
            "eligible_for_promotion": False,
            "promotion_blockers": blockers,
            "paper_only": True,
        })
    return policies


def generate_shadow_candidates(
    market_snapshot: dict[str, Any],
    policies: list[dict[str, Any]],
    experiences: list[dict[str, Any]],
    now: datetime,
    *,
    horizon_hours: int = 24,
) -> list[dict[str, Any]]:
    if horizon_hours < 1 or horizon_hours > 24 * 30:
        raise ValueError("horizon_hours must be in [1, 720]")
    instruments = [item for item in market_snapshot.get("instruments", []) if isinstance(item, dict)]
    candidates: list[dict[str, Any]] = []
    for policy in policies:
        strategy_id = str(policy["strategy_id"])
        eligible = [item for item in instruments if _eligible_instrument(strategy_id, item, now)]
        if not eligible:
            continue
        weights = policy["weights"]

        def score(item: dict[str, Any]) -> tuple[float, str]:
            features = _normalized_features(item)
            raw = sum(weights[feature] * features[feature] for feature in FEATURES)
            return (abs(raw), str(item.get("instrument_ref")))

        instrument = max(eligible, key=score)
        features = _normalized_features(instrument)
        raw_score = sum(weights[feature] * features[feature] for feature in FEATURES)
        direction = 1 if raw_score > 0 else -1 if raw_score < 0 else 0
        expected_edge_bps = abs(raw_score) * 200.0
        round_trip_cost_bps = estimate_round_trip_cost_bps(instrument)
        net_expected_edge_bps = expected_edge_bps - round_trip_cost_bps
        action = "WATCH"
        if direction and net_expected_edge_bps > 0:
            action = "SHADOW_OVERWEIGHT" if direction > 0 else "SHADOW_UNDERWEIGHT"
        resolved = _resolved_experiences(experiences, strategy_id, now)[-MAX_RETRIEVED_EXPERIENCES:]
        feature_end = parse_iso(instrument.get("as_of")) or parse_iso(instrument.get("retrieved_at")) or now
        if feature_end > now:
            raise ValueError("point-in-time feature window cannot end after decision time")
        candidate_body = {
            "policy_id": policy["policy_id"],
            "strategy_id": strategy_id,
            "instrument_ref": instrument["instrument_ref"],
            "decision_as_of": iso_z(now),
            "features": features,
            "market_snapshot_hash": stable_id("snapshot", market_snapshot),
        }
        candidates.append({
            "schema_version": CANDIDATE_SCHEMA,
            "candidate_id": stable_id("strategy_candidate", candidate_body),
            **candidate_body,
            "line_id": None,
            "feature_window_end": iso_z(feature_end),
            "label_horizon_hours": horizon_hours,
            "label_available_at": iso_z(now + timedelta(hours=horizon_hours)),
            "retrieved_experience_ids": [record["experience_id"] for record in resolved],
            "formula": policy["formula"],
            "weights": dict(weights),
            "raw_score": round(raw_score, 8),
            "direction": direction,
            "entry_mark": finite_number(instrument.get("mark_price")),
            "expected_edge_bps": round(expected_edge_bps, 6),
            "round_trip_cost_bps": round(round_trip_cost_bps, 6),
            "net_expected_edge_bps": round(net_expected_edge_bps, 6),
            "action": action,
            "reason_codes": ["typed_formula", "point_in_time_features", "cost_hurdle_applied", "shadow_only"],
            "source_ref": instrument.get("source_id"),
            "source_url": instrument.get("source_url"),
            "promotion_state": "shadow",
            "paper_only": True,
        })
    return candidates


def mature_experiences(
    candidates: list[dict[str, Any]],
    existing_experiences: list[dict[str, Any]],
    market_snapshot: dict[str, Any],
    now: datetime,
) -> list[dict[str, Any]]:
    """Resolve due immutable candidates against a later point-in-time mark once."""
    existing_candidate_ids = {
        str(record.get("candidate_id"))
        for record in existing_experiences
        if isinstance(record, dict) and record.get("candidate_id")
    }
    marks = {
        item.get("instrument_ref"): item
        for item in market_snapshot.get("instruments", [])
        if isinstance(item, dict) and item.get("instrument_ref") and instrument_fresh(item, now)[0]
    }
    matured: list[dict[str, Any]] = []
    for candidate in candidates:
        if candidate.get("schema_version") != CANDIDATE_SCHEMA or candidate.get("candidate_id") in existing_candidate_ids:
            continue
        available_at = parse_iso(candidate.get("label_available_at"))
        decision_as_of = parse_iso(candidate.get("decision_as_of"))
        horizon_hours = candidate.get("label_horizon_hours")
        instrument = marks.get(candidate.get("instrument_ref"))
        if (
            available_at is None
            or decision_as_of is None
            or isinstance(horizon_hours, bool)
            or not isinstance(horizon_hours, int)
            or not 1 <= horizon_hours <= 24 * 30
            or available_at != decision_as_of + timedelta(hours=horizon_hours)
            or available_at > now
            or instrument is None
        ):
            continue
        label_mark_as_of = parse_iso(instrument.get("as_of"))
        if label_mark_as_of is None or label_mark_as_of < available_at or label_mark_as_of > now:
            continue
        entry = finite_number(candidate.get("entry_mark"))
        current = finite_number(instrument.get("mark_price"))
        if entry <= 0 or current < 0:
            continue
        direction = int(finite_number(candidate.get("direction")))
        gross_return_bps = ((current / entry) - 1.0) * 10_000.0 * direction if direction else 0.0
        round_trip = finite_number(candidate.get("round_trip_cost_bps"))
        traded = candidate.get("action") in {"SHADOW_OVERWEIGHT", "SHADOW_UNDERWEIGHT"}
        net_return_bps = gross_return_bps - round_trip if traded else 0.0
        benchmark_return_bps = 0.0
        body = {
            "candidate_id": candidate["candidate_id"],
            "strategy_id": candidate["strategy_id"],
            "instrument_ref": candidate["instrument_ref"],
        }
        matured.append({
            "schema_version": EXPERIENCE_SCHEMA,
            "experience_id": stable_id("strategy_experience", body),
            **body,
            "label_resolved_at": iso_z(now),
            "label_mark_as_of": iso_z(label_mark_as_of),
            "label_mark": round(current, 10),
            "features": dict(candidate.get("features") or {}),
            "direction": direction,
            "gross_return_bps": round(gross_return_bps, 6),
            "round_trip_cost_bps": round(round_trip, 6),
            "net_return_bps": round(net_return_bps, 6),
            "benchmark_return_bps": benchmark_return_bps,
            "net_excess_return_bps": round(net_return_bps - benchmark_return_bps, 6),
            "decision_as_of": candidate["decision_as_of"],
            "label_available_at": candidate["label_available_at"],
            "paper_only": True,
        })
    return matured
