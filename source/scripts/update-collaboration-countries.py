"""Refresh publication-era author affiliation countries from the public OpenAlex API.

Run from the Hugo root with Python 3: python scripts/update-collaboration-countries.py
Optional --cache-dir reuses downloads; use a fresh cache to refresh the upstream data.
Only accessioned catalogue articles are retained, with independently checked titles
and unambiguous author matches. Supplemental affiliations taken from other works or
institutional records preserve their original source in authorEvidence.
"""
import argparse
import collections
import difflib
import hashlib
import html
import json
import re
import tempfile
import time
import unicodedata
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


def text_key(value):
    text = html.unescape(re.sub(r"<[^>]+>", " ", value or "")).casefold()
    text = text.translate(str.maketrans({"ł": "l", "ø": "o", "đ": "d", "ı": "i", "æ": "ae", "œ": "oe", "ß": "ss"}))
    text = "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c))
    return re.findall(r"[a-z0-9]+", text)


def title_matches(a, b, threshold):
    first, second = (" ".join(text_key(title)) for title in (a, b))
    if not first or not second:
        return False
    return first == second or difflib.SequenceMatcher(None, first, second, autojunk=False).ratio() >= threshold


def name_score(a, b):
    left, right = text_key(a), text_key(b)
    if not left or not right:
        return 0
    if left == right:
        return 3
    if " ".join(sorted(left)) == " ".join(sorted(right)):
        return 2
    # Publications use full given names, abbreviated given names and occasionally
    # omit middle names. Require the same last name and compatible first name.
    if len(left) < 2 or len(right) < 2 or left[-1] != right[-1]:
        return 0
    def compatible(x, y):
        return x == y or (min(len(x),len(y)) == 1 and x[0] == y[0])
    if not compatible(left[0], right[0]):
        return 0
    shorter, longer = sorted((left[1:-1],right[1:-1]),key=len)
    it = iter(longer)
    return int(all(any(compatible(word, other) for other in it) for word in shorter))


def affiliation_evidence(entry):
    # Use the authorship's institution-to-printed-affiliation links, never
    # country totals on the work or the most recent institution on an author.
    all_institutions = {inst["id"]:inst for inst in entry.get("institutions") or []}
    observed = {}
    country_only = set()
    raw_strings = set()
    for affiliation in entry.get("affiliations") or []:
        raw = affiliation.get("raw_affiliation_string") or ""
        if not raw or re.search(r"\b(?:funded|supported|support from|acknowledg\w*|grants?|scholarship|fellowship|award|visiting|visited)\b|\b(?:work|research) (?:was |was primarily )?(?:done|carried out)",raw,re.I):
            continue
        raw_strings.add(" ".join(text_key(raw)))
        for id in affiliation.get("institution_ids") or []:
            inst = all_institutions.get(id, {})
            name, country = inst.get("display_name"), inst.get("country_code")
            if not name or not country:
                continue
            # OpenAlex attaches the present-day Vienna location to historical
            # Budapest affiliations. Use the address actually printed here.
            if name == "Central European University" and re.search(r"\b(Budapest|Hungary)\b",raw,re.I):
                country = "HU"
            # A street address of the UERJ main campus was misresolved to
            # both the main university and a different UERJ institute.
            if name == "Instituto Politécnico do Rio de Janeiro" and "politécnico" not in raw.casefold():
                continue
            observed[id] = {k:v for k,v in {
                "name":name, "country":country, "id":id, "ror":inst.get("ror")
            }.items() if v}
        if not affiliation.get("institution_ids"):
            # Preserve an identified geographic affiliation without inventing
            # an institution when OpenAlex could not resolve the printed name.
            for country,pattern in {
                "GB":r"\b(?:UK|U\.K\.?|United Kingdom|England|Scotland|Wales)\b",
                "US":r"\b(?:USA|U\.S\.A\.?|United States)\b",
                "BR":r"\b(?:Brasil|Brazil)\b", "DE":r"\b(?:Germany|Deutschland)\b",
                "FR":r"\bFrance\b","CA":r"\bCanada\b","HU":r"\bHungary\b",
                "IL":r"\bIsrael\b","CH":r"\bSwitzerland\b","CL":r"\bChile\b",
                "CN":r"\bChina\b","AT":r"\bAustria\b","ES":r"\b(?:Spain|España)\b",
                "PL":r"\b(?:Poland|Polska)\b","KR":r"\bSouth Korea\b",
            }.items():
                if re.search(r"univ|college|academy|department|institut|cent[er]{2}|laborat|school|facult",raw,re.I) and re.search(pattern,raw,re.I):
                    country_only.add(country)
    institutions = list(observed.values())
    countries = sorted(country_only | {i["country"] for i in institutions})
    return countries, institutions, tuple(sorted(raw_strings))


