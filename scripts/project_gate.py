#!/usr/bin/env python3
"""Projektlokale Start- und Abschlussprüfung für Habla (nur Python-Standardbibliothek).

Befehle
  start                      Projektdateien, Featureliste, Übergabe und Ausgangsfunktion prüfen
  finish --package WP-xx     Pflichttests ausführen, Nachweis schreiben, Abnahme prüfen
  approve --package WP-xx --by NAME --role ROLLE [--note TEXT]
                             Freigabe einer berechtigten Person für den aktuellen Stand festhalten
  status                     Pakete mit Abnahme- und Nachweisstand anzeigen

Rückgabecodes
  0  in Ordnung (start) bzw. abgenommen (finish)
  1  Prüfung fehlgeschlagen oder Projektdefekt
  2  technisch bestanden, aber erforderliche Freigabe fehlt (finish)
  3  Aufruf- oder Konfigurationsfehler

Bindung der Nachweise
  Jedes Paket hat einen eigenen Prüfbereich (scope.include in feature_list.json, sonst das
  ganze Projekt). Nachweis und Freigabe gelten für den Paketstand: SHA-256 über die Dateien im
  Paketbereich, den eigenen Featurelisten-Eintrag und die Definitionen der eigenen Pflichttests
  (siehe package_state). Der projektweite „geprüfte Zustand“ wird zusätzlich protokolliert:
  SHA-256 über alle Dateien im Prüfbereich
  (verification_scope in feature_list.json) plus die gebundenen Umgebungsangaben
  (environment_probes mit bind=exact oder major, z. B. Node-Hauptversion). Proben mit
  bind=none (z. B. Python-Version des Prüfskripts) werden nur protokolliert.
  Die Git-Revision wird zusätzlich festgehalten. Das Prüfprotokoll selbst (evidence/),
  project-progress.md und die veränderlichen Felder der Featureliste (passes, evidence)
  liegen außerhalb des Prüfbereichs, damit ihre Aktualisierung keine Nachweise entwertet.

Rückschrittschutz
  finish setzt beim ersten bestandenen Lauf was_accepted=true. Ein Paket, das einmal abgenommen
  war, wird danach nie still „offen“: Scheitert ein späterer finish-Lauf (Test rot oder Freigabe
  für den neuen Stand fehlt), steht passes=false, und start meldet den Rückschritt als Defekt,
  bis finish wieder besteht. Veraltete Nachweise nennt start mit dem Befehl zur Neuprüfung
  (Folgeprüfung in derselben Sitzung, siehe CLAUDE.md).

Grenzen
  Dieses Skript ist lokal und umgehbar (Dateien lassen sich von Hand ändern, Freigaben
  lassen sich mit beliebigem Namen eintragen). Es erzwingt nichts; siehe project-progress.md.
"""
from __future__ import annotations

import argparse
import datetime as dt
import fnmatch
import hashlib
import json
import os
import re
import shlex
import subprocess
import sys
import time
from pathlib import Path

SCHEMA_VERSION = 1
REQUIRED_FILES = ["feature_list.json", "project-progress.md"]
PACKAGE_FIELDS = {
    "id": str,
    "title": str,
    "description": str,
    "priority": str,
    "depends_on": list,
    "verification_steps": list,
    "acceptance_criteria": list,
    "required_tests": list,
    "approvals_required": list,
    "passes": bool,
    "evidence": list,
}
MUTABLE_PACKAGE_FIELDS = ("passes", "evidence", "was_accepted")
PRIORITIES = {"P0", "P1", "P2", "P3"}
EXIT_OK, EXIT_FAIL, EXIT_NEEDS_APPROVAL, EXIT_USAGE = 0, 1, 2, 3


class GateError(Exception):
    """Konfigurationsfehler (Rückgabecode 3)."""


# ───────────────────────── Hilfen ─────────────────────────


def now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def load_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise GateError(f"{path.name} fehlt")
    except json.JSONDecodeError as e:
        raise GateError(f"{path.name} ist kein gültiges JSON: {e}")


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    os.replace(tmp, path)


