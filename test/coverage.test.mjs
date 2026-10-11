import test from 'node:test';
import assert from 'node:assert/strict';
import { receiveEnglishReading } from '../src/admit-english-reading.mjs';

const englishBundle = {
  package:'@lenticule-science/english-language-algebra',
  version:'0.1.2',
  sourceCommit:'a'.repeat(40)
};
const simple = (text, words, arcs=[], roles=[]) => ({
  meta:{code:'en'},
  sentences:[{text,words:words.map(text=>({text,tags:[]})),arcs,roles}]
});
const read = (sourceText, reading) =>
  receiveEnglishReading({sourceText,reading,englishBundle});

test('SVO role-frame slots resolve to source word occurrences, not global world claims',()=>{
  const sentence='The teacher graded the exam.';
  const r=read(sentence,simple(sentence,['The','teacher','graded','the','exam'],
    [{rel:'nsubj',head:'graded',dependent:'teacher'}],
    [{verb:'graded',agent:'teacher',patient:'exam',instrument:null,recipient:null,location:null}]));
  assert.equal(r.status,'candidate');
  assert.equal(r.source.coverage.complete,true);
  const frame=r.sentences[0].roleBindings[0];
  assert.equal(frame.status,'source-bound');
  assert.equal(frame.bindings.verb.tokenId,'0:2');
  assert.deepEqual(frame.bindings.agent.sourceSpan,[4,11]);
  assert.equal(r.sentences[0].roleCandidates[0].patient,'exam');
  assert.deepEqual(r.signCellsAdmitted,[]);
  assert.deepEqual(r.executableEffects,[]);
});

test('ambiguous repeated tokens never become pinned role bindings',()=>{
  const sentence='The teacher saw the teacher.';
  const r=read(sentence,simple(sentence,['The','teacher','saw','the','teacher'],
    [{rel:'nsubj',head:'saw',dependent:'teacher'}],
    [{verb:'saw',agent:'teacher',patient:'teacher'}]));
  assert.equal(r.status,'abstained');
  assert.equal(r.sentences[0].roleBindings[0].status,'unresolved');
  assert.equal(r.sentences[0].roleBindings[0].bindings.agent,null);
  assert.ok(r.diagnostics.some(d=>d.code==='UNRESOLVED_ROLE_REFERENT'));
});

test('missing source referents cannot be replaced with guessed agent identities',()=>{
  const sentence='The teacher graded the exam.';
  const r=read(sentence,simple(sentence,['The','teacher','graded','the','exam'],
    [{rel:'nsubj',head:'graded',dependent:'teacher'}],
    [{verb:'graded',agent:'Ada',patient:'exam'}]));
  assert.equal(r.status,'abstained');
  assert.equal(r.sentences[0].roleBindings[0].bindings.agent,null);
});

test('non-whitespace text not covered by upstream sentences causes abstention',()=>{
  const sentence='The teacher graded the exam.';
  const r=read('😀 '+sentence,simple(sentence,['The','teacher','graded','the','exam'],
    [{rel:'nsubj',head:'graded',dependent:'teacher'}],
    [{verb:'graded',agent:'teacher',patient:'exam'}]));
  assert.equal(r.status,'abstained');
  assert.equal(r.source.coverage.complete,false);
  assert.deepEqual(r.source.coverage.uncoveredSpans,[[0,3]]);
  assert.deepEqual(r.sentences[0].words[0].sourceSpan,[3,6]);
  assert.ok(r.diagnostics.some(d=>d.code==='UNPARSED_SOURCE_CONTENT'));
});

test('only whitespace gaps may separate source-complete sentence spans',()=>{
  const a='The teacher graded the exam.',b='Mary graded the exam.';
  const as=simple(a,['The','teacher','graded','the','exam'],
    [{rel:'nsubj',head:'graded',dependent:'teacher'}]).sentences[0];
  const bs=simple(b,['Mary','graded','the','exam'],
    [{rel:'nsubj',head:'graded',dependent:'Mary'}]).sentences[0];
  const r=read(a+'\n\n'+b,{meta:{code:'en'},sentences:[as,bs]});
  assert.equal(r.status,'candidate');
  assert.deepEqual(r.source.coverage.uncoveredSpans,[]);
  assert.equal(r.sentences[1].words[0].tokenId,'1:0');
});

test('malformed role frames, unknown fields and missing verb abstain',()=>{
  const s='The teacher graded the exam.';
  const withRole = frame => simple(s,['The','teacher','graded','the','exam'],
    [{rel:'nsubj',head:'graded',dependent:'teacher'}],[frame]);
  for(const frame of [42,{agent:'teacher'},{verb:'graded',agent:'teacher',authority:'admin'}]){
    const got=read(s,withRole(frame));
    assert.equal(got.status,'abstained');
    assert.equal(got.sentences[0].roleBindings[0].status,'unresolved');
  }
});