def matched_authors(paper, work, aliases):
    authors = paper["authors"]
    byline = work.get("authorships") or []
    links = []
    for author in authors:
        variants = {author["name"], *aliases.get(author.get("facultyId"), [])}
        scores = []
        for idx, entry in enumerate(byline):
            names = [entry.get("raw_author_name"), (entry.get("author") or {}).get("display_name")]
            scores.append(max((name_score(a,b) for a in variants for b in names if b), default=0))
        best = max(scores, default=0)
        match = scores.index(best) if best and scores.count(best)==1 else None
        links.append(match)
    # A single upstream author slot cannot belong to two catalogue entries.
    used = collections.Counter(links)
    result = {}
    details = [affiliation_evidence(entry) for entry in byline]
    shared_raw = collections.Counter(item[2] for item in details)
    for author, match in zip(authors, links):
        if match is None or used[match] != 1:
            continue
        codes, institutions, raw = details[match]
        # Some records copy the full multi-institution byline onto every
        # author. Withhold ambiguous countries; if every institution is in one
        # country, only the country is identifiable for these authors.
        if len(raw)>1 and len(institutions)>1 and shared_raw[raw]>1:
            if len(codes)>1:
                continue
            institutions = []
        # These works exhibit aggregate attribution even where the raw strings
        # differ slightly between authors. Use checked bylines instead.
        if paper["id"] in {"arxiv:0806.4485","arxiv:1507.05226","doi:10.1002/rsa.3240030106",
                          "doi:10.1006/jctb.1995.1035","doi:10.1016/0012-365x(92)90447-n",
                          "doi:10.1073/pnas.0502771102","doi:10.1214/aoap/1028903457","doi:10.37236/756"}:
            continue
        if codes:
            result[author["name"]] = (codes, institutions)
    return result


def get_records(params, cache, offline):
    params["select"] = "id,doi,display_name,authorships,publication_year"
    query = "https://api.openalex.org/works?" + urlencode(params)
    filename = cache / (hashlib.sha256(query.encode()).hexdigest()+".json")
    if filename.is_file():
        return json.loads(filename.read_text(encoding="utf-8"))
    if offline:
        if "filter" in params and params["filter"].startswith("doi:"):
            raise FileNotFoundError(f"Missing DOI batch in the offline cache: {filename}")
        return []
    request = Request(query, headers={"User-Agent": "ExtremalCombinatoricsPublicationAtlas/1.0"})
    for attempt in range(4):
        try:
            with urlopen(request, timeout=45) as response:
                rows = json.load(response)["results"]
            filename.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
            return rows
        except HTTPError as error:
            if error.code not in (429, 500, 502, 503, 504) or attempt == 3:
                raise
            delay = error.headers.get("Retry-After","")
            time.sleep(int(delay) if delay.isdigit() else 2**(attempt+1))


