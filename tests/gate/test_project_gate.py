"""Selbsttest der Prüflogik in isolierten Testprojekten.

Aufruf: python3 -m unittest discover -s tests/gate -v
Jeder Fall baut ein eigenes Mini-Projekt in einem temporären Ordner und ruft
scripts/project_gate.py als eigenen Prozess auf, damit die echten Rückgabecodes geprüft werden.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

GATE = Path(__file__).resolve().parents[2] / "scripts" / "project_gate.py"
PY = sys.executable

HANDOVER_OK = """# Fortschritt

## Übergabe

- Paket: WP-T1
- Nächster Schritt: WP-T2 beginnen
"""


def feature_list(test_cmd: str, approvals: list[str] | None = None, extra_pkg: bool = False) -> dict:
    pkgs = [{
        "id": "WP-T1", "title": "Testpaket", "description": "Fixture", "priority": "P0",
        "depends_on": [], "verification_steps": ["finish ausführen"],
        "acceptance_criteria": ["Test grün"], "required_tests": ["unit"],
        "approvals_required": approvals or [], "passes": False, "evidence": [],
    }]
    if extra_pkg:
        pkgs.append({**pkgs[0], "id": "WP-T2", "title": "Folgepaket", "depends_on": ["WP-T1"]})
    return {
        "schema_version": 1,
        "project": "fixture",
        "verification_scope": {"include": ["src/*", "feature_list.json"], "exclude": ["evidence/*"]},
        "environment_probes": [
            {"cmd": f"{PY} -c \"import os; print(os.environ.get('FAKE_NODE', 'v22.1.0'))\"", "bind": "major"},
            {"cmd": f"{PY} -c \"import os; print(os.environ.get('FAKE_PY', 'Python 3.13.0'))\"", "bind": "none"},
        ],
        "smoke_tests": ["unit"],
        "tests": {"unit": {"cmd": test_cmd}},
        "packages": pkgs,
    }


class GateCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / "src").mkdir()
        (self.root / "src" / "app.txt").write_text("v1")
        self.write_fl(feature_list(f'{PY} -c "import sys; sys.exit(0)"'))
        (self.root / "project-progress.md").write_text(HANDOVER_OK)

    def tearDown(self):
        self.tmp.cleanup()

    def write_fl(self, fl: dict):
        (self.root / "feature_list.json").write_text(json.dumps(fl, indent=2, ensure_ascii=False))

    def read_fl(self) -> dict:
        return json.loads((self.root / "feature_list.json").read_text())

    def gate(self, *args: str, env: dict | None = None) -> subprocess.CompletedProcess:
        full_env = {**os.environ, **(env or {})}
        return subprocess.run([PY, str(GATE), "--root", str(self.root), *args], capture_output=True, text=True, env=full_env)

    # ── positive Fälle ──

    def test_valid_package_is_accepted(self):
        r = self.gate("finish", "--package", "WP-T1")
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertTrue(self.read_fl()["packages"][0]["passes"])
        ev = json.loads((self.root / "evidence" / "WP-T1.json").read_text())
        self.assertEqual(ev["result"], "pass")
        self.assertEqual(ev["commands"][0]["returncode"], 0)
        self.assertEqual(self.gate("start").returncode, 0)

    def test_evidence_survives_protocol_updates(self):
        self.assertEqual(self.gate("finish", "--package", "WP-T1").returncode, 0)
        (self.root / "project-progress.md").write_text(HANDOVER_OK + "\nNotiz nach Abnahme\n")
        (self.root / "evidence" / "notiz.txt").write_text("Protokoll")
        r = self.gate("start")
        self.assertEqual(r.returncode, 0, r.stdout)

    # ── Prüfbereich je Paket ──

    def _scoped(self, approvals: list[str] | None = None) -> None:
        (self.root / "src" / "gate.txt").write_text("g1")
        fl = feature_list(f'{PY} -c "pass"', approvals=approvals, extra_pkg=True)
        fl["packages"][0]["scope"] = {"include": ["src/gate.txt"]}
        self.write_fl(fl)

    def test_change_outside_package_scope_keeps_evidence_and_approval(self):
        self._scoped(approvals=["owner"])
        self.assertEqual(self.gate("finish", "--package", "WP-T1").returncode, 2)
        self.assertEqual(self.gate("approve", "--package", "WP-T1", "--by", "Testperson", "--role", "owner").returncode, 0)
        self.assertEqual(self.gate("finish", "--package", "WP-T1").returncode, 0)
        (self.root / "src" / "app.txt").write_text("anderer Code")
        r = self.gate("start")
        self.assertEqual(r.returncode, 0, r.stdout)

    def test_change_inside_package_scope_makes_evidence_stale(self):
        self._scoped()
        self.assertEqual(self.gate("finish", "--package", "WP-T1").returncode, 0)
        (self.root / "src" / "gate.txt").write_text("g2")
        r = self.gate("start")
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn("veraltet", r.stdout)

    def test_other_package_entry_change_keeps_evidence(self):
        self._scoped()
        self.assertEqual(self.gate("finish", "--package", "WP-T1").returncode, 0)
        fl = self.read_fl()
        fl["packages"][1]["description"] = "geänderte Beschreibung"
        fl["packages"][1]["acceptance_criteria"].append("weiteres Kriterium")
        self.write_fl(fl)
        r = self.gate("start")
        self.assertEqual(r.returncode, 0, r.stdout)

    def test_changed_test_definition_makes_evidence_stale(self):
        self._scoped()
        self.assertEqual(self.gate("finish", "--package", "WP-T1").returncode, 0)
        fl = self.read_fl()
        fl["tests"]["unit"]["cmd"] = f'{PY} -c "print(1)"'
        self.write_fl(fl)
        self.assertEqual(self.gate("start").returncode, 1)

    def test_invalid_package_scope_fails_start(self):
        fl = self.read_fl()
        fl["packages"][0]["scope"] = {"include": []}
        self.write_fl(fl)
        self.assertEqual(self.gate("start", "--no-smoke").returncode, 1)

    def test_logged_environment_change_keeps_evidence(self):
        """Andere Python-Version (bind=none): Nachweis und Freigabe bleiben gültig, mit Hinweis."""
        self.write_fl(feature_list(f'{PY} -c "pass"', approvals=["owner"]))
        self.assertEqual(self.gate("finish", "--package", "WP-T1").returncode, 2)
        self.assertEqual(self.gate("approve", "--package", "WP-T1", "--by", "Testperson", "--role", "owner").returncode, 0)
        self.assertEqual(self.gate("finish", "--package", "WP-T1").returncode, 0)
        r = self.gate("start", env={"FAKE_PY": "Python 3.10.12"})
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertIn("anderer Umgebung", r.stdout)
        self.assertIn("Python 3.10.12", r.stdout)

    def test_bound_environment_change_makes_evidence_stale(self):
        """Andere Node-Hauptversion (bind=major): Nachweis veraltet."""
        self.assertEqual(self.gate("finish", "--package", "WP-T1").returncode, 0)
        self.assertEqual(self.gate("start", env={"FAKE_NODE": "v22.9.9"}).returncode, 0, "Nebenversion bindet nicht")
        r = self.gate("start", env={"FAKE_NODE": "v24.0.0"})
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn("veraltet", r.stdout)

    def test_invalid_environment_probe_fails_start(self):
        fl = self.read_fl()
        fl["environment_probes"] = ["node --version"]
        self.write_fl(fl)
        self.assertEqual(self.gate("start", "--no-smoke").returncode, 1)

    def test_approval_flow(self):
        self.write_fl(feature_list(f'{PY} -c "pass"', approvals=["owner"]))
        r = self.gate("finish", "--package", "WP-T1")
        self.assertEqual(r.returncode, 2, r.stdout)
        self.assertFalse(self.read_fl()["packages"][0]["passes"])
        self.assertEqual(self.gate("approve", "--package", "WP-T1", "--by", "Testperson", "--role", "owner").returncode, 0)
        r = self.gate("finish", "--package", "WP-T1")
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertTrue(self.read_fl()["packages"][0]["passes"])

    # ── negative Fälle ──

    def test_missing_handover_fails(self):
        (self.root / "project-progress.md").write_text("# Fortschritt\n\nnoch nichts\n")
        r = self.gate("finish", "--package", "WP-T1")
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn("Übergabe", r.stdout)
        self.assertFalse(self.read_fl()["packages"][0]["passes"])

    def test_handover_without_next_step_fails(self):
        (self.root / "project-progress.md").write_text("## Übergabe\n\n- Paket: WP-T1\n- Nächster Schritt:\n")
        self.assertEqual(self.gate("finish", "--package", "WP-T1").returncode, 1)

    def test_failing_test_blocks_acceptance(self):
        self.write_fl(feature_list(f'{PY} -c "import sys; sys.exit(3)"'))
        r = self.gate("finish", "--package", "WP-T1")
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertFalse(self.read_fl()["packages"][0]["passes"])
        ev = json.loads((self.root / "evidence" / "WP-T1.json").read_text())
        self.assertEqual(ev["result"], "fail")
        self.assertEqual(ev["commands"][0]["returncode"], 3)

    def test_planned_test_blocks_acceptance(self):
        fl = feature_list(f'{PY} -c "pass"')
        fl["tests"]["unit"]["cmd"] = None
        fl["smoke_tests"] = []
        self.write_fl(fl)
        self.assertEqual(self.gate("finish", "--package", "WP-T1").returncode, 1)

    def test_stale_evidence_is_detected(self):
        self.assertEqual(self.gate("finish", "--package", "WP-T1").returncode, 0)
        (self.root / "src" / "app.txt").write_text("v2")
        r = self.gate("start")
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn("veraltet", r.stdout)

    def test_changed_requirements_make_evidence_stale(self):
        self.assertEqual(self.gate("finish", "--package", "WP-T1").returncode, 0)
        fl = self.read_fl()
        fl["packages"][0]["acceptance_criteria"].append("neues Kriterium")
        self.write_fl(fl)
        self.assertEqual(self.gate("start").returncode, 1)

    def test_approval_for_old_state_does_not_count(self):
        self.write_fl(feature_list(f'{PY} -c "pass"', approvals=["owner"]))
        self.assertEqual(self.gate("finish", "--package", "WP-T1").returncode, 2)
        self.assertEqual(self.gate("approve", "--package", "WP-T1", "--by", "Testperson", "--role", "owner").returncode, 0)
        (self.root / "src" / "app.txt").write_text("v2")
        self.assertEqual(self.gate("finish", "--package", "WP-T1").returncode, 2)

    def test_hand_set_passes_without_evidence_is_a_defect(self):
        fl = self.read_fl()
        fl["packages"][0]["passes"] = True
        self.write_fl(fl)
        r = self.gate("start")
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn("kein Nachweis", r.stdout)

    def test_open_dependency_blocks_acceptance(self):
        self.write_fl(feature_list(f'{PY} -c "pass"', extra_pkg=True))
        (self.root / "project-progress.md").write_text(HANDOVER_OK.replace("WP-T1", "WP-T2"))
        self.assertEqual(self.gate("finish", "--package", "WP-T2").returncode, 1)

    def test_schema_error_fails_start(self):
        fl = self.read_fl()
        del fl["packages"][0]["acceptance_criteria"]
        self.write_fl(fl)
        self.assertEqual(self.gate("start", "--no-smoke").returncode, 1)

    def test_failing_smoke_test_fails_start(self):
        self.write_fl(feature_list(f'{PY} -c "import sys; sys.exit(1)"'))
        self.assertEqual(self.gate("start").returncode, 1)

    def test_unknown_package_is_usage_error(self):
        self.assertEqual(self.gate("finish", "--package", "WP-XX").returncode, 3)

    # ── Folgeprüfung und Rückschrittschutz (WP-15) ──

    def _green_while_v1(self) -> None:
        """Pflichttest ist grün, solange src/app.txt „v1“ enthält; kein Smoke-Test, damit nur die Nachweislogik zählt."""
        fl = feature_list(f'{PY} -c "import sys; sys.exit(0 if open(\'src/app.txt\').read() == \'v1\' else 1)"')
        fl["smoke_tests"] = []
        self.write_fl(fl)

    def test_refinish_after_change_restores_green_start(self):
        self.assertEqual(self.gate("finish", "--package", "WP-T1").returncode, 0)
        self.assertTrue(self.read_fl()["packages"][0]["was_accepted"])
        (self.root / "src" / "app.txt").write_text("v2")
        r = self.gate("start")
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn("finish --package WP-T1", r.stdout)  # nennt den Befehl zur Neuprüfung
        self.assertEqual(self.gate("finish", "--package", "WP-T1").returncode, 0)
        r = self.gate("start")
        self.assertEqual(r.returncode, 0, r.stdout)

    def test_failed_refinish_after_acceptance_stays_a_defect(self):
        self._green_while_v1()
        self.assertEqual(self.gate("finish", "--package", "WP-T1").returncode, 0)
        (self.root / "src" / "app.txt").write_text("v2")  # Rückschritt
        self.assertEqual(self.gate("finish", "--package", "WP-T1").returncode, 1)
        pkg = self.read_fl()["packages"][0]
        self.assertFalse(pkg["passes"])
        self.assertTrue(pkg["was_accepted"])
        r = self.gate("start")
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn("Rückschritt", r.stdout)
        r = self.gate("status")
        self.assertIn("Rückschritt", r.stdout)
        (self.root / "src" / "app.txt").write_text("v1")  # repariert
        self.assertEqual(self.gate("finish", "--package", "WP-T1").returncode, 0)
        self.assertEqual(self.gate("start").returncode, 0)

    def test_missing_reapproval_after_acceptance_stays_a_defect(self):
        self.write_fl(feature_list(f'{PY} -c "pass"', approvals=["owner"]))
        self.assertEqual(self.gate("finish", "--package", "WP-T1").returncode, 2)
        self.assertNotIn("was_accepted", self.read_fl()["packages"][0])  # noch nie abgenommen
        self.assertEqual(self.gate("start").returncode, 0)  # offenes Paket ist kein Defekt
        self.assertEqual(self.gate("approve", "--package", "WP-T1", "--by", "Testperson", "--role", "owner").returncode, 0)
        self.assertEqual(self.gate("finish", "--package", "WP-T1").returncode, 0)
        (self.root / "src" / "app.txt").write_text("v2")
        self.assertEqual(self.gate("finish", "--package", "WP-T1").returncode, 2)
        r = self.gate("start")
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn("Rückschritt", r.stdout)
        self.assertIn("Freigabe fehlt", r.stdout)

    def test_failed_refinish_of_package_accepted_before_the_field_existed(self):
        self._green_while_v1()
        self.assertEqual(self.gate("finish", "--package", "WP-T1").returncode, 0)
        fl = self.read_fl()
        del fl["packages"][0]["was_accepted"]  # Stand vor WP-15: nur passes=true
        self.write_fl(fl)
        (self.root / "src" / "app.txt").write_text("v2")
        self.assertEqual(self.gate("finish", "--package", "WP-T1").returncode, 1)
        self.assertTrue(self.read_fl()["packages"][0]["was_accepted"])
        r = self.gate("start")
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn("Rückschritt", r.stdout)

    def test_invalid_was_accepted_fails_start(self):
        fl = self.read_fl()
        fl["packages"][0]["was_accepted"] = "ja"
        self.write_fl(fl)
        self.assertEqual(self.gate("start").returncode, 1)


if __name__ == "__main__":
    unittest.main()