def git(root: Path, *args: str) -> str | None:
    try:
        out = subprocess.run(["git", *args], cwd=root, capture_output=True, text=True, timeout=30)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return out.stdout.strip() if out.returncode == 0 else None


# ───────────────────────── Featureliste ─────────────────────────


def validate_feature_list(fl: dict) -> list[str]:
    errors: list[str] = []
    if fl.get("schema_version") != SCHEMA_VERSION:
        errors.append(f"schema_version muss {SCHEMA_VERSION} sein")
    for key in ("verification_scope", "tests", "packages"):
        if key not in fl:
            errors.append(f"Pflichtfeld „{key}“ fehlt")
    if errors:
        return errors
    scope = fl["verification_scope"]
    if not isinstance(scope.get("include"), list) or not scope["include"]:
        errors.append("verification_scope.include muss eine nicht leere Liste sein")
    tests = fl["tests"]
    if not isinstance(tests, dict):
        errors.append("tests muss ein Objekt sein")
        tests = {}
    for name, t in tests.items():
        if not isinstance(t, dict) or "cmd" not in t:
            errors.append(f"Test „{name}“: Feld cmd fehlt (null für geplante Tests)")
    for name in fl.get("smoke_tests", []):
        if name not in tests:
            errors.append(f"smoke_tests nennt unbekannten Test „{name}“")
    for probe in fl.get("environment_probes", []):
        if not isinstance(probe, dict) or not isinstance(probe.get("cmd"), str):
            errors.append("environment_probes: jeder Eintrag braucht {\"cmd\": \"…\", \"bind\": \"exact|major|none\"}")
        elif probe.get("bind", "exact") not in ENV_BINDINGS:
            errors.append(f"environment_probes „{probe['cmd']}“: bind muss exact, major oder none sein")
    ids: set[str] = set()
    pkgs = fl["packages"]
    if not isinstance(pkgs, list) or not pkgs:
        return errors + ["packages muss eine nicht leere Liste sein"]
    for p in pkgs:
        pid = p.get("id", "<ohne id>")
        for field, typ in PACKAGE_FIELDS.items():
            if field not in p:
                errors.append(f"{pid}: Pflichtfeld „{field}“ fehlt")
            elif not isinstance(p[field], typ):
                errors.append(f"{pid}: Feld „{field}“ hat falschen Typ")
        if pid in ids:
            errors.append(f"{pid}: ID doppelt")
        ids.add(pid)
        if p.get("priority") not in PRIORITIES:
            errors.append(f"{pid}: priority muss P0–P3 sein")
        for t in p.get("required_tests", []) or []:
            if t not in tests:
                errors.append(f"{pid}: Pflichttest „{t}“ ist nicht in tests definiert")
        sc = p.get("scope")
        if sc is not None and (not isinstance(sc, dict) or not isinstance(sc.get("include"), list) or not sc["include"]
                               or not all(isinstance(x, str) for x in sc["include"])):
            errors.append(f"{pid}: scope muss {{\"include\": [Muster, …]}} mit mindestens einem Muster sein")
        if "was_accepted" in p and not isinstance(p["was_accepted"], bool):
            errors.append(f"{pid}: Feld „was_accepted“ hat falschen Typ")
        if isinstance(p.get("acceptance_criteria"), list) and not p["acceptance_criteria"]:
            errors.append(f"{pid}: keine Abnahmekriterien")
    for p in pkgs:
        for d in p.get("depends_on", []) or []:
            if d not in ids:
                errors.append(f"{p.get('id')}: Abhängigkeit „{d}“ existiert nicht")
    # Zyklen
    graph = {p.get("id"): list(p.get("depends_on", []) or []) for p in pkgs}
    state: dict[str, int] = {}

    def visit(n: str, path: list[str]) -> None:
        if state.get(n) == 2 or n not in graph:
            return
        if state.get(n) == 1:
            errors.append("Abhängigkeitszyklus: " + " → ".join(path + [n]))
            return
        state[n] = 1
        for m in graph[n]:
            visit(m, path + [n])
        state[n] = 2

    for n in graph:
        visit(n, [])
    return errors


