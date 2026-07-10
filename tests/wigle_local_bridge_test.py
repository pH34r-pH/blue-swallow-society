import importlib.util
import sqlite3
import tempfile
import unittest
from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "scripts" / "wigle-local-bridge.py"


def load_bridge_module():
    spec = importlib.util.spec_from_file_location("wigle_local_bridge", SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise AssertionError(f"Unable to load {SCRIPT_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class WigleLocalBridgeTests(unittest.TestCase):
    def create_wigle_db(self, path: Path) -> None:
        conn = sqlite3.connect(path)
        try:
            conn.executescript(
                """
                create table network (
                    bssid text primary key not null,
                    ssid text not null,
                    frequency int not null,
                    capabilities text not null,
                    lasttime long not null,
                    lastlat double not null,
                    lastlon double not null,
                    type text not null default 'W',
                    bestlevel integer not null default 0,
                    bestlat double not null default 0,
                    bestlon double not null default 0,
                    rcois text not null default '',
                    mfgrid integer not null default 0,
                    service text not null default ''
                );
                create table location (
                    _id integer primary key autoincrement,
                    bssid text not null,
                    level integer not null,
                    lat double not null,
                    lon double not null,
                    altitude double not null,
                    accuracy float not null,
                    time long not null,
                    external integer not null default 0,
                    mfgrid integer not null default 0
                );
                create table route (
                    _id integer primary key autoincrement,
                    run_id integer not null,
                    wifi_visible integer not null default 0,
                    cell_visible integer not null default 0,
                    bt_visible integer not null default 0,
                    lat double not null,
                    lon double not null,
                    altitude double not null,
                    accuracy float not null,
                    time long not null
                );
                """
            )
            rows = [
                ("aa:bb:cc:dd:ee:01", "Old Strong AP", 2412, "[WPA2]", 1783598280000, 47.62058, -122.34918, "W", -31, 47.62058, -122.34918),
                ("aa:bb:cc:dd:ee:02", "Current Near AP", 2462, "[WPA2]", 1783598418000, 47.62058, -122.34918, "W", -44, 47.62058, -122.34918),
                ("aa:bb:cc:dd:ee:03", "Current Far AP", 2437, "[OPEN]", 1783598424000, 47.62059, -122.34920, "W", -68, 47.62059, -122.34920),
                ("aa:bb:cc:dd:ee:04", "Moving AP", 5180, "[WPA3]", 1783598426000, 47.62060, -122.34921, "W", -35, 47.62060, -122.34921),
            ]
            conn.executemany(
                "insert into network (bssid, ssid, frequency, capabilities, lasttime, lastlat, lastlon, type, bestlevel, bestlat, bestlon) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                rows,
            )
            observations = [
                ("aa:bb:cc:dd:ee:01", -31, 47.62058, -122.34918, 0, 4, 1783598280000),
                ("aa:bb:cc:dd:ee:02", -44, 47.62058, -122.34918, 0, 4, 1783598418000),
                ("aa:bb:cc:dd:ee:03", -68, 47.62059, -122.34920, 0, 4, 1783598424000),
                ("aa:bb:cc:dd:ee:04", -35, 47.62060, -122.34921, 0, 4, 1783598404000),
                ("aa:bb:cc:dd:ee:04", -71, 47.62061, -122.34922, 0, 4, 1783598426000),
            ]
            conn.executemany(
                "insert into location (bssid, level, lat, lon, altitude, accuracy, time) values (?, ?, ?, ?, ?, ?, ?)",
                observations,
            )
            conn.execute(
                "insert into route (run_id, lat, lon, altitude, accuracy, time) values (1, 47.6205, -122.3493, 0, 5, 1783598425000)"
            )
            conn.commit()
        finally:
            conn.close()

    def test_query_current_state_returns_recent_unique_observations_ordered_by_signal(self):
        module = load_bridge_module()
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "wiglewifi.sqlite"
            self.create_wigle_db(db_path)

            snapshot = module.query_current_state(
                db_path,
                now_ms=1783598430000,
                max_age_ms=45_000,
                limit=10,
                lat=47.6205,
                lon=-122.3493,
                radius_meters=100,
            )

        self.assertTrue(snapshot["live"])
        self.assertEqual(snapshot["source"], "device-local-wigle-sqlite")
        self.assertEqual([row["ssid"] for row in snapshot["accessPoints"]], ["Current Near AP", "Current Far AP", "Moving AP"])
        moving = next(row for row in snapshot["accessPoints"] if row["ssid"] == "Moving AP")
        self.assertEqual(moving["signalDbm"], -71)
        self.assertEqual(moving["lastSeen"], "2026-07-09T12:00:26.000Z")
        self.assertEqual(moving["ageMs"], 4000)
        self.assertEqual(snapshot["location"]["lat"], 47.6205)


if __name__ == "__main__":
    unittest.main()
