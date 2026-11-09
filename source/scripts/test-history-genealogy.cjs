#!/usr/bin/env node
'use strict';

// Run from any directory: node --test path/to/scripts/test-history-genealogy.cjs
// No browser or third-party packages are required. UI interaction/rendering
// still needs a browser check; these tests cover identities and graph geometry.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'data', name), 'utf8'));
const catalogue = read('history.json');
const ancestry = read('history-ancestry.json');
const faculty = read('faculty.json');
const data = {
  people: [...catalogue.people, ...ancestry.people],
  degrees: [...catalogue.degrees, ...ancestry.degrees],
  postdocs: catalogue.postdocs
};
const { buildModel, neighbourhood, layoutGraph, edgePath } = require(path.join(root, 'static/js/history-genealogy.js')).model;
const normalise = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim();

function unique(values, description) {
  const seen = new Set();
  for (const value of values) {
    assert(!seen.has(value), `${description}: ${value}`);
    seen.add(value);
  }
  return seen;
}

function assertDag(people, edges, description) {
  // Independent topological check, before calling the layout implementation.
  const children = new Map(people.map(person => [person.id, new Set()]));
  const indegrees = new Map(people.map(person => [person.id, 0]));
  for (const { source, target } of edges) {
    assert(children.has(source) && children.has(target), `${description}: orphan edge`);
    if (!children.get(source).has(target)) {
      children.get(source).add(target);
      indegrees.set(target, indegrees.get(target) + 1);
    }
  }
  const queue = people.filter(person => indegrees.get(person.id) === 0).map(person => person.id);
  for (let i = 0; i < queue.length; i++) {
    for (const child of children.get(queue[i])) {
      indegrees.set(child, indegrees.get(child) - 1);
      if (!indegrees.get(child)) queue.push(child);
    }
  }
  assert.equal(queue.length, people.length, `${description}: directed cycle`);
}

function samples(svgPath) {
  const tokens = svgPath.match(/[MLC]|[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi) || [];
  const points = [];
  let i = 0, current;
  const point = () => ({ x: Number(tokens[i++]), y: Number(tokens[i++]) });
  while (i < tokens.length) {
    const command = tokens[i++];
    if (command === 'M') { current = point(); points.push(current); }
    else if (command === 'L') {
      const end = point();
      for (let step = 1; step <= 64; step++) {
        const t = step / 64;
        points.push({ x: current.x + (end.x - current.x) * t, y: current.y + (end.y - current.y) * t });
      }
      current = end;
    } else if (command === 'C') {
      const a = point(), b = point(), end = point();
      for (let step = 1; step <= 64; step++) {
        const t = step / 64, u = 1 - t;
        points.push({ x: u ** 3 * current.x + 3 * u ** 2 * t * a.x + 3 * u * t ** 2 * b.x + t ** 3 * end.x,
          y: u ** 3 * current.y + 3 * u ** 2 * t * a.y + 3 * u * t ** 2 * b.y + t ** 3 * end.y });
      }
      current = end;
    } else assert.fail(`Unsupported SVG command in geometry test: ${command}`);
  }
  return points;
}

function checkLayout(model, subset, description, inspectRoutes = false) {
  const geometry = layoutGraph(model, subset);
  assert(!geometry.cycle, `${description}: cycle reported by layout`);
  assert(Number.isFinite(geometry.width) && geometry.width > 0, `${description}: invalid width`);
  assert(Number.isFinite(geometry.height) && geometry.height > 0, `${description}: invalid height`);
  assert.equal(geometry.positions.size, subset.ids.size, `${description}: lost/duplicated person`);
  const boxes = Array.from(geometry.positions);
  for (const [id, box] of boxes) {
    assert(subset.ids.has(id), `${description}: unexpected node ${id}`);
    assert([box.x, box.y, box.width, box.height].every(Number.isFinite), `${description}: invalid box ${id}`);
    assert(box.width > 0 && box.height > 0, `${description}: empty box ${id}`);
    assert(box.x >= 0 && box.y >= 0 && box.x + box.width <= geometry.width && box.y + box.height <= geometry.height,
      `${description}: node ${id} lies outside the scene`);
  }
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const [aId, a] = boxes[i], [bId, b] = boxes[j];
    assert(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y,
      `${description}: overlapping cards ${aId} and ${bId}`);
  }
  for (const edge of subset.edges) {
    assert(subset.ids.has(edge.source) && subset.ids.has(edge.target), `${description}: orphan visible edge`);
    const from = geometry.positions.get(edge.source), to = geometry.positions.get(edge.target);
    assert(from.y + from.height < to.y, `${description}: advisor must appear above student`);
    const route = geometry.edgeRoutes.get(edge.id);
    if (route) {
      assert(Number.isFinite(route.x) && route.x >= 0 && route.x <= geometry.width, `${description}: route outside scene`);
      assert(boxes.every(([, box]) => route.x < box.x || route.x > box.x + box.width), `${description}: lateral corridor enters a card column`);
    }
    if (inspectRoutes) {
      const points = samples(edgePath(geometry, edge));
      assert(points.length > 1, `${description}: missing SVG path`);
      const first = points[0], last = points.at(-1);
      assert.equal(first.x, from.x + from.width / 2); assert.equal(first.y, from.y + from.height);
      assert.equal(last.x, to.x + to.width / 2); assert.equal(last.y, to.y);
      for (const point of points) {
        assert(Number.isFinite(point.x) && Number.isFinite(point.y), `${description}: invalid path coordinate`);
        assert(point.x >= -1e-6 && point.x <= geometry.width + 1e-6 && point.y >= -1e-6 && point.y <= geometry.height + 1e-6,
          `${description}: edge ${edge.id} leaves scene`);
        for (const [id, box] of boxes) {
          const inside = point.x > box.x + 1e-6 && point.x < box.x + box.width - 1e-6 &&
            point.y > box.y + 1e-6 && point.y < box.y + box.height - 1e-6;
          assert(!inside, `${description}: edge ${edge.id} enters card ${id}`);
        }
      }
    }
  }
  return geometry;
}