def find_package(fl: dict, pid: str) -> dict:
    for p in fl["packages"]:
        if p["id"] == pid:
            return p
    raise GateError(f"Paket {pid} steht nicht in feature_list.json")


# ───────────────────────── Geprüfter Zustand ─────────────────────────


def _match(rel: str, patterns: list[str]) -> bool:
    return any(fnmatch.fnmatchcase(rel, pat) for pat in patterns)


def scope_files(root: Path, fl: dict) -> list[str]:
    scope = fl["verification_scope"]
    inc, exc = scope.get("include", []), scope.get("exclude", [])
    out: list[str] = []
    for dirpath, dirnames, filenames in os.walk(root):
        rel_dir = os.path.relpath(dirpath, root)
        rel_dir = "" if rel_dir == "." else rel_dir.replace(os.sep, "/")
        # ausgeschlossene Ordner gar nicht erst betreten
        dirnames[:] = [d for d in dirnames if not _match(f"{rel_dir}/{d}".lstrip("/") + "/", exc)]
        for fn in filenames:
            rel = f"{rel_dir}/{fn}".lstrip("/")
            if _match(rel, inc) and not _match(rel, exc):
                out.append(rel)
    return sorted(out)


def canonical_feature_list(fl: dict) -> bytes:
    """Featureliste ohne veränderliche Felder: Abnahmen ändern den Prüfstand nicht."""
    clone = json.loads(json.dumps(fl))
    for p in clone.get("packages", []):
        for f in MUTABLE_PACKAGE_FIELDS:
            p.pop(f, None)
    return json.dumps(clone, sort_keys=True, ensure_ascii=False).encode("utf-8")


ENV_BINDINGS = {"exact", "major", "none"}


def environment(fl: dict, root: Path) -> dict[str, str]:
    """Ausgabe jeder Umgebungsprobe (wird immer protokolliert)."""
    env: dict[str, str] = {}
    for probe in fl.get("environment_probes", []):
        cmd = probe["cmd"]
        try:
            r = subprocess.run(shlex.split(cmd), cwd=root, capture_output=True, text=True, timeout=30)
            env[cmd] = (r.stdout or r.stderr).strip() if r.returncode == 0 else f"exit {r.returncode}"
        except (OSError, subprocess.TimeoutExpired) as e:
            env[cmd] = f"nicht verfügbar ({e.__class__.__name__})"
    return env


def bound_environment(fl: dict, env: dict[str, str]) -> dict[str, str]:
    """Nur die Teile der Umgebung, an die Nachweise gebunden sind.

    bind="exact": ganze Ausgabe · bind="major": erste Zahl (z. B. Node 22) · bind="none": nur protokolliert.
    """
    out: dict[str, str] = {}
    for probe in fl.get("environment_probes", []):
        cmd, bind = probe["cmd"], probe.get("bind", "exact")
        value = env.get(cmd, "")
        if bind == "exact":
            out[cmd] = value
        elif bind == "major":
            m = re.search(r"(\d+)", value)
            out[cmd] = f"major {m.group(1)}" if m else value
    return out


def current_state(root: Path, fl: dict) -> dict:
    files: dict[str, str] = {}
    for rel in scope_files(root, fl):
        if rel == "feature_list.json":
            files[rel] = sha256_bytes(canonical_feature_list(fl))
        else:
            files[rel] = sha256_bytes((root / rel).read_bytes())
    env = environment(fl, root)
    bound = bound_environment(fl, env)
    digest = hashlib.sha256()
    for rel, h in sorted(files.items()):
        digest.update(f"{rel}\0{h}\n".encode())
    for k, v in sorted(bound.items()):
        digest.update(f"env:{k}\0{v}\n".encode())
    head = git(root, "rev-parse", "HEAD")
    dirty = git(root, "status", "--porcelain")
    return {
        "state_hash": digest.hexdigest(),
        "file_count": len(files),
        "files": files,
        "environment": env,
        "environment_bound": bound,
        "git_head": head,
        "git_dirty": bool(dirty) if dirty is not None else None,
    }


