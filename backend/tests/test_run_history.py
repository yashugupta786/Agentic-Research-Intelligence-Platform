"""Historical results must survive restart without borrowing current state."""
import sqlite3
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient
from app.data import db
from app.services import run_history
from app.main import app


class RunHistoryTests(unittest.TestCase):
    def setUp(self):
        test_root = Path(__file__).resolve().parent
        self.temp = tempfile.TemporaryDirectory(dir=test_root, prefix="history-test-")
        assert Path(self.temp.name).resolve().parent == test_root
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "history.db"
        self.setting = patch.object(db, "settings", SimpleNamespace(db_path=self.path))
        self.setting.start()
        self.addCleanup(self.setting.stop)
        db.init_db()

    def result(self, question="AI in healthcare", graph=True):
        return {"question": question, "intent": "market_scan", "answer": "Recorded answer",
                "topics": [{"slug": "ai", "label": "AI"}], "gaps": [], "coverage": {},
                "articles": [{"url": "https://example.org/a"}], "trace": [],
                "graph": {"snapshot": {"nodes": [{"id": "TOPIC:ai"}], "links": []}} if graph else {},
                "telemetry": {"total_calls": 4}, "errors": []}

    def test_roundtrip_preserves_all_output_and_does_not_share_objects(self):
        original = self.result()
        run_id = run_history.save_run(original)
        original["topics"][0]["label"] = "Later mutation"
        restored = run_history.load_run(run_id)
        self.assertEqual(restored["topics"][0]["label"], "AI")
        self.assertEqual(restored["graph"]["snapshot"]["nodes"][0]["id"], "TOPIC:ai")
        self.assertEqual(restored["history_source"], "database")
        self.assertEqual(restored["snapshot_kind"], "complete")
        self.assertEqual(restored["telemetry"]["total_calls"], 4)
        self.assertTrue(restored["saved_at"])

    def test_second_run_does_not_replace_first_graph(self):
        first = run_history.save_run(self.result())
        second_result = self.result("Supply chain")
        second_result["graph"]["snapshot"]["nodes"] = [{"id": "TOPIC:supply"}]
        second = run_history.save_run(second_result)
        self.assertNotEqual(run_history.load_run(first)["graph"], run_history.load_run(second)["graph"])

    def test_legacy_recovery_uses_recorded_outputs_only(self):
        trace = [{"detail": {"output": {"topics": [{"label": "Historical"}], "graph": {"snapshot": {"nodes": [{"id": "old"}]}}}}}]
        rid = db.execute("INSERT INTO runs(question,trace,answer) VALUES (?,?,?)", ("Old query", db.as_json(trace), "Old answer"))
        restored = run_history.load_run(rid)
        self.assertEqual(restored["snapshot_kind"], "recovered")
        self.assertEqual(restored["topics"][0]["label"], "Historical")
        self.assertTrue(run_history.list_runs(graph_only=True)["runs"][0]["has_graph"])

    def test_legacy_summary_does_not_invent_graph(self):
        rid = db.execute("INSERT INTO runs(question,answer) VALUES (?,?)", ("Old query", "Old answer"))
        restored = run_history.load_run(rid)
        self.assertEqual(restored["snapshot_kind"], "legacy")
        self.assertEqual(restored["graph"], {})
        self.assertEqual(run_history.list_runs(graph_only=True)["total"], 0)

    def test_pagination_and_graph_filter(self):
        a = run_history.save_run(self.result())
        run_history.save_run(self.result("Library question", graph=False))
        c = run_history.save_run(self.result("Another scan"))
        self.assertEqual(run_history.list_runs(1)["runs"][0]["id"], c)
        self.assertEqual(run_history.list_runs(1, 1, True)["runs"][0]["id"], a)
        self.assertEqual(run_history.list_runs(graph_only=True)["total"], 2)

    def test_api_replay_and_validation(self):
        rid = run_history.save_run(self.result())
        client = TestClient(app)
        with patch("app.api.agent.run_agent", side_effect=AssertionError("Replay called a provider workflow")):
            self.assertEqual(client.get(f"/api/runs/{rid}/result").json()["result"]["question"], "AI in healthcare")
            self.assertEqual(client.get("/api/runs?graph_only=true").json()["total"], 1)
        self.assertEqual(client.get("/api/runs/99999/result").status_code, 404)
        self.assertEqual(client.get("/api/runs?limit=-1").status_code, 422)
        self.assertEqual(client.get("/api/runs?offset=-1").status_code, 422)

    def test_additive_migration_keeps_old_row(self):
        with sqlite3.connect(self.path) as conn:
            conn.execute("ALTER TABLE runs DROP COLUMN result_json")
            conn.execute("INSERT INTO runs(question,answer) VALUES ('Preserved', 'Before migration')")
        conn.close()
        db.init_db()
        db.init_db()
        row = db.query_one("SELECT * FROM runs")
        self.assertEqual(row["answer"], "Before migration")
        self.assertIn("result_json", row)


if __name__ == "__main__":
    unittest.main()
