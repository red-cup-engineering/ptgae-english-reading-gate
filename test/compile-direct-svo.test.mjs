import test from 'node:test';
import assert from 'node:assert/strict';
import { compilePtgaeDirectSvo, realizePtgaeDirectSvo, DIRECT_SVO_PROFILE } from '../src/compile-direct-svo.mjs';

const englishBundle={package:'@lenticule-science/english-language-algebra',version:'0.1.2',sourceCommit:'f'.repeat(40)};
const base='The teacher graded the exam.';
function shaped(source, alterations={}) {
  const words=source.replace(/[.!?]$/u,'').split(/\s+/u);
  const n=words.length;
  const shapes=words.map((text,i)=>({text,tags: [i===0&&n===5?'det':i===n-2?'det':i===n-3?'verb':'noun']}));
  const verb=words[n-3], subject=words[n===5?1:0], object=words[n-1];
  const arcs=[{rel:'nsubj',head:verb,dependent:subject,status:'settled'},
              {rel:'dobj',head:verb,dependent:object,status:'settled'},
              {rel:'det',head:object,dependent:words[n-2],status:'settled'},
              ...(n===5?[{rel:'det',head:subject,dependent:words[0],status:'settled'}]:[])];
  const role={verb,agent:subject,patient:object};
  return {meta:{name:'English',code:'en'},sentences:[{text:source,words:alterations.words??shapes,
    arcs:alterations.arcs??arcs,roles:alterations.roles??[role]}]};
}
function compile(sourceText=base,reading=shaped(sourceText)) {
  return compilePtgaeDirectSvo({sourceText,englishBundle,tagText:()=>structuredClone(reading)});
}
const admitted=[base,'Mary graded the exam.'];
for (const source of admitted) test('admitted direct SVO preserves SPO and exact realization: ' + source,()=>{
  const r=compile(source);
  assert.equal(r.status,'admitted');
  assert.equal(r.profile,DIRECT_SVO_PROFILE);
  assert.equal(r.predications.length,1);
  assert.equal(r.predications[0].predicate.text,'graded');
  assert.equal(r.predications[0].object.text,'exam');
  assert.equal(r.predications[0].subject.text,source.startsWith('Mary')?'Mary':'teacher');
  assert.equal(realizePtgaeDirectSvo(r),source);
  assert.deepEqual(r.signCellsAdmitted,[]);
  assert.deepEqual(r.executableEffects,[]);
  assert.equal(r.truthCharge,null);
  assert.equal(r.upstreamIdentityVerified,false);
});

const rejected=[
  ['All teachers graded the exam.','unsupported','PROFILE_DETERMINERS'],
  ['Some teacher graded the exam.','unsupported','PROFILE_DETERMINERS'],
  ['A teacher graded the exam.','unsupported','PROFILE_DETERMINERS'],
  ['The teacher graded an exam.','unsupported','PROFILE_DETERMINERS'],
  ['The teacher graded a exam.','unsupported','PROFILE_DETERMINERS'],
  ['the teacher graded the exam.','ambiguous','AMBIGUOUS_RELATION_REFERENT'],
  ['The teacher graded the exam!','unsupported','PROFILE_CANONICAL_SURFACE'],
  ['The teacher graded the exam?','unsupported','PROFILE_CANONICAL_SURFACE'],
  ['The teacher graded the exam','unsupported','PROFILE_CANONICAL_SURFACE'],
  ['The  teacher graded the exam.','unsupported','PROFILE_CANONICAL_SURFACE'],
  ['The teacher might grade the exam.','unsupported','PROFILE_WORD_COUNT'],
  ['The teacher did not grade the exam.','unsupported','PROFILE_WORD_COUNT'],
  ['The teacher graded the exam yesterday.','unsupported','PROFILE_WORD_COUNT'],
  ['The teacher had graded the exam.','unsupported','PROFILE_WORD_COUNT'],
  ['The teacher graded the exam,.','unsupported','PROFILE_CANONICAL_SURFACE'],
  ['The teacher graded the important exam.','unsupported','PROFILE_WORD_COUNT'],
  ['The teacher told Mary to grade the exam.','unsupported','PROFILE_WORD_COUNT'],
  ['The teacher graded the exam carefully.','unsupported','PROFILE_WORD_COUNT'],
  ['The teacher graded the exam. More','unsupported','PROFILE_WORD_COUNT'],
];
for(const [source,status,code] of rejected) test('rejects unsupported English construction: ' + source,()=>{
  const r=compile(source);
  assert.equal(r.status,status);
  assert.ok(r.diagnostics.some(d=>d.code===code),JSON.stringify(r.diagnostics));
  assert.deepEqual(r.predications,[]);
});

