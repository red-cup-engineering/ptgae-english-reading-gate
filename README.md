# PTGAE English Reading Gate

**Status:** private, tested source-admission *boundary*, not an installed English parser, full constrained-language compiler, evidence validator, or SignStack integration. Package: @red-cup-engineering/ptgae-english-reading-gate (0.1.0). Joint program: PlainEng / PTGAE.

## Actual upstream

[Lenticule Linguistics English language algebra](https://github.com/lenticule-science/linguistics-services-section/tree/main/services/english-language-algebra) provides an English-specific parser/tagger and semantic-role candidates. Its tagText() result contains English metadata and sentence records with word tags, arcs, role frames, folding and cohomology. A second package tree in [Lenticule Science](https://github.com/lenticule-science/science-services-section/tree/main/services/english-language-algebra) declares the same package identity at a different version and dependency graph; no package is deemed canonical by version number alone. See [Linguistics #6](https://github.com/lenticule-science/linguistics-services-section/issues/6).

This module accepts a **caller-provided** result shaped like the actual English tagText response and a purported pinned package version/source commit. Its caller must independently run and verify an installed English package and bind the exact result to the supplied source. The current gate **does not do** either of those steps and must not be represented as live end-to-end integration.

## Input and output contract

~~~js
import { receiveEnglishReading } from './src/admit-english-reading.mjs';

const received = receiveEnglishReading({
  sourceText: 'The teacher graded the exam.',
  sourceRevision: 'an-actual-source-revision-or-null',
  englishBundle: {
    package: '@lenticule-science/english-language-algebra',
    version: '0.1.2',
    sourceCommit: '40-real-hex-characters-required'
  },
  reading: actualEnglishTagTextResult
});
~~~

The example's sourceCommit is an intentionally invalid placeholder and cannot be used as-is. The gate checks that the supplied commit has the shape of a 40-hex Git revision, **not** that an installed package matches it. The caller must obtain an independent receipt for that match.

Output includes source SHA-256 and UTF-16 length, source-span-linked grammatical candidate relations, role candidates and the upstream cohomology reading, followed by explicit diagnostic codes. Candidate relation strings are anchored to unique token **instances**, not merged simply because two words have the same spelling. A missing/ambiguous binding, no usable arcs, an ungrounded role frame, or non-whitespace source content omitted by the returned sentence spans produces an **abstained** result. `source.coverage.uncoveredSpans` records excluded UTF-16 intervals; `source.coverage.complete` is true only when all non-whitespace source was covered by sentences. `roleCandidates` preserves the original upstream role frames, while `roleBindings` separately resolves the supported `verb`, `agent`, `patient`, `instrument`, `recipient` and `location` slots to unique source-word token IDs and spans. Null optional roles stay absent; repeated surface names, unsupported fields and missing predicates remain unresolved. These checks do not validate logical forms or certify the entire parser output.

The gate always returns empty signCellsAdmitted and executableEffects. Its interpretationAuthority is candidate-only. The parser's candidate relations cannot create positive/negative truth witnesses, approve a publication, or authorize a machine effect.

## Verified narrow tests

From this package directory: node --test test/*.test.mjs

The original twelve native Node tests cover a successful English-shaped past-tense parse, deterministic receipts, source text mismatch, missing pin, wrong language, bare-present-verb failure, repeated-token ambiguity, UTF-16 astral positions, malformed inputs. They were run locally under **Node v22.16.0** with twelve passes and no failures. This count includes three tests of the injected English tagText consumer, using fixtures rather than a resolved package. Six new local regression fixtures test exact role occurrence binding, repeated-token ambiguity, unknown fields, missing referents and incomplete sentence coverage. These fixtures exercise the receiver only, **not an installed Lenticule English parser**. The upstream English package itself has not been executed here. The upstream English package currently requests Node >=22.18; native upstream integration needs a compatible environment.

## Next typed stages

1. **Resolve the English package identity and source revision**: compare the science/linguistics variants, exports, morphology, parser/realizer tests and runtime consumers. Never silently use the larger version.
2. **Attach an independently verified source-level adapter**: call the exact admitted English parser in its matching environment, test source hash, compare candidate spans, and preserve uncertainty/alternatives.
3. **Construct typed propositions** with grounded referents and source testimony; admit witnesses via the real [SignCell](https://github.com/red-cup-engineering/computer-data-engineering-services-section/tree/main/apps/signcell) only when their predicates and sources are defensible. Candidate grammar is not world evidence.
4. **Compose SignChain derivations** under their typed rules and witnesses; **SignGraph** contextual restrictions/fibers for local readings; **SignCraft** settlement and provenance when their necessary inputs exist. Do not implement a second bilattice or sheaf Laplacian here.
5. **Constrain English grammar** with a versioned supported fragment, typed conditions and refusal/repair. Test roundtrip properties on that **bounded** fragment, and run human-reader task evaluation independently.

Sources: [English Science #59](https://github.com/lenticule-science/science-services-section/issues/59), [PlainEng theory #61](https://github.com/lenticule-science/science-services-section/issues/61), [PTGAE adapter #6](https://github.com/red-cup-engineering/ptgae-engineering-services-section/issues/6), [grammar compiler #7](https://github.com/red-cup-engineering/ptgae-engineering-services-section/issues/7), [sheaf semantics #8](https://github.com/red-cup-engineering/ptgae-engineering-services-section/issues/8).

## Direct English-package consumer interface

[consume-english-algebra.mjs](src/consume-english-algebra.mjs) provides a small adapter that calls an injected, synchronous English algebra `tagText(sourceText)` function and passes its result through this gate. For example, once the owner resolves and independently verifies the source package and version, a consuming service may import the selected package's public `./tag` subpath and supply its `tagText` function. This adapter **does not** resolve or authenticate packages, inject an English grammar, or certify a source hash. Its callback is caller-owned and must be trusted/pure; the adapter cannot prevent effects that an untrusted callback would perform on its own.

The direct-adapter tests verify invocation, response anchoring and refusal of an absent/asynchronous provider or source mismatch. The resulting gate still returns *candidate* relations, never witnessed SignCell claims or permission to act.
