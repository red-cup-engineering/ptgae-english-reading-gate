import test from 'node:test';
import assert from 'node:assert/strict';
import { receiveEnglishReading } from '../src/admit-english-reading.mjs';

const englishBundle = { package: '@lenticule-science/english-language-algebra', version: '0.1.2', sourceCommit: 'a'.repeat(40) };
const text = 'The teacher graded the exam.';
const reading = { meta: { name: 'English', code: 'en' }, sentences: [{
  text, words: ['The', 'teacher', 'graded', 'the', 'exam'].map(text => ({ text, tags: [] })),
  arcs: [{ rel: 'nsubj', head: 'graded', dependent: 'teacher', status: 'settled' },
    { rel: 'dobj', head: 'graded', dependent: 'exam', status: 'settled' }],
  roles: [{ verb: 'graded', agent: 'teacher', patient: 'exam' }], cohomology: { H0: 1, H1: 0 }
}] };
const accept = (opts = {}) => receiveEnglishReading({ sourceText: text, englishBundle, reading, ...opts });

test('anchors real-shaped English candidate grammar arcs to source token instances', () => {
  const got = accept();
  assert.equal(got.kind, 'ptgae.english-reading-gate.v0');
  assert.equal(got.status, 'candidate');
  assert.deepEqual(got.sentences[0].words[1].sourceSpan, [4, 11]);
  assert.equal(got.sentences[0].grammarRelations[0].head, '0:2');
  assert.equal(got.sentences[0].grammarRelations[0].dependent, '0:1');
  assert.equal(got.sentences[0].roleCandidates[0].agent, 'teacher');
  assert.deepEqual(got.signCellsAdmitted, []);
  assert.deepEqual(got.executableEffects, []);
  assert.equal(got.interpretationAuthority, 'candidate-only');
  assert.equal(got.source.utf16Length, text.length);
  assert.match(got.source.sha256, /^[a-f0-9]{64}$/u);
});

test('identical input is deterministic and does not mutate source or parser result', () => {
  const original = structuredClone(reading);
  assert.deepEqual(accept(), accept());
  assert.deepEqual(reading, original);
});

test('unknown installed English source revision is not accepted as pinned', () => {
  assert.throws(() => accept({ englishBundle: { ...englishBundle, sourceCommit: 'unknown' } }), /pinned English-algebra/);
});

test('tagText metadata must really identify English', () => {
  assert.throws(() => accept({ reading: { ...reading, meta: { code: 'la' } } }), /English algebra tagText/);
});

test('source-text mismatch abstains rather than inventing source spans', () => {
  const result = accept({ reading: { ...reading, sentences: [{ ...reading.sentences[0], text: 'Mary wrote.' }] } });
  assert.equal(result.status, 'abstained');
  assert.equal(result.diagnostics[0].code, 'SOURCE_SPAN_NOT_FOUND');
});

test('bare present-verb undercoverage remains explicitly unresolved', () => {
  const sentence = 'Mary reads a book.';
  const result = accept({ sourceText: sentence, reading: { ...reading, sentences: [{ text: sentence,
    words: ['Mary', 'reads', 'a', 'book'].map(text => ({ text, tags: ['noun'] })), arcs: [], roles: [],
    cohomology: { H0: 4, H1: 0 } }] } });
  assert.equal(result.status, 'abstained');
  assert.ok(result.diagnostics.some(d => d.code === 'NO_GRAMMATICAL_RELATIONS'));
});

test('duplicate surface tokens make text-addressed grammar arcs ambiguous', () => {
  const sentence = 'The teacher saw the teacher.';
  const words = ['The', 'teacher', 'saw', 'the', 'teacher'].map(text => ({ text, tags: [] }));
  const result = accept({ sourceText: sentence, reading: { ...reading, sentences: [{ text: sentence,
    words, arcs: [{ rel: 'nsubj', head: 'saw', dependent: 'teacher' }], roles: [] }] } });
  assert.equal(result.status, 'abstained');
  assert.equal(result.sentences[0].grammarRelations[0].dependent, null);
  assert.ok(result.diagnostics.some(d => d.code === 'AMBIGUOUS_RELATION_REFERENT'));
});

test('UTF-16 offsets remain correct after astral character', () => {
  const source = '😀 ' + text;
  const result = accept({ sourceText: source });
  // The parser omitted a non-whitespace prefix; offsets remain valid, but a
  // whole-document candidate must abstain from claiming complete coverage.
  assert.equal(result.status, 'abstained');
  assert.deepEqual(result.source.coverage.uncoveredSpans, [[0, 3]]);
  assert.deepEqual(result.sentences[0].sourceSpan, [3, source.length]);
  assert.deepEqual(result.sentences[0].words[0].sourceSpan, [3, 6]);
});

test('refuses whitespace-only and malformed parser inputs', () => {
  assert.throws(() => accept({ sourceText: ' ' }), /sourceText must be nonempty/);
  assert.throws(() => accept({ reading: { ...reading, sentences: [{ text, arcs: [], roles: [] }] } }), /not a supported tagText/);
});
