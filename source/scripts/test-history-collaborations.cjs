#!/usr/bin/env node
'use strict';

// Read-only checks using Node's standard library. No DOM, server, or browser.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const readJSON = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8').replace(/^\uFEFF/, ''));
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(root, 'static/js/history-collaborations.js'), 'utf8'), context,
  { filename: 'history-collaborations.js', timeout: 5000 });
const buildGraph = context.CommunityCollaborations.buildGraph;
const plain = value => JSON.parse(JSON.stringify(value));

function edgeRows(graph) {
  return graph.edges.map(edge => [edge.source, edge.target, edge.weight, [...edge.papers].sort()])
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
function equal(actual, expected, message) { assert.deepEqual(plain(actual), plain(expected), message); }

// Small independent example: one three-author paper gives three pairs, not three papers.
const fixture = {
  faculty: [{ id: 'a', name: 'A', phdYear: 2000 }, { id: 'b', name: 'B', phdYear: 2001 }, { id: 'c', name: 'C', phdYear: 2002 }],
  papers: [
    { id: 'one', year: 2020, faculty: ['c', 'a', 'a', 'b', 'outside'] },
    { id: 'one', year: 2020, faculty: ['a', 'b', 'c'] },
    { id: 'two', year: 2021, authors: [{ facultyId: 'a' }, { facultyId: 'a' }, { facultyId: 'c' }] },
    { id: 'solo', year: 2022, faculty: ['a'] },
    { id: 'external', year: 2019, faculty: ['outside'] },
    { id: 'missing-year', faculty: ['a', 'b'] }
  ]
};
const beforeFixture = JSON.stringify(fixture);
const sample = buildGraph(fixture);
equal(edgeRows(sample), [['a', 'b', 1, ['one']], ['a', 'c', 2, ['one', 'two']], ['b', 'c', 1, ['one']]], 'Unordered pair weights');
assert.equal(sample.papers.length, 2, 'Count distinct papers, not incidences');
assert.equal(sample.missingYears, 1, 'Missing years are reported and excluded');
const firstYear = buildGraph(fixture, 2020, 2020);
assert.equal(firstYear.edges.length, 3);
assert.ok(firstYear.edges.every(edge => edge.weight === 1));
equal(edgeRows(buildGraph(fixture, 2021, 2021)), [['a', 'c', 1, ['two']]], 'Inclusive year endpoints');
assert.equal(buildGraph(fixture, 2000, 2010).edges.length, 0);
assert.equal(buildGraph(fixture, 2021, 2020).edges.length, 0);
assert.equal(buildGraph({ faculty: [], papers: fixture.papers }).edges.length, 0);
assert.equal(JSON.stringify(fixture), beforeFixture, 'Aggregation must not mutate its input');

const data = { faculty: readJSON('data/faculty.json'), papers: readJSON('data/publications.json').papers };
const before = JSON.stringify(data);
const allowed = new Set(data.faculty.map(person => person.id));
const full = buildGraph(data);
assert.ok(full.years.length, 'The real catalogue needs a valid year');
const first = full.years[0], last = full.years.at(-1);

// Independent oracle: author.facultyId links, a differently keyed set of paper IDs,
// and no use of buildGraph or its paper.faculty aggregation.
function oracle(start, end) {
  const pairs = new Map(), papers = new Set(), seen = new Set();
  for (const paper of data.papers) {
    if (seen.has(paper.id)) continue;
    seen.add(paper.id);
    const year = Number(paper.year);
    if (!Number.isInteger(year) || year < start || year > end) continue;
    const authors = [...new Set((paper.authors || []).map(a => a.facultyId).filter(id => allowed.has(id)))].sort();
    for (let a = 0; a < authors.length; a++) {
      for (let b = a + 1; b < authors.length; b++) {
        const key = authors[a] + '\u001f' + authors[b];
        if (!pairs.has(key)) pairs.set(key, new Set());
        pairs.get(key).add(paper.id); papers.add(paper.id);
      }
    }
  }
  const rows = [...pairs].map(([key, ids]) => [...key.split('\u001f'), ids.size, [...ids].sort()])
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return { rows, count: papers.size };
}

let checkedPeriods = 0;
for (let end = first; end <= last; end++) {
  for (const [startYear, endYear] of [[first, end], [end, end]]) {
    const actual = buildGraph(data, startYear, endYear), expected = oracle(startYear, endYear);
    equal(edgeRows(actual), expected.rows, `Independent oracle ${startYear}–${endYear}`);
    assert.equal(actual.papers.length, expected.count, `Distinct papers ${startYear}–${endYear}`);
    equal(actual.nodes.map(node => node.id), full.nodes.map(node => node.id), 'Temporal filters must preserve node positions');
    checkedPeriods++;
  }
  // Splitting the full interval cannot lose or double-count an edge's papers.
  const totals = new Map();
  for (const edge of [...buildGraph(data, first, end).edges, ...buildGraph(data, end + 1, last).edges]) {
    totals.set(edge.key, (totals.get(edge.key) || 0) + edge.weight);
  }
  equal([...totals].sort(), full.edges.map(edge => [edge.key, edge.weight]).sort(), `Partition after ${end}`);
}
equal(edgeRows(buildGraph({ faculty: data.faculty, papers: [...data.papers, ...data.papers] })), edgeRows(full), 'Duplicate catalogue IDs must not increase weights');
assert.equal(JSON.stringify(data), before, 'Real input must remain unchanged');

console.log(JSON.stringify({ status: 'ok', faculty: full.nodes.length, edges: full.edges.length,
  sharedPapers: full.papers.length, maxWeight: full.maxWeight, years: [first, last],
  oraclePeriods: checkedPeriods, partitions: last - first + 1,
  duplicateIds: 'ok', missingYears: 'ok', inputImmutability: 'ok' }));
