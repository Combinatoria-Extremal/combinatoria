"""Export the portal's catalogue, coauthor pairs and evidenced affiliations to SQLite."""
import argparse
import filecmp
import json
import os
from pathlib import Path
import sqlite3
import tempfile


def read(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


SCHEMA = """
PRAGMA foreign_keys = ON;
CREATE TABLE researchers (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, active_faculty INTEGER NOT NULL CHECK(active_faculty IN (0,1))
);
CREATE TABLE papers (id TEXT PRIMARY KEY, title TEXT NOT NULL, year INTEGER, url TEXT, doi TEXT);
CREATE TABLE paper_authors (
    paper_id TEXT REFERENCES papers, researcher_id TEXT REFERENCES researchers, author_position INTEGER NOT NULL,
    byline_name TEXT NOT NULL, PRIMARY KEY(paper_id, researcher_id), UNIQUE(paper_id, author_position)
);
CREATE INDEX authors_by_researcher ON paper_authors(researcher_id, paper_id);
CREATE TABLE joint_papers (
    person_a TEXT, person_b TEXT, paper_id TEXT, CHECK(person_a < person_b),
    PRIMARY KEY(person_a, person_b, paper_id),
    FOREIGN KEY(paper_id, person_a) REFERENCES paper_authors(paper_id, researcher_id),
    FOREIGN KEY(paper_id, person_b) REFERENCES paper_authors(paper_id, researcher_id)
);
CREATE TABLE affiliation_countries (
    paper_id TEXT, researcher_id TEXT, country TEXT NOT NULL CHECK(length(country)=2), source_url TEXT NOT NULL,
    PRIMARY KEY(paper_id, researcher_id, country),
    FOREIGN KEY(paper_id, researcher_id) REFERENCES paper_authors(paper_id, researcher_id)
);
CREATE TABLE affiliation_evidence (
    paper_id TEXT, researcher_id TEXT, source_url TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('paper','other-paper','institutional')),
    source_paper_id TEXT, source_title TEXT, source_year INTEGER, checked TEXT,
    PRIMARY KEY(paper_id, researcher_id),
    FOREIGN KEY(paper_id, researcher_id) REFERENCES paper_authors
);
CREATE TABLE institutions (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, country TEXT NOT NULL, openalex_id TEXT, ror TEXT
);
CREATE TABLE paper_affiliations (
    paper_id TEXT, researcher_id TEXT, country TEXT, institution_id TEXT REFERENCES institutions, name_on_record TEXT,
    PRIMARY KEY(paper_id, researcher_id, country, institution_id, name_on_record),
    FOREIGN KEY(paper_id, researcher_id, country) REFERENCES affiliation_countries
);
CREATE VIEW connections AS
    SELECT person_a, person_b, count(*) AS paper_count FROM joint_papers GROUP BY person_a, person_b;
CREATE VIEW faculty_collaborations AS
    SELECT j.person_b AS researcher_id, j.person_a AS faculty_id, j.paper_id
      FROM joint_papers j JOIN researchers r ON r.id=j.person_a WHERE r.active_faculty=1
    UNION ALL
    SELECT j.person_a, j.person_b, j.paper_id
      FROM joint_papers j JOIN researchers r ON r.id=j.person_b WHERE r.active_faculty=1;
CREATE VIEW catalogue_coauthors AS
    SELECT a.researcher_id, b.researcher_id AS coauthor_id, a.paper_id
      FROM paper_authors a JOIN paper_authors b ON a.paper_id=b.paper_id
      WHERE a.researcher_id<>b.researcher_id AND EXISTS (
          SELECT 1 FROM paper_authors m JOIN researchers r ON m.researcher_id=r.id
          WHERE m.paper_id=a.paper_id AND r.active_faculty=1
      );
CREATE VIEW researcher_totals AS
    SELECT r.id, r.name, count(DISTINCT f.paper_id) AS paper_count, count(DISTINCT f.faculty_id) AS faculty_count
      FROM faculty_collaborations f JOIN researchers r ON f.researcher_id=r.id GROUP BY r.id,r.name;
CREATE VIEW country_papers AS
    SELECT DISTINCT a.country, a.paper_id FROM affiliation_countries a JOIN faculty_collaborations f
      ON a.paper_id=f.paper_id AND a.researcher_id=f.researcher_id;
CREATE VIEW country_counts AS
    SELECT country, count(*) AS paper_count FROM country_papers GROUP BY country;
CREATE VIEW affiliation_coverage AS
    SELECT f.paper_id, count(DISTINCT f.researcher_id) AS coauthors,
           count(DISTINCT a.researcher_id) AS coauthors_with_country
      FROM faculty_collaborations f LEFT JOIN affiliation_countries a
      ON f.paper_id=a.paper_id AND f.researcher_id=a.researcher_id GROUP BY f.paper_id;
CREATE VIEW unresolved_affiliations AS
    SELECT DISTINCT f.paper_id, f.researcher_id FROM faculty_collaborations f
      WHERE NOT EXISTS (SELECT 1 FROM affiliation_countries a
                        WHERE a.paper_id=f.paper_id AND a.researcher_id=f.researcher_id);
"""


def populate(db, data_dir):
    faculty = {f["id"]: f for f in read(data_dir / "faculty.json")}
    papers = read(data_dir / "publications.json")["papers"]
    network = read(data_dir / "collaboration-network.json")
    aliases = read(data_dir / "collaboration-aliases.json")
    geography = read(data_dir / "collaboration-countries.json")
    people = {f: (row["name"], int(row.get("active", True))) for f, row in faculty.items()}
    authors = []
    countries = []
    evidence_sources = []
    institutions = {}
    affiliations = set()
    for paper in papers:
        evidence = geography["papers"].get(paper["id"], {})
        for position, author in enumerate(paper["authors"], start=1):
            raw = author["name"]
            name = aliases.get(raw, raw)
            person_id = author.get("facultyId") or ("author:" + name)
            people.setdefault(person_id, (name, 0))
            key = (paper["id"], person_id)
            authors.append((*key, position, raw))
            codes = evidence.get("authors", {}).get(raw, [])
            source = evidence.get("authorSources", {}).get(raw) or evidence.get("source")
            for code in codes:
                countries.append((*key, code, source))
            if codes:
                provenance = evidence.get("authorEvidence", {}).get(raw, {})
                evidence_sources.append((*key, source, provenance.get("kind", "paper"),
                                         provenance.get("paperId"), provenance.get("title"),
                                         provenance.get("year"), provenance.get("checked")))
            for inst in evidence.get("institutions", {}).get(raw, []):
                code = inst["country"]
                # A university may operate in different countries at different dates.
                ident = (inst.get("id") or inst.get("ror") or inst["name"].casefold()) + "|" + code
                institutions[ident] = (inst["name"], code, inst.get("id"), inst.get("ror"))
                affiliations.add((*key, code, ident, inst["name"]))
    db.executescript(SCHEMA)
    db.executemany("INSERT INTO researchers VALUES (?,?,?)", ((k,*v) for k,v in sorted(people.items())))
    db.executemany("INSERT INTO papers VALUES (?,?,?,?,?)",
                   ((p["id"],p["title"],p["year"],p["url"],p.get("doi")) for p in papers))
    db.executemany("INSERT INTO paper_authors VALUES (?,?,?,?)", authors)
    edges = set()
    for person in network["people"]:
        for member, ids in person["links"].items():
            pair = sorted((person["id"], member))
            edges.update((*pair, pid) for pid in ids)
    db.executemany("INSERT INTO joint_papers VALUES (?,?,?)", sorted(edges))
    db.executemany("INSERT INTO affiliation_countries VALUES (?,?,?,?)", countries)
    db.executemany("INSERT INTO affiliation_evidence VALUES (?,?,?,?,?,?,?,?)", evidence_sources)
    db.executemany("INSERT INTO institutions VALUES (?,?,?,?,?)", ((k,*v) for k,v in sorted(institutions.items())))
    db.executemany("INSERT INTO paper_affiliations VALUES (?,?,?,?,?)", sorted(affiliations))
    if db.execute("SELECT count(*) FROM connections").fetchone()[0] != network["pairCount"]:
        raise ValueError("Divergência entre os pares na exportação e na rede.")
    byline_edges = db.execute("""
        SELECT c.researcher_id, c.coauthor_id, c.paper_id
          FROM catalogue_coauthors c JOIN researchers r ON c.coauthor_id=r.id
          WHERE r.active_faculty=1
    """)
    indexed_edges = db.execute("SELECT researcher_id, faculty_id, paper_id FROM faculty_collaborations")
    if set(byline_edges) != set(indexed_edges):
        raise ValueError("As conexões da rede divergem das assinaturas dos artigos.")
    if "countries" in geography:
        for code, group in geography["countries"].items():
            actual = {r[0] for r in db.execute("SELECT paper_id FROM country_papers WHERE country=?", (code,))}
            if actual != set(group["papers"]) or len(actual) != group["count"]:
                raise ValueError(f"Índice geográfico divergente em {code}.")
        if {r[0] for r in db.execute("SELECT country FROM country_counts")} != set(geography["countries"]):
            raise ValueError("Índice geográfico incompleto.")


def export(data_dir, output):
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=output.parent, delete=False) as tmp:
        tmp_path = Path(tmp.name)
    try:
        db = sqlite3.connect(tmp_path)
        try:
            with db:
                populate(db, data_dir)
        finally:
            db.close()
        if not output.is_file() or not filecmp.cmp(tmp_path, output, shallow=False):
            os.replace(tmp_path, output)
    finally:
        tmp_path.unlink(missing_ok=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    export(args.source / "data", args.output or args.source / "output" / "coautorias.sqlite")
