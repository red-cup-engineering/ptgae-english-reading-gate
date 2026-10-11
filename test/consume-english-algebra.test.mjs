import test from 'node:test';
import assert from 'node:assert/strict';
import { consumeEnglishAlgebra } from '../src/consume-english-algebra.mjs';

const englishBundle = {
  package: '@lenticule-science/english-language-algebra',
  version: '0.1.2',
  sourceCommit: 'a'.repeat(40),
};
const sourceText = 'The teacher graded the exam.';
const reading = {
  meta: { code: 'en' },
  sentences: [{
    text: sourceText,
    words: ['The', 'teacher', 'graded', 'the', 'exam'].map(text => ({ text, tags: [] })),
    arcs: [{ rel: 'nsubj', head: 'graded', dependent: 'teacher', status: 'settled' }],
    roles: [{ agent: 'teacher', verb: 'graded', patient: 'exam' }],
    cohomology: { H0: 1, H1: 0 },
  }],
};

test('invokes injected English algebra tagText(source) and preserves its candidates', () => {
  const called = [];
  const result = consumeEnglishAlgebra({ sourceText, englishBundle,
    tagText: text => { called.push(text); return structuredClone(reading); } });
  assert.deepEqual(called, [sourceText]);
  assert.equal(result.status, 'candidate');
  assert.equal(result.sentences[0].grammarRelations[0].rel, 'nsubj');
  assert.equal(result.sentences[0].roleCandidates[0].agent, 'teacher');
  assert.deepEqual(result.signCellsAdmitted, []);
  assert.deepEqual(result.executableEffects, []);
});

test('refuses unprovided or asynchronous English language engine', () => {
  assert.throws(() => consumeEnglishAlgebra({ sourceText, englishBundle }), /caller-supplied function/);
  assert.throws(() => consumeEnglishAlgebra({ sourceText, englishBundle,
    tagText: async () => structuredClone(reading) }), /synchronous reading/);
});

test('source mismatch from provider does not become an invented accepted reading', () => {
  const result = consumeEnglishAlgebra({ sourceText, englishBundle,
    tagText: () => ({ ...reading, sentences: [{ ...reading.sentences[0], text: 'Someone else said so.' }] }) });
  assert.equal(result.status, 'abstained');
  assert.equal(result.diagnostics[0].code, 'SOURCE_SPAN_NOT_FOUND');
});
