import unittest
from datetime import datetime, timedelta, timezone

from paper_engine_test import fresh_snapshot
from mosaic_murmurs_strategy_synthesis import (
    EXPERIENCE_SCHEMA,
    POLICY_SCHEMA,
    CANDIDATE_SCHEMA,
    mature_experiences,
    synthesize_shadow_policies,
    generate_shadow_candidates,
)


class StrategySynthesisTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 7, 13, 2, 0, tzinfo=timezone.utc)
        self.snapshot = fresh_snapshot(self.now)

    def test_generates_one_point_in_time_shadow_candidate_per_strategy_not_per_aggression_line(self):
        policies = synthesize_shadow_policies([], self.now)
        candidates = generate_shadow_candidates(self.snapshot, policies, [], self.now, horizon_hours=24)

        self.assertEqual(len(policies), 8)
        self.assertEqual(len(candidates), 8)
        self.assertEqual({candidate["strategy_id"] for candidate in candidates}, {policy["strategy_id"] for policy in policies})
        self.assertTrue(all(candidate["schema_version"] == CANDIDATE_SCHEMA for candidate in candidates))
        self.assertTrue(all(candidate["promotion_state"] == "shadow" for candidate in candidates))
        self.assertTrue(all(candidate["paper_only"] is True for candidate in candidates))
        self.assertTrue(all(candidate["line_id"] is None for candidate in candidates))
        self.assertTrue(all(candidate["feature_window_end"] <= candidate["decision_as_of"] for candidate in candidates))
        self.assertTrue(all(candidate["label_available_at"] > candidate["decision_as_of"] for candidate in candidates))
        self.assertTrue(all(candidate["round_trip_cost_bps"] > 0 for candidate in candidates))
        self.assertTrue(all(candidate["action"] in {"SHADOW_OVERWEIGHT", "SHADOW_UNDERWEIGHT", "WATCH"} for candidate in candidates))

    def test_expected_edge_must_clear_round_trip_cost_before_directional_shadow_action(self):
        policies = synthesize_shadow_policies([], self.now)
        zero_signal = fresh_snapshot(self.now)
        for instrument in zero_signal["instruments"]:
            instrument["momentum_score"] = 0
            instrument["signal_score"] = 0
        candidates = generate_shadow_candidates(zero_signal, policies, [], self.now)
        self.assertTrue(all(candidate["action"] == "WATCH" for candidate in candidates))
        self.assertTrue(all(candidate["net_expected_edge_bps"] <= 0 for candidate in candidates))

    def test_matures_delayed_outcomes_once_with_cost_and_cash_baseline_labels(self):
        decision_time = self.now - timedelta(hours=25)
        policies = synthesize_shadow_policies([], decision_time)
        decision_snapshot = fresh_snapshot(decision_time)
        candidates = generate_shadow_candidates(decision_snapshot, policies, [], decision_time, horizon_hours=24)
        current_snapshot = fresh_snapshot(self.now)
        for instrument in current_snapshot["instruments"]:
            instrument["mark_price"] *= 1.02
        experiences = mature_experiences(candidates, [], current_snapshot, self.now)

        self.assertEqual(len(experiences), 8)
        self.assertTrue(all(record["schema_version"] == EXPERIENCE_SCHEMA for record in experiences))
        self.assertEqual(len({record["candidate_id"] for record in experiences}), 8)
        self.assertTrue(all(record["label_resolved_at"] >= record["label_available_at"] for record in experiences))
        self.assertTrue(all(record["round_trip_cost_bps"] > 0 for record in experiences))
        self.assertTrue(all(record["benchmark_return_bps"] == 0 for record in experiences))
        self.assertEqual(mature_experiences(candidates, experiences, current_snapshot, self.now), [])

    def test_policy_synthesis_uses_only_matured_strategy_experiences_and_stays_shadow(self):
        records = []
        for index in range(32):
            records.append({
                "schema_version": EXPERIENCE_SCHEMA,
                "experience_id": f"exp-{index}",
                "candidate_id": f"cand-{index}",
                "strategy_id": "crypto",
                "instrument_ref": "crypto:bitcoin",
                "features": {"momentum": 0.8, "mosaic": 0.1, "murmurs": -0.1, "truth_market_delta": 0.0},
                "direction": 1,
                "gross_return_bps": 180.0,
                "round_trip_cost_bps": 100.0,
                "net_return_bps": 80.0,
                "benchmark_return_bps": 0.0,
                "net_excess_return_bps": 80.0,
                "decision_as_of": "2026-07-10T00:00:00Z",
                "label_available_at": "2026-07-11T00:00:00Z",
                "label_resolved_at": "2026-07-11T00:01:00Z",
                "paper_only": True,
            })
        records.append({**records[0], "experience_id": "future", "candidate_id": "future", "label_resolved_at": "2026-07-14T00:00:00Z"})
        policies = synthesize_shadow_policies(records, self.now)
        crypto = next(policy for policy in policies if policy["strategy_id"] == "crypto")

        self.assertEqual(crypto["schema_version"], POLICY_SCHEMA)
        self.assertEqual(crypto["mature_experience_count"], 32)
        self.assertGreater(crypto["weights"]["momentum"], crypto["weights"]["murmurs"])
        self.assertEqual(crypto["promotion_state"], "shadow")
        self.assertFalse(crypto["eligible_for_promotion"])
        self.assertIn("operator_governance_required", crypto["promotion_blockers"])

    def test_policy_snapshot_identity_changes_with_tick_but_is_idempotent_at_one_timestamp(self):
        first = synthesize_shadow_policies([], self.now)
        replay = synthesize_shadow_policies([], self.now)
        later = synthesize_shadow_policies([], self.now + timedelta(minutes=5))
        same_second = synthesize_shadow_policies([], self.now + timedelta(microseconds=1))
        self.assertEqual(first, replay)
        self.assertTrue(set(policy["policy_id"] for policy in first).isdisjoint(policy["policy_id"] for policy in later))
        self.assertTrue(set(policy["policy_id"] for policy in first).isdisjoint(policy["policy_id"] for policy in same_second))

    def test_label_mark_must_be_at_or_after_the_candidate_horizon(self):
        decision_time = self.now - timedelta(hours=25)
        decision_snapshot = fresh_snapshot(decision_time)
        policies = synthesize_shadow_policies([], decision_time)
        candidates = generate_shadow_candidates(decision_snapshot, policies, [], decision_time, horizon_hours=24)
        stale_label_snapshot = fresh_snapshot(self.now)
        stale_mark_time = decision_time.isoformat().replace("+00:00", "Z")
        for instrument in stale_label_snapshot["instruments"]:
            instrument["as_of"] = stale_mark_time
        self.assertEqual(mature_experiences(candidates, [], stale_label_snapshot, self.now), [])

        tampered = [dict(candidate) for candidate in candidates]
        for candidate in tampered:
            candidate["label_available_at"] = (decision_time + timedelta(minutes=1)).isoformat().replace("+00:00", "Z")
        early_snapshot = fresh_snapshot(decision_time + timedelta(minutes=2))
        self.assertEqual(mature_experiences(tampered, [], early_snapshot, decision_time + timedelta(minutes=2)), [])


if __name__ == "__main__":
    unittest.main()
