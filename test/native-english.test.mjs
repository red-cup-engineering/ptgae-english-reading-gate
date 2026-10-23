import test from 'node:test';
import assert from 'node:assert/strict';
import { tagText } from '@lenticule-science/english-language-algebra/tag';
import { receiveEnglishReading } from '../src/admit-english-reading.mjs';
import { compilePtgaeDirectSvo, realizePtgaeDirectSvo } from '../src/compile-direct-svo.mjs';

// The native QA caller supplies the exact received source revision. The gate
// continues to report upstreamIdentityVerified:false; this test grants no authority.
const englishBundle={package:'@lenticule-science/english-language-algebra',version:'0.1.11',
 sourceCommit:process.env.ENGLISH_SOURCE_COMMIT};
const base='The teacher graded the exam.';

test('real received English produces a native source-bound direct-SVO roundtrip',()=>{
 for(const sourceText of [base,'Mary graded the exam.']) {
  const reading=tagText(sourceText);
  const gate=receiveEnglishReading({sourceText,englishBundle,reading});
  assert.equal(gate.status,'candidate',JSON.stringify(gate.diagnostics));
  assert.equal(gate.sentences[0].sourceBinding,'native-exact');
  assert.deepEqual(gate.sentences[0].words.map(w=>w.sourceSpan),reading.sentences[0].wordSourceSpans);
  assert.deepEqual(gate.sentences[0].grammarRelations.map(a=>a.parserValue),reading.sentences[0].arcs.map(a=>a.value));
  const compiled=compilePtgaeDirectSvo({sourceText,englishBundle,tagText});
  assert.equal(compiled.status,'admitted',JSON.stringify(compiled.diagnostics));
  assert.equal(realizePtgaeDirectSvo(compiled),sourceText);
  assert.equal(compiled.truthCharge,null);
  assert.deepEqual(compiled.signCellsAdmitted,[]);
  assert.deepEqual(compiled.executableEffects,[]);
  assert.equal(compiled.upstreamIdentityVerified,false);
 }
});

test('malformed supplied native coordinates are withheld without fallback reconstruction',()=>{
 const reading=tagText(base);reading.sentences[0].wordSourceSpans[1]=[0,7];
 const gate=receiveEnglishReading({sourceText:base,englishBundle,reading});
 assert.equal(gate.status,'abstained');
 assert.equal(gate.sentences[0].words[1].sourceSpan,null);
 assert.ok(gate.diagnostics.some(d=>d.code==='NATIVE_WORD_SPAN_INVALID'));
 const sentence=tagText(base);sentence.sentences[0].sourceBinding='withheld';
 const refused=receiveEnglishReading({sourceText:base,englishBundle,reading:sentence});
 assert.equal(refused.status,'abstained');
 assert.equal(refused.sentences[0].sourceSpan,null);
});

test('native ambiguity and unsupported modal construction cannot become admitted predications',()=>{
 for(const sourceText of ['The teacher graded the teacher.','The teacher might grade the exam.']) {
  const result=compilePtgaeDirectSvo({sourceText,englishBundle,tagText});
  assert.notEqual(result.status,'admitted');
  assert.deepEqual(result.predications,[]);
  assert.deepEqual(result.signCellsAdmitted,[]);
  assert.deepEqual(result.executableEffects,[]);
 }
});