# ───────────────────────── Übergabe ─────────────────────────


def handover_problems(root: Path, pid: str | None) -> list[str]:
    path = root / "project-progress.md"
    if not path.exists():
        return ["project-progress.md fehlt"]
    text = path.read_text(encoding="utf-8")
    m = re.search(r"^## Übergabe[^\n]*\n(.*?)(?=^## |\Z)", text, re.S | re.M)
    if not m:
        return ["project-progress.md: Abschnitt „## Übergabe“ fehlt"]
    section = m.group(1)
    problems = []
    # Der Text muss in derselben Zeile hinter dem Doppelpunkt stehen.
    if not re.search(r"^[ \t]*-?[ \t]*\**Nächster Schritt\**:\**[ \t]*\S", section, re.M):
        problems.append("Übergabe: Zeile „Nächster Schritt:“ fehlt oder ist leer")
    if pid and pid not in section:
        problems.append(f"Übergabe nennt das Paket {pid} nicht")
    return problems


# ───────────────────────── Nachweise ─────────────────────────


def evidence_path(root: Path, pid: str) -> Path:
    return root / "evidence" / f"{pid}.json"


def approvals_path(root: Path) -> Path:
    return root / "evidence" / "approvals.json"


def load_approvals(root: Path) -> list[dict]:
    p = approvals_path(root)
    if not p.exists():
        return []
    data = load_json(p)
    return data.get("approvals", []) if isinstance(data, dict) else []


def package_state(fl: dict, pkg: dict, state: dict) -> dict:
    """Prüfstand eines einzelnen Pakets.

    Hash über: Dateien im Paketbereich (pkg.scope.include, sonst alle Dateien des globalen
    Prüfbereichs außer feature_list.json), den eigenen Eintrag in der Featureliste ohne
    passes/evidence, die Definitionen der eigenen Pflichttests, die Prüfbereichs- und
    Umgebungs-Konfiguration sowie die gebundenen Umgebungsangaben.
    Änderungen an anderen Paketen oder an Dateien außerhalb des Paketbereichs ändern ihn nicht.
    """
    patterns = (pkg.get("scope") or {}).get("include") or ["*"]
    files = {rel: h for rel, h in state["files"].items()
             if rel != "feature_list.json" and _match(rel, patterns)}
    own = {k: v for k, v in pkg.items() if k not in MUTABLE_PACKAGE_FIELDS}
    config = {
        "package": own,
        "tests": {t: fl["tests"].get(t) for t in pkg["required_tests"]},
        "verification_scope": fl["verification_scope"],
        "environment_probes": fl.get("environment_probes", []),
        "environment_bound": state["environment_bound"],
    }
    digest = hashlib.sha256()
    for rel, h in sorted(files.items()):
        digest.update(f"{rel}\0{h}\n".encode())
    digest.update(json.dumps(config, sort_keys=True, ensure_ascii=False).encode("utf-8"))
    return {"package_hash": digest.hexdigest(), "file_count": len(files), "scope": patterns}


def valid_approvals(root: Path, pkg: dict, package_hash: str) -> tuple[list[str], list[str]]:
    """(erteilte Rollen, fehlende Rollen) für den aktuellen Paketstand."""
    have = {
        a["role"]
        for a in load_approvals(root)
        if a.get("package") == pkg["id"] and a.get("package_hash") == package_hash and a.get("by")
    }
    need = list(pkg.get("approvals_required", []))
    return sorted(have & set(need)), [r for r in need if r not in have]