test('rejects role disagreement with source-anchored dependencies',()=>{
  const reading=shaped(base);
  reading.sentences[0].roles=[{verb:'graded',agent:'exam',patient:'teacher'}];
  const r=compile(base,reading);
  assert.equal(r.status,'invalid');
  assert.equal(r.diagnostics[0].code,'PROFILE_ROLE_MISMATCH');
});
test('rejects undeclared semantic adjunct',()=>{
  const reading=shaped(base);
  reading.sentences[0].roles[0].instrument='teacher';
  const r=compile(base,reading);
  assert.equal(r.status,'unsupported');
  assert.equal(r.diagnostics[0].code,'PROFILE_ADJUNCT');
});
test('rejects missing nsubj or extra relations',()=>{
  for(const relation of ['nsubj','root']) {
    const reading=shaped(base);
    reading.sentences[0].arcs=relation==='nsubj'?reading.sentences[0].arcs.filter(a=>a.rel!=='nsubj'):
      [...reading.sentences[0].arcs,{rel:'root',head:'graded',dependent:'exam',status:'settled'}];
    const r=compile(base,reading);
    assert.equal(r.status,'unsupported');
    assert.equal(r.diagnostics[0].code,'PROFILE_ARCS');
  }
});
test('does not promote upstream potential/uncertain relations to settled',()=>{
  const reading=shaped(base);
  reading.sentences[0].arcs[0].status='potential';
  const r=compile(base,reading);
  assert.equal(r.status,'unsupported');
  assert.equal(r.diagnostics[0].code,'PROFILE_ARCS');
});
test('rejects tags that do not support the direct SVO roles',()=>{
  for(const index of [0,1,2,3,4]) {
    const reading=shaped(base);
    reading.sentences[0].words[index].tags=[];
    const r=compile(base,reading);
    assert.equal(r.status,'unsupported');
    assert.equal(r.diagnostics[0].code,'PROFILE_POS');
  }
});
test('ambiguous role referents remain ambiguous, not contradictory evidence',()=>{
  const source='The teacher graded the teacher.';
  const r=compile(source);
  assert.equal(r.status,'ambiguous');
  assert.ok(r.diagnostics.some(d=>d.code==='UNRESOLVED_ROLE_REFERENT'));
  assert.equal(r.truthCharge,null);
});
test('unknown uncovered source content abstains',()=>{
  const r=compile('😀 '+base,shaped(base));
  assert.equal(r.status,'unparsed');
  assert.ok(r.diagnostics.some(d=>d.code==='UNPARSED_SOURCE_CONTENT'));
  assert.deepEqual(r.source.coverage.uncoveredSpans,[[0,3]]);
});
test('no upstream relations remains unparsed',()=>{
  const reading=shaped(base);
  reading.sentences[0].arcs=[];
  const r=compile(base,reading);
  assert.equal(r.status,'unparsed');
});
test('multiple source-covered sentences are unsupported by this edition',()=>{
  const reading=shaped(base);
  reading.sentences.push(shaped('Mary graded the exam.').sentences[0]);
  const r=compile(base+' Mary graded the exam.',reading);
  assert.equal(r.status,'unsupported');
  assert.equal(r.diagnostics[0].code,'PROFILE_SINGLE_CLAUSE');
});
test('invalid upstream role frame remains invalid',()=>{
  const reading=shaped(base);
  reading.sentences[0].roles=[{agent:'teacher'}];
  const r=compile(base,reading);
  assert.equal(r.status,'invalid');
});
test('exact source reconstruction rejects stale or edited compiled outputs',()=>{
  const r=compile();
  r.predications[0].surfaceTokens[1].text='student';
  assert.throws(()=>realizePtgaeDirectSvo(r),/source bytes/);
});
test('realization refuses unsupported and forged/malformed compilations',()=>{
  assert.throws(()=>realizePtgaeDirectSvo(compile('Some teacher graded the exam.')),/Expected an admitted/);
  assert.throws(()=>realizePtgaeDirectSvo({}),/Expected an admitted/);
});
test('input bundles with malformed source pins refuse without appearing admitted',()=>{
  assert.throws(()=>compilePtgaeDirectSvo({sourceText:base,
    englishBundle:{...englishBundle,sourceCommit:'unverified'},tagText:()=>shaped(base)}),/pinned English-algebra/);
});
test('a caller must provide the English parser, not a PTGAE-native tokenizer',()=>{
  assert.throws(()=>compilePtgaeDirectSvo({sourceText:base,englishBundle}),/caller-supplied function/);
});
