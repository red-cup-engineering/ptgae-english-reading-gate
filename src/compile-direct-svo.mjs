import { createHash } from 'node:crypto';
import { consumeEnglishAlgebra } from './consume-english-algebra.mjs';

export const DIRECT_SVO_PROFILE = 'ptgae.direct-svo.v0.1';
const hash = text => createHash('sha256').update(text, 'utf8').digest('hex');
const lexical = /^[\p{L}\p{M}]+(?:['’\-][\p{L}\p{M}]+)*$/u;
const rejection = (code, message) => ({ code, message });

function classifyGateFailure(diagnostics) {
  if (diagnostics.some(x => ['AMBIGUOUS_RELATION_REFERENT', 'UNRESOLVED_ROLE_REFERENT'].includes(x.code))) return 'ambiguous';
  if (diagnostics.some(x => ['MALFORMED_RELATION','MALFORMED_ROLE_FRAME','ROLE_PREDICATE_MISSING',
    'UNSUPPORTED_ROLE_FIELD','UNSUPPORTED_ROLE_VALUE'].includes(x.code))) return 'invalid';
  return 'unparsed';
}

/**
 * Admit only the PTGAE v0 direct SVO surface, as witnessed by an injected
 * English algebra reading. This is a grammatical SPO candidate, NOT a truth
 * valuation, semantic equivalence proof, or operational action.
 */
export function compilePtgaeDirectSvo({ sourceText, sourceRevision = null, englishBundle, tagText }) {
  const received = consumeEnglishAlgebra({ sourceText, sourceRevision, englishBundle, tagText });
  const output = {
    kind: 'ptgae.direct-svo-compilation.v0', profile: DIRECT_SVO_PROFILE,
    status: 'unsupported', source: structuredClone(received.source),
    upstream: structuredClone(received.upstream),
    diagnostics: [], predications: [],
    readingStatus: received.status,
    interpretationAuthority: 'grammatical-candidate-only',
    truthCharge: null, signCellsAdmitted: [], executableEffects: [],
    upstreamIdentityVerified: false,
  };
  const fail = (status, code, message) => {
    output.status = status;
    output.diagnostics.push(rejection(code, message));
    return output;
  };
  if (received.status !== 'candidate') {
    output.status = classifyGateFailure(received.diagnostics);
    output.diagnostics = structuredClone(received.diagnostics);
    return output;
  }
  if (received.sentences.length !== 1) {
    return fail('unsupported', 'PROFILE_SINGLE_CLAUSE', 'This PTGAE edition accepts exactly one English sentence');
  }
  const s = received.sentences[0];
  const words = s.words;
  if (![4,5].includes(words.length)) {
    return fail('unsupported', 'PROFILE_WORD_COUNT', 'Only a single direct SVO clause with an object determiner is supported');
  }
  const surface = words.map(w => w.text).join(' ') + '.';
  if (sourceText !== surface || s.sourceSpan?.[0] !== 0 || s.sourceSpan?.[1] !== sourceText.length
      || words.some(w => !lexical.test(w.text))) {
    return fail('unsupported', 'PROFILE_CANONICAL_SURFACE',
      'The fragment requires a single period, one ASCII space between words, and source-preserved lexical tokens');
  }
  let cursor = 0;
  for (const w of words) {
    if (!w.sourceSpan || w.sourceSpan[0] !== cursor || w.sourceSpan[1] !== cursor + w.text.length) {
      return fail('invalid', 'PROFILE_SOURCE_SPAN', 'Canonical words do not match their source occurrences');
    }
    cursor += w.text.length + 1;
  }
  if (cursor !== sourceText.length) {
    return fail('invalid', 'PROFILE_SOURCE_LENGTH', 'Word positions do not reconstruct the complete source');
  }
  const subjectIndex = words.length === 5 ? 1 : 0;
  const verbIndex = words.length - 3;
  const determinerIndex = words.length - 2;
  const objectIndex = words.length - 1;
  const hasTag = (i, tag) => Array.isArray(words[i].tags) && words[i].tags.includes(tag);
  if (!(hasTag(subjectIndex,'noun') && hasTag(verbIndex,'verb') && hasTag(determinerIndex,'det')
    && hasTag(objectIndex,'noun') && (subjectIndex === 0 || hasTag(0,'det')))) {
    return fail('unsupported', 'PROFILE_POS', 'The declared English tags do not witness direct SVO noun/verb/determiner positions');
  }
  // PTGAE deliberately constricts English: quantifiers, indefinite articles,
  // modal constructions, and anaphora are not admitted by this edition.
  if (!/^\p{Lu}/u.test(words[0].text) || words[determinerIndex].text !== 'the'
      || (subjectIndex === 1 && words[0].text !== 'The')) {
    return fail('unsupported','PROFILE_DETERMINERS',
      'The v0 PTGAE fragment accepts a capitalized proper subject or The + noun, and the + object noun only');
  }
  if (s.roleBindings.length !== 1 || s.roleBindings[0].status !== 'source-bound') {
    return fail('ambiguous', 'PROFILE_ROLE_FRAME', 'Exactly one source-bound upstream SVO frame is required');
  }
  const bindings = s.roleBindings[0].bindings;
  const sameWord = (binding, w) => binding && binding.tokenId === w.tokenId
    && Array.isArray(binding.sourceSpan) && binding.sourceSpan[0] === w.sourceSpan[0]
    && binding.sourceSpan[1] === w.sourceSpan[1];
  if (!sameWord(bindings.agent,words[subjectIndex]) || !sameWord(bindings.verb,words[verbIndex])
      || !sameWord(bindings.patient,words[objectIndex])) {
    return fail('invalid','PROFILE_ROLE_MISMATCH','The upstream agent/verb/patient frame disagrees with source positions');
  }
  if (['instrument','recipient','location'].some(k => bindings[k] != null)) {
    return fail('unsupported','PROFILE_ADJUNCT','This PTGAE edition does not admit instrument/recipient/location complements');
  }
  const expected = [
    ['nsubj', words[verbIndex], words[subjectIndex]],
    ['dobj', words[verbIndex], words[objectIndex]],
    ['det', words[objectIndex], words[determinerIndex]],
    ...(subjectIndex === 1 ? [['det', words[subjectIndex], words[0]]] : []),
  ];
  if (s.grammarRelations.length !== expected.length || expected.some(([rel,head,dependent]) =>
    s.grammarRelations.filter(a => a.rel === rel && a.head === head.tokenId
      && a.dependent === dependent.tokenId && a.parserStatus === 'settled').length !== 1)) {
    return fail('unsupported','PROFILE_ARCS','Settled English nsubj/dobj/det arcs must match exactly, without extra relations');
  }
  const node = w => ({ tokenId: w.tokenId, text: w.text, sourceSpan: [...w.sourceSpan] });
  const predication = {
    kind: 'ptgae.source-bound-spo-candidate.v0',
    subject: node(words[subjectIndex]), predicate: node(words[verbIndex]), object: node(words[objectIndex]),
    surfaceTokens: words.map(node), sourceSpan: [...s.sourceSpan],
    subjectDeterminer: subjectIndex === 1 ? node(words[0]) : null,
    objectDeterminer: node(words[determinerIndex]),
    syntacticRoleSource: 'english-algebra:role-frame+dependency-arcs',
    tense: 'uninterpreted', assertion: 'uninterpreted', evidenceForWorldClaim: false,
  };
  output.predications = [predication];
  output.status = 'admitted';
  return output;
}

/** Realize an admitted PTGAE fragment from preserved tokens. Does not inflect. */
export function realizePtgaeDirectSvo(compilation) {
  if (compilation?.kind !== 'ptgae.direct-svo-compilation.v0' || compilation.profile !== DIRECT_SVO_PROFILE
    || compilation.status !== 'admitted' || compilation.predications?.length !== 1) {
    throw new TypeError('Expected an admitted PTGAE direct-SVO compilation');
  }
  const words = compilation.predications[0].surfaceTokens;
  if (!Array.isArray(words) || !words.every(w => typeof w.text === 'string' && lexical.test(w.text))) {
    throw new TypeError('PTGAE surface tokens are invalid');
  }
  const text = words.map(w => w.text).join(' ') + '.';
  if (hash(text) !== compilation.source?.sha256 || text.length !== compilation.source?.utf16Length) {
    throw new RangeError('PTGAE realization does not preserve the certified source bytes');
  }
  let offset=0;
  for (const w of words) {
    if (!Array.isArray(w.sourceSpan) || w.sourceSpan[0] !== offset || w.sourceSpan[1] !== offset+w.text.length) {
      throw new RangeError('PTGAE realization has inconsistent source spans');
    }
    offset += w.text.length+1;
  }
  return text;
}