def evidence_problems(root: Path, pkg: dict, state: dict, fl: dict) -> list[str]:
    """Warum ein Paket mit passes=true nicht (mehr) als abgenommen gelten darf."""
    p = evidence_path(root, pkg["id"])
    if not p.exists():
        return [f"{pkg['id']}: kein Nachweis in {p.relative_to(root)}"]
    ev = load_json(p)
    probs = []
    current = package_state(fl, pkg, state)
    if ev.get("result") != "pass":
        probs.append(f"{pkg['id']}: letzter Nachweis ist nicht bestanden")
    if ev.get("package_state", {}).get("package_hash") != current["package_hash"]:
        probs.append(f"{pkg['id']}: Nachweis veraltet (Paketbereich hat sich seither geändert)")
    ran = {c["name"]: c for c in ev.get("commands", [])}
    for t in pkg["required_tests"]:
        if t not in ran:
            probs.append(f"{pkg['id']}: Pflichttest „{t}“ fehlt im Nachweis")
        elif ran[t].get("returncode") != 0:
            probs.append(f"{pkg['id']}: Pflichttest „{t}“ im Nachweis fehlgeschlagen")
    _, missing = valid_approvals(root, pkg, current["package_hash"])
    if missing:
        probs.append(f"{pkg['id']}: Freigabe fehlt für Rolle(n) {', '.join(missing)}")
    return probs


def run_test(root: Path, name: str, spec: dict) -> dict:
    cmd = spec.get("cmd")
    started = now_iso()
    if not cmd:
        return {"name": name, "cmd": None, "returncode": None, "started": started, "duration_s": 0,
                "output_tail": "geplant, noch nicht eingerichtet"}
    t0 = time.monotonic()
    try:
        r = subprocess.run(shlex.split(cmd), cwd=root, capture_output=True, text=True,
                           timeout=spec.get("timeout", 900))
        rc, out = r.returncode, (r.stdout + r.stderr)
    except subprocess.TimeoutExpired:
        rc, out = 124, "Zeitüberschreitung"
    except OSError as e:
        rc, out = 127, f"nicht ausführbar: {e}"
    return {
        "name": name,
        "cmd": cmd,
        "returncode": rc,
        "started": started,
        "duration_s": round(time.monotonic() - t0, 2),
        "output_tail": out[-1500:],
    }


# ───────────────────────── Befehle ─────────────────────────


def cmd_start(root: Path, args) -> int:
    print(f"Startprüfung in {root}")
    problems: list[str] = []
    for f in REQUIRED_FILES:
        if not (root / f).exists():
            problems.append(f"Pflichtdatei {f} fehlt")
    if problems:
        return report(problems)
    fl = load_json(root / "feature_list.json")
    problems += validate_feature_list(fl)
    if problems:
        return report(problems)
    problems += handover_problems(root, None)
    state = current_state(root, fl)
    print(f"  Prüfstand {state['state_hash'][:12]} · {state['file_count']} Dateien · Git {str(state['git_head'])[:8]}"
          f"{' (lokale Änderungen)' if state['git_dirty'] else ''}")
    recheck: list[str] = []
    for pkg in fl["packages"]:
        if not pkg["passes"] and pkg.get("was_accepted"):
            probs = evidence_problems(root, pkg, state, fl) if evidence_path(root, pkg["id"]).exists() else ["kein Nachweis"]
            problems.append(f"Defekt: {pkg['id']}: war abgenommen, ist es nicht mehr (Rückschritt) – "
                            + "; ".join(x.split(": ", 1)[-1] for x in probs or ["passes=false"]))
            recheck.append(pkg["id"])
        elif pkg["passes"]:
            probs = evidence_problems(root, pkg, state, fl)
            problems += [f"Defekt: {p}" for p in probs]
            if probs:
                recheck.append(pkg["id"])
            else:
                # Nur protokollierte Umgebungsteile (bind=none) weichen ab: Hinweis, kein Defekt.
                old_env = load_json(evidence_path(root, pkg["id"])).get("state", {}).get("environment", {})
                changed = [k for k, v in state["environment"].items() if k in old_env and old_env[k] != v]
                if changed:
                    print(f"  Hinweis {pkg['id']}: Nachweis stammt aus anderer Umgebung ("
                          + "; ".join(f"{k}: {old_env[k]} → {state['environment'][k]}" for k in changed)
                          + "). Gilt weiter; finish belegt die Tests auch hier.")
    if not args.no_smoke:
        for name in fl.get("smoke_tests", []):
            res = run_test(root, name, fl["tests"][name])
            ok = res["returncode"] == 0
            print(f"  Smoke-Test {name}: {'ok' if ok else 'FEHLER'} (Rückgabecode {res['returncode']})")
            if not ok:
                problems.append(f"Ausgangsfunktion: Smoke-Test „{name}“ fehlgeschlagen")
    if problems:
        print("  Hinweis: Erst diese Defekte reparieren; darauf aufbauende Pakete nicht abnehmen.")
    for pid in recheck:
        print(f"  Neu prüfen: python3 scripts/project_gate.py finish --package {pid}")
    return report(problems)


