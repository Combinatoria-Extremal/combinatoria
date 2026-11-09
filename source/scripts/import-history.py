#!/usr/bin/env python3
"""One-time, non-network migration of the audited Members lists into history.json.

This does not run the old audit script. Existing history.json is the maintained
source after migration; rerun only against explicitly selected legacy snapshots.
"""
import argparse
import json
import re
import unicodedata
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
UPDATED = "2026-11-08"
LEVELS = {"Doutorado": "phd", "Mestrado": "masters", "Mestrado profissional": "professional-masters"}
EN_LEVELS = {"PhD": "Doutorado", "MSc": "Mestrado", "Professional MSc": "Mestrado profissional"}
ALIASES = {
    "guilherme-mota": ["Guilherme Oliveira Mota"],
    "roberto-parente": ["Roberto Freitas Parente"],
    "walner-mendonca": ["Walner Mendonça dos Santos"],
    "lucas-colucci": ["Lucas Colucci Cavalcante de Souza"],
    "vinicius-dos-santos": ["Vinicius Fernandes dos Santos", "Vinícius Fernandes dos Santos"],
    "fabricio-benevides": ["Fabricio Siqueira Benevides", "Fabrício Siqueira Benevides"],
    "cristiane-maria-sato": ["Cristiane M. Sato"],
    "rob-morris": ["Robert Morris"],
    "mauricio-collares": ["Mauricio Collares"],
}
START_CONFIRMED = {
    "supported_by_supervisor_list", "supported_by_institutional_postdoc_period",
    "supported_by_primary_period_statement", "supported_by_prior_primary_start_or_period_statement",
}


def norm(value):
    return "".join(c for c in unicodedata.normalize("NFD", value).casefold()
                   if unicodedata.category(c) != "Mn")


def slug(value):
    return re.sub(r"[^a-z0-9]+", "-", norm(value)).strip("-")


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def parse(text, lang):
    headings = ("### Pós-doutorandos", "### Estudantes formados") if lang == "pt" else (
        "### Postdoctoral researchers", "### Graduated students")
    _, body = text.split(headings[0], 1)
    postdocs, degrees = body.split(headings[1], 1)
    pattern = re.compile(r"^(\d+)\\\. \*\*([^*]+)\*\* - (.*?) \(([^()]*)\)\\\n([^\n]+(?:\n[^\n]+)*)", re.M)
    groups = {}
    for kind, section in (("postdocs", postdocs), ("degrees", degrees)):
        rows = []
        for m in pattern.finditer(section):
            number, period, name, institution, lines = m.groups()
            degree = None
            if kind == "degrees":
                name, degree = name.rsplit(" - (", 1)
                degree = EN_LEVELS.get(degree[:-1], degree[:-1])
            linked = re.fullmatch(r"\[([^]]+)\]\((.+)\)", name)
            if linked:
                name = linked.group(1)
            roles, notes = [], []
            for line in lines.replace("\\\n", "\n").splitlines():
                if ": " in line:
                    roles.append(line)
                else:
                    notes.append(line)
            rows.append({"number": int(number), "period": period, "name": name,
                         "institution": institution, "degree": degree,
                         "roles": roles, "notes": notes, "raw": m.group(0)})
        groups[kind] = rows
    return groups


def evidence_key(record, kind=None):
    category = kind or ("degrees" if record["category"] == "graduates" else "postdocs")
    return (category, norm(record["name"]), record.get("degree"), record["institution"],
            record["period"].replace("present", "atual"))