test('catalogue and faculty ancestry merge without duplicate people, aliases or doctoral records', () => {
  const ids = unique(data.people.map(person => person.id), 'Duplicate person ID');
  unique(data.degrees.map(degree => degree.id), 'Duplicate degree ID');
  unique(data.degrees.filter(degree => degree.level === 'phd').map(degree =>
    [degree.personId, degree.year, normalise(degree.institution)].join('|')), 'Duplicate PhD');
  const names = new Map();
  for (const person of data.people) for (const name of [person.name, ...(person.aliases || [])]) {
    const key = normalise(name);
    assert(!names.has(key) || names.get(key) === person.id, `Name or alias belongs to two people: ${name}`);
    names.set(key, person.id);
  }
  const facultyIds = new Set(faculty.map(person => person.id));
  assert.deepEqual(new Set(data.people.filter(person => person.facultyId).map(person => person.facultyId)), facultyIds);
  for (const degree of data.degrees) {
    assert(ids.has(degree.personId), `Degree has missing person: ${degree.id}`);
    unique((degree.advisors || []).map(advisor => advisor.personId), `Repeated advisor: ${degree.id}`);
    for (const advisor of degree.advisors || []) {
      assert(ids.has(advisor.personId), `Missing advisor: ${degree.id}/${advisor.personId}`);
      assert.notEqual(advisor.personId, degree.personId, `Self-advising degree: ${degree.id}`);
    }
  }
});

test('supplementary faculty education remains separate from the supervision catalogue', () => {
  const cataloguePhDs = new Set(catalogue.degrees.filter(degree => degree.level === 'phd').map(degree => degree.personId));
  assert(!catalogue.degrees.some(degree => degree.scope === 'faculty-education'));
  for (const degree of ancestry.degrees) {
    assert.equal(degree.scope, 'faculty-education');
    assert.equal(degree.level, 'phd');
    assert(!cataloguePhDs.has(degree.personId), `Faculty PhD duplicated across the two datasets: ${degree.personId}`);
    assert(degree.sources.length > 0 && degree.sources.every(source => source.url && source.checked), `Missing source: ${degree.id}`);
  }
});

test('the merged recorded relationships are acyclic before and after every degree filter', () => {
  for (const level of ['phd', 'masters', 'all']) for (const includeCo of [false, true]) {
    const model = buildModel(data, level, includeCo);
    assertDag(data.people, model.edges, `${level}, co-advising=${includeCo}`);
    assert(model.degrees.every(degree => level === 'all' || (level === 'masters'
      ? ['masters', 'professional-masters'].includes(degree.level) : degree.level === level)));
    assert(!model.degrees.some(degree => !['phd', 'masters', 'professional-masters'].includes(degree.level)));
    if (!includeCo) assert(model.edges.every(edge => edge.role !== 'coadvisor'));
    assert.equal(model.edges.filter(edge => edge.role === 'joint').length,
      buildModel(data, level, true).edges.filter(edge => edge.role === 'joint').length,
      'Reported joint supervision must not silently turn into formal co-advising');
  }
});

