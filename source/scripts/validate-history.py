#!/usr/bin/env python3
"""Validate history references, evidence boundaries and optional rendered parity."""
import argparse
import json
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import date
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def normalized(value):
    return "".join(c for c in unicodedata.normalize("NFD", value).casefold()
                   if unicodedata.category(c) != "Mn")


def require(condition, message):
    if not condition:
        raise ValueError(message)


class ListText(HTMLParser):
    """Read only the two compact supervision lists, independent of HTML spacing."""
    def __init__(self):
        super().__init__()
        self.depth = 0
        self.current = []
        self.groups = []
        self.links = 0

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "div":
            if self.depth:
                self.depth += 1
            elif "compact-list" in attrs.get("class", "").split():
                self.depth = 1
                self.current = []
        if self.depth and tag in ("br", "p"):
            self.current.append(" ")
        if self.depth and tag == "a":
            self.links += 1

    def handle_endtag(self, tag):
        if self.depth and tag == "div":
            self.depth -= 1
            if not self.depth:
                self.groups.append(" ".join("".join(self.current).split()))
        if self.depth and tag == "p":
            self.current.append(" ")

    def handle_data(self, data):
        if self.depth:
            self.current.append(data)


def read_lists(path):
    parser = ListText()
    parser.feed(path.read_text(encoding="utf-8-sig"))
    require(len(parser.groups) == 2, f"Expected two lists: {path}")
    return parser


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, default=ROOT / "data/history.json")
    parser.add_argument("--expected-degrees", type=int)
    parser.add_argument("--expected-postdocs", type=int)
    parser.add_argument("--rendered-root", type=Path)
    parser.add_argument("--before-root", type=Path, help="Folder containing membros.pt.before.html and membros.en.before.html")
    args = parser.parse_args()
    data = json.loads(args.data.read_text(encoding="utf-8"))
    updated = date.fromisoformat(data["updated"])
    people = {p["id"]: p for p in data["people"]}
    require(len(people) == len(data["people"]), "Duplicate person ID")
    names = {}
    for p in data["people"]:
        require(p["name"].strip() and re.fullmatch(r"[a-z0-9-]+", p["id"]), f"Invalid person {p}")
        for name in [p["name"], *p["aliases"]]:
            key = normalized(name)
            require(key not in names or names[key] == p["id"], f"Name belongs to two people: {name}")
            names[key] = p["id"]
    faculty = json.loads((ROOT / "data/faculty.json").read_text(encoding="utf-8"))
    require({p["facultyId"] for p in people.values() if p["facultyId"]} == {f["id"] for f in faculty}, "Faculty IDs mismatch")
    for f in faculty:
        require(people[f["id"]]["facultyId"] == f["id"], f"Unstable faculty identity: {f['id']}")
    all_ids, degree_keys, stay_keys = set(), set(), set()
    edges = defaultdict(set)
    unconfirmed = 0
    for kind in ("degrees", "postdocs"):
        for row in data[kind]:
            ident = row["id"]
            require(ident not in all_ids, f"Duplicate record ID: {ident}")
            all_ids.add(ident)
            require(row["personId"] in people, f"Missing person: {ident}")
            require(row["institution"].strip(), f"Missing institution: {ident}")
            for field in ("displayPeriod", "notes"):
                require(all(isinstance(row[field][lang], str) for lang in ("pt", "en")), f"Missing bilingual {field}: {ident}")
            require(row["advisors"], f"No advisor: {ident}")
            seen_advisors = set()
            for advisor in row["advisors"]:
                require(advisor["personId"] in people, f"Missing advisor: {ident}")
                require(advisor["personId"] != row["personId"], f"Self-supervision: {ident}")
                require(advisor["personId"] not in seen_advisors, f"Duplicate advisor: {ident}")
                seen_advisors.add(advisor["personId"])
                require(advisor["role"] in ("advisor", "coadvisor", "joint", "institutional"), f"Unknown role: {ident}")
                if kind == "degrees" and row["level"] == "phd":
                    edges[advisor["personId"]].add(row["personId"])
            if row.get("displayRoles"):
                for lang in ("pt", "en"):
                    displayed = set()
                    for line in row["displayRoles"][lang].splitlines():
                        require(": " in line, f"Invalid display role: {ident}")
                        label, rendered_names = line.split(": ", 1)
                        role = "institutional" if label in ("Orientador institucional", "Institutional supervisor") else (
                            "joint" if label in ("Orientadores", "Advisors") else (
                            "coadvisor" if label.startswith(("Coorient", "Co-advisor")) else "advisor"))
                        for rendered_name in rendered_names.split(" / "):
                            key = normalized(rendered_name)
                            require(key in names, f"Unknown display advisor: {rendered_name}")
                            displayed.add((names[key], role))
                    structured = {(a["personId"], a["role"]) for a in row["advisors"] if not a.get("displayInNotes")}
                    require(displayed == structured, f"Display role differs from structured relationships: {ident} ({lang})")
            require(row["sources"], f"No provenance: {ident}")
            for source in row["sources"]:
                require(source["label"] and source["kind"], f"Incomplete source: {ident}")
                date.fromisoformat(source["checked"])
            for field in ("startYear", "endYear", "reportedYear", "year"):
                value = row.get(field)
                require(value is None or (isinstance(value, int) and 1800 <= value <= updated.year), f"Invalid {field}: {ident}")
            verification = row.get("verification", {})
            if verification.get("startYearStatus") == "preserved_legacy_not_independently_verified":
                require(row.get("startYear") is None, f"Legacy period used as confirmed start: {ident}")
                unconfirmed += 1
            if verification.get("startYearStatus") in ("supported_by_admission_cohort_not_enrollment_certificate", "supported_by_prior_institutional_supervision_record_2017"):
                require(row.get("startYear") is None, f"Admission/presence inferred as enrollment: {ident}")
            if kind == "degrees":
                require(row["level"] in ("masters", "professional-masters", "phd"), f"Unknown degree: {ident}")
                require(isinstance(row["year"], int), f"Missing completion: {ident}")
                require(row.get("startYear") is None or row["startYear"] <= row["year"], f"Reversed degree interval: {ident}")
                key = (row["personId"], row["level"], row["institution"], row["year"])
                require(key not in degree_keys, f"Duplicate degree: {ident}")
                degree_keys.add(key)
            else:
                require(row["status"] in ("current", "completed"), f"Unknown postdoc status: {ident}")
                require(isinstance(row["reportedYear"], int), f"Missing reported year: {ident}")
                if row["status"] == "current":
                    require(row["endYear"] is None, f"Current postdoc has end year: {ident}")
                require(row["startYear"] is None or row["endYear"] is None or row["startYear"] <= row["endYear"], f"Reversed postdoc interval: {ident}")
                key = (row["personId"], row["institution"], row["displayPeriod"]["pt"])
                require(key not in stay_keys, f"Duplicate postdoc stay: {ident}")
                stay_keys.add(key)
                for association in row.get("associations", []):
                    require(association["personId"] in people, f"Missing associated person: {ident}")
                    require(association["personId"] not in seen_advisors, f"Non-supervisory listing also used as advisor: {ident}")
    # Directed cycles are invalid for the recorded doctoral-supervision graph.
    visiting, visited = set(), set()
    def visit(person):
        require(person not in visiting, f"Doctoral cycle involving {person}")
        if person in visited:
            return
        visiting.add(person)
        for child in edges[person]:
            visit(child)
        visiting.remove(person)
        visited.add(person)
    for person in list(people):
        visit(person)
    counts = dict(Counter(r["level"] for r in data["degrees"]))
    require(counts == data["coverage"]["degreeCounts"], "Coverage degree subtotals mismatch")
    require(len(data["degrees"]) == data["coverage"]["degreeCount"], "Coverage degree count mismatch")
    require(len(data["postdocs"]) == data["coverage"]["postdocCount"], "Coverage stay count mismatch")
    require(unconfirmed == data["coverage"]["unconfirmedLegacyStarts"], "Legacy start count mismatch")
    for kind, expected in (("degrees", args.expected_degrees), ("postdocs", args.expected_postdocs)):
        require(expected is None or len(data[kind]) == expected, f"Expected {expected} {kind}, found {len(data[kind])}")
    if args.rendered_root:
        for lang, route in (("pt", "membros/index.html"), ("en", "en/membros/index.html")):
            actual = read_lists(args.rendered_root / route)
            require(actual.links == 0, f"Links appeared in supervision list: {lang}")
            if args.before_root:
                before = read_lists(args.before_root / f"membros.{lang}.before.html")
                for index, (old, new) in enumerate(zip(before.groups, actual.groups)):
                    if old != new:
                        at = next((i for i, (a, b) in enumerate(zip(old, new)) if a != b), min(len(old), len(new)))
                        raise ValueError(f"Rendered {lang} list {index} differs at {at}: BEFORE {old[max(0, at-60):at+120]!r}; AFTER {new[max(0, at-60):at+120]!r}")
    print(json.dumps({"status": "ok", "people": len(people), "degrees": len(data["degrees"]),
                      "degreeCounts": counts, "postdocs": len(data["postdocs"]),
                      "postdocStatusCounts": dict(Counter(r["status"] for r in data["postdocs"])),
                      "unconfirmedLegacyStarts": unconfirmed, "doctoralGraph": "acyclic",
                      "renderedParity": bool(args.rendered_root and args.before_root)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