def paper_dois(paper, bibliography):
    bibtex = bibliography.get(paper["id"], {}).get("bibtex","")
    field = re.search(r"\bdoi\s*=\s*\{([^}]+)", bibtex, flags=re.I)
    result = set()
    for doi in (paper.get("doi"), field.group(1) if field else None):
        if doi:
            result.add(doi.strip().removeprefix("https://doi.org/").casefold())
    if paper["id"].startswith("arxiv:"):
        result.add("10.48550/arxiv."+paper["id"].split(":",1)[1].casefold())
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--cache-dir", type=Path, default=Path(tempfile.gettempdir())/"extremal-openalex-works")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--doi-only", action="store_true", help="Skip title queries for DOI records with incomplete affiliations.")
    parser.add_argument("--offline",action="store_true",help="Read available cached metadata without making any network requests.")
    parser.add_argument("--allow-coverage-loss",action="store_true",
                        help="Allow previously documented author–article links to be removed after a manual review.")
    args = parser.parse_args()
    root, cache = args.root, args.cache_dir
    cache.mkdir(parents=True, exist_ok=True)
    read = lambda file: json.loads((root/"data"/file).read_text(encoding="utf-8"))
    faculty = read("faculty.json")
    aliases = {p["id"]: [p["name"], *p.get("aliases",[])] for p in faculty}
    papers = read("publications.json")["papers"]
    bibliography = read("bibliography.json")
    ids = {p["id"]:paper_dois(p,bibliography) for p in papers}
    dois = sorted(set().union(*ids.values()))
    records = collections.defaultdict(list)
    for offset in range(0,len(dois),30):
        group = dois[offset:offset+30]
        rows = get_records({"filter": "doi:"+"|".join(group),"per_page": "100"}, cache, args.offline)
        for row in rows:
            if row.get("doi"):
                records[row["doi"].lower().removeprefix("https://doi.org/")].append(row)
    evidence = {}
    for index,paper in enumerate(papers):
        matches = []
        def examine(row, threshold):
            if title_matches(paper["title"],row.get("display_name"),threshold):
                authors = matched_authors(paper,row,aliases)
                if authors:
                    matches.append((len(authors),row["id"],authors))
        for doi in sorted(ids[paper["id"]]):
            for row in records[doi]:
                examine(row,.78)
        if not args.doi_only and max((len(item[2]) for item in matches),default=0)<len(paper["authors"]):
            rows = get_records({"search":paper["title"],"per_page":"6"},cache,args.offline)
            for row in rows:
                # Exact or near-exact title; require two matching names across the
                # two bylines for title-only lookups to avoid homonymous papers.
                overlap=sum(any(name_score(x["name"], y.get("raw_author_name") or (y.get("author") or {}).get("display_name")) for y in row.get("authorships",[])) for x in paper["authors"])
                if overlap>=2 and abs((row.get("publication_year") or paper["year"])-paper["year"])<=6:
                    examine(row,.94)
        if matches:
            sorted_matches=sorted(matches,key=lambda item:(-item[0],item[1]))
            _,source,authors=sorted_matches[0]
            combined=dict(authors)
            other_sources={}
            for _,url,candidate in sorted_matches[1:]:
                for name,detail in candidate.items():
                    if name not in combined:
                        combined[name]=detail
                        other_sources[name]=url
            entry={"source":source,"authors":{name:detail[0] for name,detail in combined.items()},
                   "institutions":{name:detail[1] for name,detail in combined.items() if detail[1]}}
            if other_sources:
                entry["authorSources"]=other_sources
            evidence[paper["id"]]=entry
    # Keep manuscript corrections and documented supplementary affiliations with
    # their individual sources and the kind of evidence used for each author.
    manual_file = Path(__file__).with_name("collaboration-country-supplement.json")
    manual = json.loads(manual_file.read_text(encoding="utf-8")) if manual_file.is_file() else {}
    by_id = {p["id"]: p for p in papers}
    for paper_id, extra in manual.items():
        if paper_id not in by_id:
            continue
        names = {a["name"] for a in by_id[paper_id]["authors"]}
        # The inspected byline supersedes the upstream mapping for this paper.
        # An unassigned address is left unresolved even if an index guessed it.
        entry = {"source":extra["source"],"authors":{},"institutions":{}}
        if extra.get("partial"):
            # A review restricted to specified authors supersedes exactly
            # those authors; all author-specific citations remain distinct.
            entry=evidence.get(paper_id,entry)
        evidence[paper_id] = entry
        for name, institutions in extra["institutions"].items():
            if name not in names:
                raise ValueError(f"Unknown author on {paper_id}: {name}")
            entry["authors"][name]=sorted({inst["country"] for inst in institutions})
            entry["institutions"][name]=institutions
            source=extra.get("authorSources",{}).get(name,extra["source"])
            source_map=entry.setdefault("authorSources",{})
            if source != entry["source"]:
                source_map[name]=source
            else:
                source_map.pop(name,None)
            author_evidence = extra.get("authorEvidence", {}).get(name)
            if author_evidence:
                entry.setdefault("authorEvidence", {})[name] = author_evidence
            else:
                entry.get("authorEvidence", {}).pop(name, None)
        if not entry.get("authorSources"):
            entry.pop("authorSources",None)
    active={p["id"] for p in faculty if p.get("active",True)}
    by_country=collections.defaultdict(set)
    unresolved={}
    coverage={"cataloguePapers":len(papers),"jointPapers":0,"mappedJointPapers":0,
              "completeJointPapers":0,"coauthorAuthorships":0,"mappedCoauthorAuthorships":0}
    for paper_id,paper in by_id.items():
        data=evidence.get(paper_id,{"authors":{}})
        people=paper["authors"]
        members={a.get("facultyId") for a in people} & active
        coauthors=[a["name"] for a in people if members - {a.get("facultyId")}]
        if not coauthors:
            continue
        missing=[name for name in coauthors if not data["authors"].get(name)]
        if missing:
            unresolved[paper_id]=missing
        coverage["jointPapers"]+=1
        coverage["mappedJointPapers"]+=len(missing)<len(coauthors)
        coverage["completeJointPapers"]+=not missing
        coverage["coauthorAuthorships"]+=len(coauthors)
        coverage["mappedCoauthorAuthorships"]+=len(coauthors)-len(missing)
        for name in coauthors:
            for code in data["authors"].get(name,[]):
                by_country[code].add(paper_id)
    countries={code:{"count":len(ids),"papers":sorted(ids)} for code,ids in by_country.items()}
    output=args.output or root/"data"/"collaboration-countries.json"
    output.parent.mkdir(parents=True,exist_ok=True)
    if output.is_file() and not args.allow_coverage_loss:
        previous=json.loads(output.read_text(encoding="utf-8"))["papers"]
        lost=[]
        for paper_id,old in previous.items():
            if paper_id in by_id:
                expected={a["name"] for a in by_id[paper_id]["authors"]} & old["authors"].keys()
                for name in expected-evidence.get(paper_id,{"authors":{}})["authors"].keys():
                    lost.append(f"{paper_id} / {name}")
        if lost:
            raise ValueError(f"Kept the existing dataset: {len(lost)} previously documented author(s) would disappear. "
                             f"Review the data and cache before using --allow-coverage-loss. Examples: {lost[:4]}")
    payload={"papers":evidence,"countries":countries,"coverage":coverage,"unresolvedCoauthors":unresolved}
    with tempfile.NamedTemporaryFile("w",dir=output.parent,encoding="utf-8",delete=False,suffix=".tmp") as temp:
        json.dump(payload,temp,ensure_ascii=False,indent=2,sort_keys=True)
        temp.write("\n")
    Path(temp.name).replace(output)
    print(f"Affiliation evidence for {len(evidence)} of {len(papers)} catalogue papers and {sum(len(v['authors']) for v in evidence.values())} authorships.")


if __name__=="__main__":
    main()