def cmd_finish(root: Path, args) -> int:
    fl = load_json(root / "feature_list.json")
    errs = validate_feature_list(fl)
    if errs:
        return report(errs)
    pkg = find_package(fl, args.package)
    print(f"Abschlussprüfung {pkg['id']}: {pkg['title']}")
    problems: list[str] = []
    state = current_state(root, fl)
    for d in pkg["depends_on"]:
        dep = find_package(fl, d)
        if not dep["passes"] or evidence_problems(root, dep, state, fl):
            problems.append(f"Abhängigkeit {d} ist nicht (mehr) gültig abgenommen")
    commands = []
    for name in pkg["required_tests"]:
        res = run_test(root, name, fl["tests"][name])
        commands.append(res)
        label = "geplant" if res["returncode"] is None else ("ok" if res["returncode"] == 0 else "FEHLER")
        print(f"  Test {name}: {label} (Rückgabecode {res['returncode']}, {res['duration_s']} s)")
        if res["returncode"] != 0:
            problems.append(f"Pflichttest „{name}“ nicht bestanden" if res["cmd"] else f"Pflichttest „{name}“ ist noch nicht eingerichtet")
    problems += handover_problems(root, pkg["id"])
    # Zustand nach den Tests erneut bestimmen: Tests dürfen den Prüfbereich nicht verändern.
    after = current_state(root, fl)
    if after["state_hash"] != state["state_hash"]:
        problems.append("Prüfbereich hat sich während der Tests verändert")
    technical_ok = not problems
    pstate = package_state(fl, pkg, state)
    granted, missing = valid_approvals(root, pkg, pstate["package_hash"])
    evidence = {
        "package_id": pkg["id"],
        "created": now_iso(),
        "result": "pass" if technical_ok else "fail",
        "package_state": pstate,
        "state": {k: state[k] for k in ("state_hash", "file_count", "environment", "environment_bound", "git_head", "git_dirty")},
        "scope": fl["verification_scope"],
        "files": state["files"],
        "commands": commands,
        "problems": problems,
        "approvals_required": pkg["approvals_required"],
        "approvals_valid": granted,
    }
    rel = evidence_path(root, pkg["id"])
    write_json(rel, evidence)
    ref = f"{rel.relative_to(root)}#{pstate['package_hash'][:12]}"
    # Ältere Featurelisten kennen was_accepted noch nicht: passes=true gilt ebenfalls als abgenommen.
    if (pkg.get("was_accepted") or pkg["passes"]) and (not technical_ok or missing):
        print(f"  Rückschritt: {pkg['id']} war abgenommen. passes=false, start meldet einen Defekt, bis finish wieder besteht.")
    if not technical_ok:
        set_package(root, fl, pkg["id"], passes=False, evidence_ref=ref)
        return report(problems)
    if missing:
        set_package(root, fl, pkg["id"], passes=False, evidence_ref=ref)
        print(f"  Technisch bestanden. Freigabe fehlt für Rolle(n): {', '.join(missing)}")
        print(f"  Nachweis: {ref}. passes bleibt false.")
        return EXIT_NEEDS_APPROVAL
    set_package(root, fl, pkg["id"], passes=True, evidence_ref=ref)
    print(f"  Abgenommen. Nachweis: {ref}")
    return EXIT_OK