def portable(value):
    """Retain the audit ledger without publishing machine-specific absolute paths."""
    if isinstance(value, dict):
        return {k: portable(v) for k, v in value.items()}
    if isinstance(value, list):
        return [portable(v) for v in value]
    if isinstance(value, str):
        path = value.replace("\\\\", "/").replace("\\", "/")
        marker = "/EBC 2027/"
        if marker in path:
            return path.split(marker, 1)[1]
    return value


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pt-source", type=Path, required=True)
    parser.add_argument("--en-source", type=Path, required=True)
    parser.add_argument("--audit", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=ROOT / "data/history.json")
    parser.add_argument("--migrate", action="store_true", help="Replace only the two Members list bodies with shortcodes")
    parser.add_argument("--force", action="store_true", help="Explicitly replace an existing JSON dataset")
    args = parser.parse_args()
    if args.output.exists() and not args.force:
        parser.error("history.json already exists: maintain it directly, or use --force for an intentional re-import")
    sources = {"pt": args.pt_source.read_text(encoding="utf-8-sig"), "en": args.en_source.read_text(encoding="utf-8-sig")}
    lists = {lang: parse(text, lang) for lang, text in sources.items()}
    audit = read_json(args.audit)
    ledger = {evidence_key(r): r for r in audit["records"]}
    assert len(ledger) == len(audit["records"]) == 178
    faculty = read_json(ROOT / "data/faculty.json")
    people, by_name = {}, {}
    for member in faculty:
        person = {"id": member["id"], "name": member["name"], "aliases": ALIASES.get(member["id"], []).copy(),
                  "facultyId": member["id"], "url": member["url"],
                  "phdYear": member.get("phdYear"), "phdSources": member.get("phdSources", [])}
        people[person["id"]] = person
        for name in [person["name"], *person["aliases"]]:
            by_name[norm(name)] = person["id"]

    def person_id(name):
        key = norm(name)
        if key not in by_name:
            ident = slug(name)
            assert ident not in people, (ident, name)
            people[ident] = {"id": ident, "name": name, "aliases": [], "facultyId": None, "url": None}
            by_name[key] = ident
        ident = by_name[key]
        person = people[ident]
        if name != person["name"] and name not in person["aliases"]:
            person["aliases"].append(name)
        return ident

    result = {"updated": UPDATED, "people": [], "degrees": [], "postdocs": []}
    for kind in ("degrees", "postdocs"):
        assert len(lists["pt"][kind]) == len(lists["en"][kind])
        for pt, en in zip(lists["pt"][kind], lists["en"][kind]):
            assert evidence_key(pt, kind) == evidence_key(en, kind)
            assert pt["number"] == en["number"]
            evidence = ledger[evidence_key(pt, kind)]
            person = person_id(pt["name"])
            years = [int(v) for v in re.findall(r"\b\d{4}\b", pt["period"])]
            assert years, pt
            record = {"id": "", "personId": person, "institution": pt["institution"],
                      "displayPeriod": {"pt": pt["period"], "en": en["period"]},
                      "advisors": [], "sources": [],
                      "notes": {"pt": "\n".join(pt["notes"]), "en": "\n".join(en["notes"])}}
            record["displayName"] = pt["name"]
            record["displayRoles"] = {"pt": "\n".join(pt["roles"]), "en": "\n".join(en["roles"])}
            for line_pt, line_en in zip(pt["roles"], en["roles"]):
                label_pt, names = line_pt.split(": ", 1)
                label_en = line_en.split(": ", 1)[0]
                role = "institutional" if label_en == "Institutional supervisor" else (
                    "joint" if label_en == "Advisors" else ("coadvisor" if label_en == "Co-advisor" else "advisor"))
                for name in names.split(" / "):
                    record["advisors"].append({"personId": person_id(name), "role": role,
                                               "label": {"pt": label_pt, "en": label_en}})
            if evidence.get("note") in ("joint_laber", "joint_wakabayashi"):
                other = "Eduardo Sany Laber" if evidence["note"] == "joint_laber" else "Yoshiko Wakabayashi"
                record["advisors"].append({"personId": person_id(other), "role": "joint",
                    "label": {"pt": "Orientação conjunta relatada (papel formal não confirmado)",
                              "en": "Joint supervision reported (formal role unconfirmed)"},
                    "formalRoleConfirmed": False, "displayInNotes": True})
            if evidence.get("note") == "rob_postdoc_listing":
                record["associations"] = [{"personId": "rob-morris", "kind": "listed_by_researcher",
                    "label": {"pt": "Listado entre seus pós-doutorandos", "en": "Listed among his postdoctoral researchers"}}]
            status = evidence["start_year_status"]
            start = years[0] if len(years) > 1 or "atual" in pt["period"] else None
            if status not in START_CONFIRMED:
                start = None
            if kind == "degrees":
                record["level"] = LEVELS[pt["degree"]]
                record["year"] = years[-1]
                record["startYear"] = start
                record["id"] = f'degree-{person}-{record["level"]}-{record["year"]}'
            else:
                current = "atual" in pt["period"]
                record["status"] = "current" if current else "completed"
                record["reportedYear"] = years[-1]
                record["startYear"] = start
                record["endYear"] = None if current or "end_year" not in evidence["confirmed_fields"] else years[-1]
                record["id"] = f'postdoc-{person}-{slug(pt["institution"])}-{slug(pt["period"])}'
            record["sources"].append({"label": "Catálogo local de Membros: transcrição, não verificação independente",
                "kind": "internal_catalogue", "checked": UPDATED, "url": "/membros/"})
            for source in evidence.get("sources", []):
                kind_source = source.get("type", "primary_evidence_from_prior_audit")
                checked = source.get("accessed") or source.get("received") or (
                    "2026-11-06" if "2026_11_06" in evidence["external_status"] or "cached" in kind_source else audit["review_date"])
                item = {"label": source.get("evidence") or "Registro de evidência preservado da auditoria de orientações",
                        "kind": kind_source, "checked": checked}
                if source.get("url"):
                    item["url"] = source["url"]
                for key in ("local_evidence", "verified_fields", "access"):
                    if key in source:
                        item[key] = portable(source[key])
                record["sources"].append(item)
            record["verification"] = {
                "auditRecordId": evidence["record_id"],
                "externalStatus": evidence["external_status"],
                "confirmedFields": evidence["confirmed_fields"],
                "startYearStatus": status,
                "auditDate": audit["review_date"],
            }
            for source_key, target_key in (("source_distinction", "sourceDistinction"),
                                            ("start_year_followup", "startYearFollowup")):
                if source_key in evidence:
                    record["verification"][target_key] = portable(evidence[source_key])
            result[kind].append(record)
    result["people"] = list(people.values())
    result["coverage"] = {
        "scope": {"pt": "Orientações concluídas e estágios de pós-doutorado catalogados; cobertura parcial das trajetórias acadêmicas.",
                  "en": "Catalogued completed degrees and postdoctoral stays; partial coverage of academic histories."},
        "degreeCounts": dict(Counter(r["level"] for r in result["degrees"])),
        "degreeCount": len(result["degrees"]), "postdocCount": len(result["postdocs"]),
        "unconfirmedLegacyStarts": sum(r["verification"]["startYearStatus"] == "preserved_legacy_not_independently_verified" for r in result["degrees"]),
        "sourceAudit": "final_audit_20261107/supervisions_audit.json",
        "auditDate": audit["review_date"],
        "limitations": {
            "pt": ["Não é uma lista completa de ancestrais acadêmicos dos docentes; ausência de aresta não indica ausência de orientação.",
                   "64 períodos legados conservam um início não confirmado apenas no texto; startYear fica nulo. Admissão e presença datada não foram convertidas em ingresso.",
                   "Estágios de pós-doutorado não são titulações. Um ano isolado não define sua duração.",
                   "Alguns campos combinam fontes primárias com confirmação fornecida pelo responsável pelo catálogo; consulte verification e sources.",
                   "As listas de Membros preservam as grafias e os períodos existentes. Os identificadores unificam as variantes dos mesmos docentes.",
                   "Afiliações atuais não permitem inferir vínculos passados, ingressos ou saídas da comunidade."],
            "en": ["This is not a complete list of faculty academic ancestors; a missing edge does not imply no supervision.",
                   "64 legacy periods preserve an unconfirmed start only as display text; startYear is null. Admission cohorts and dated presence were not converted into enrolment dates.",
                   "Postdoctoral stays are not degrees. An isolated reported year does not establish duration.",
                   "Some fields combine primary evidence with confirmation supplied by the catalogue maintainer; consult verification and sources.",
                   "Members lists retain existing spellings and display periods. Person identifiers merge variants of the same faculty member.",
                   "Current affiliations cannot establish past employment, community entry or departure dates."]},
        "auditLimitations": audit["limitations"],
        "auditResolvedSourceDistinctions": portable(audit.get("resolved_source_distinctions", [])),
    }
    assert result["coverage"]["degreeCounts"] == {"masters": 102, "phd": 33, "professional-masters": 5}
    assert result["coverage"]["postdocCount"] == 38
    assert result["coverage"]["unconfirmedLegacyStarts"] == 64
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if args.migrate:
        for lang, name in (("pt", "membros.md"), ("en", "membros.en.md")):
            target = ROOT / "content" / name
            current = target.read_text(encoding="utf-8-sig")
            groups = iter(("postdocs", "degrees"))
            def replace_list(match):
                return '{{< supervision-list kind="' + next(groups) + '" >}}'
            migrated, count = re.subn(r'<div class="compact-list">.*?</div>', replace_list, current, flags=re.S)
            assert count == 2
            target.write_text(migrated, encoding="utf-8")
    print(json.dumps({"people": len(result["people"]), **result["coverage"]["degreeCounts"],
                      "postdocs": len(result["postdocs"]), "unconfirmedLegacyStarts": 64}))


if __name__ == "__main__":
    main()