test('all actual people remain distinct and readable in bounded branches and expanded generations', () => {
  const snapshot = JSON.stringify(data);
  for (const level of ['phd', 'masters', 'all']) for (const includeCo of [false, true]) {
    const model = buildModel(data, level, includeCo);
    for (const person of data.people) for (const depth of [1, 2, 8]) {
      const subset = neighbourhood(model, person.id, depth, depth);
      const description = `${person.id}/${level}/co=${includeCo}/depth=${depth}`;
      assert(subset.ids.has(person.id), `${description}: lost focused person`);
      assert(subset.ids.size <= 70, `${description}: branch cap exceeded`);
      assert.equal(subset.truncated, subset.allCount > subset.ids.size);
      checkLayout(model, subset, description);
    }
  }
  assert.equal(JSON.stringify(data), snapshot, 'Graph functions must not mutate the source catalogue');
});

test('paths in expanded faculty branches remain inside the scene and outside cards', () => {
  for (const level of ['phd', 'masters', 'all']) {
    const model = buildModel(data, level, true);
    for (const person of data.people.filter(person => person.facultyId)) {
      checkLayout(model, neighbourhood(model, person.id, 8, 8), `${person.id}/${level}/paths`, true);
    }
  }
});

test('synthetic co-advising, two degrees, professional masters and isolated people preserve their meaning', () => {
  const sample = {
    people: ['a', 'b', 'c', 'd', 'e', 'isolated'].map(id => ({ id, name: id })),
    degrees: [
      { id: 'c-phd', personId: 'c', level: 'phd', advisors: [{ personId: 'a', role: 'advisor' }, { personId: 'b', role: 'coadvisor' }] },
      { id: 'd-phd', personId: 'd', level: 'phd', advisors: [{ personId: 'c', role: 'advisor' }] },
      { id: 'e-msc', personId: 'e', level: 'professional-masters', advisors: [{ personId: 'c', role: 'advisor' }] },
      { id: 'e-phd', personId: 'e', level: 'phd', advisors: [{ personId: 'd', role: 'advisor' }, { personId: 'a', role: 'joint' }] }
    ]
  };
  const model = buildModel(sample, 'phd', true);
  const first = neighbourhood(model, 'c', 1, 1), expanded = neighbourhood(model, 'c', 1, 2);
  assert.deepEqual(first.ids, new Set(['c', 'a', 'b', 'd']));
  assert(expanded.ids.has('e') && expanded.ids.size === 5);
  assert.deepEqual(neighbourhood(model, 'isolated', 8, 8).ids, new Set(['isolated']));
  assert.equal(buildModel(sample, 'masters', true).degrees.length, 1);
  assert.equal(buildModel(sample, 'phd', false).edges.length, model.edges.length - 1);
  const all = buildModel(sample, 'all', true), subset = neighbourhood(all, 'c', 4, 4);
  const geometry = checkLayout(all, subset, 'synthetic multigeneration', true);
  assert.equal(geometry.positions.size, 5, 'A person with two degrees still occupies one card');
  assert(geometry.edgeRoutes.size > 0, 'Edges skipping a generation need lateral routing');
  const capped = neighbourhood(all, 'c', 4, 4, 3);
  assert.equal(capped.ids.size, 3); assert(capped.truncated && capped.ids.has('c'));
  assert.equal(edgePath(geometry, { id: 'missing', source: 'missing', target: 'c' }), '');
});

test('an invalid cycle is reported rather than silently described as a genealogy', () => {
  const sample = { people: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], degrees: [
    { id: 'a-phd', personId: 'a', level: 'phd', advisors: [{ personId: 'b' }] },
    { id: 'b-phd', personId: 'b', level: 'phd', advisors: [{ personId: 'a' }] }
  ] };
  const model = buildModel(sample, 'phd', true);
  assert.throws(() => assertDag(sample.people, model.edges, 'intentional cycle'));
  assert.equal(layoutGraph(model, neighbourhood(model, 'a', 2, 2)).cycle, true);
});