def cmd_approve(root: Path, args) -> int:
    fl = load_json(root / "feature_list.json")
    pkg = find_package(fl, args.package)
    if args.role not in pkg["approvals_required"]:
        raise GateError(f"Rolle „{args.role}“ ist für {pkg['id']} nicht vorgesehen ({pkg['approvals_required']})")
    ev_path = evidence_path(root, pkg["id"])
    state = current_state(root, fl)
    pstate = package_state(fl, pkg, state)
    if not ev_path.exists() or load_json(ev_path).get("package_state", {}).get("package_hash") != pstate["package_hash"]:
        print("Freigabe abgelehnt: Für den aktuellen Stand gibt es keinen Nachweis. Erst finish ausführen.")
        return EXIT_FAIL
    data = {"approvals": load_approvals(root)}
    data["approvals"].append({
        "package": pkg["id"], "role": args.role, "by": args.by, "note": args.note or "",
        "date": now_iso(), "package_hash": pstate["package_hash"],
    })
    write_json(approvals_path(root), data)
    print(f"Freigabe für {pkg['id']} ({args.role}) durch {args.by} festgehalten. Jetzt finish erneut ausführen.")
    return EXIT_OK


def cmd_status(root: Path, args) -> int:
    fl = load_json(root / "feature_list.json")
    state = current_state(root, fl)
    print(f"Prüfstand {state['state_hash'][:12]} · Git {str(state['git_head'])[:8]}")
    for p in fl["packages"]:
        probs = evidence_problems(root, p, state, fl) if evidence_path(root, p["id"]).exists() else ["kein Nachweis"]
        regressed = not p["passes"] and p.get("was_accepted")
        mark = "✔" if p["passes"] and not probs else ("!" if p["passes"] or regressed else "·")
        info = "aktuell" if not probs else probs[0].split(": ", 1)[-1]
        if regressed:
            info = "Rückschritt: " + (info if probs else "passes=false")
        print(f"  {mark} {p['id']:6} {p['priority']} {p['title'][:46]:46} {info}")
    return EXIT_OK


def set_package(root: Path, fl: dict, pid: str, passes: bool, evidence_ref: str) -> None:
    for p in fl["packages"]:
        if p["id"] == pid:
            if passes or p.get("passes"):
                p["was_accepted"] = True
            p["passes"] = passes
            refs = [r for r in p.get("evidence", []) if not r.startswith(evidence_ref.split("#")[0])]
            p["evidence"] = refs + [evidence_ref]
    write_json(root / "feature_list.json", fl)


def report(problems: list[str]) -> int:
    if not problems:
        print("  Ergebnis: in Ordnung")
        return EXIT_OK
    print("  Ergebnis: NICHT in Ordnung")
    for p in problems:
        print(f"   - {p}")
    return EXIT_FAIL


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Habla Start- und Abschlussprüfung")
    ap.add_argument("--root", default=str(Path(__file__).resolve().parent.parent))
    sub = ap.add_subparsers(dest="command", required=True)
    s = sub.add_parser("start")
    s.add_argument("--no-smoke", action="store_true", help="Smoke-Tests überspringen")
    f = sub.add_parser("finish")
    f.add_argument("--package", required=True)
    a = sub.add_parser("approve")
    a.add_argument("--package", required=True)
    a.add_argument("--by", required=True)
    a.add_argument("--role", required=True)
    a.add_argument("--note")
    sub.add_parser("status")
    args = ap.parse_args(argv)
    root = Path(args.root).resolve()
    try:
        return {"start": cmd_start, "finish": cmd_finish, "approve": cmd_approve, "status": cmd_status}[args.command](root, args)
    except GateError as e:
        print(f"Konfigurationsfehler: {e}")
        return EXIT_USAGE


if __name__ == "__main__":
    sys.exit(main())
