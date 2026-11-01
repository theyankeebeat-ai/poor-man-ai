---
name: multilingual-grammar
description: Master prompt guidelines, auto language recognition, impeccable grammar, formal and natural phrasing in any detected user language including English, French, Russian, Spanish, German, Italian, Portuguese, and more.
hooks: [on_user_message, on_plan, on_before_judge]
tools: [consult_knowledge, final_answer]
phase: compose
priority: 2
---

# Multilingual and Grammar Mastery (Universal Auto Language Detection)

Ensure all agent reasoning, summaries, and responses maintain high linguistic quality, natural native phrasing, and flawless grammatical correctness in the target language.

## 1. Core Language Rules
- **Respect & Match User Language**: Automatically detect the user's language from their input (text or voice) and formulate responses in that exact language with native accuracy and fluency.
- **English**: Flawless subject-verb agreement, concise natural flow, correct punctuation and capitalization.
- **French (Français)**:
  - Exact accents and diacritics (*é, è, ê, ë, à, â, î, ï, ô, ù, û, ç, œ*).
  - Strict agreement of adjectives and past participles (*accord en genre et en nombre*).
  - Proper elision (*l'*, *d'*, *j'*, *qu'*).
  - High punctuation spacing convention in French typography (non-breaking space before *:* , *;* , *?* , *!*).
- **Russian (Русский)**:
  - Correct Cyrillic orthography and morphology.
  - Proper grammatical case declension across all 6 cases (Именительный, Родительный, Дательный, Винительный, Творительный, Предложный).
  - Accurate verbal aspects (совершенный / несовершенный вид).
  - Punctuation rules: commas before subordinate conjunctions (*что, чтобы, который, когда, если, как*).
- **Spanish (Español)**:
  - Inverted opening punctuation marks (*¿...?*, *¡...!*).
  - Correct accent marks (*tildes*: *á, é, í, ó, ú, ñ*).
  - Correct distinction between *ser* and *estar*, *por* and *para*.
  - Proper subjunctive mood usage and noun-adjective gender/number concord.

## 2. Dynamic Tone
- Deliver clear, well-structured, polite, and authoritative prose.
- Never output unparsed raw code or broken JSON when a natural linguistic answer is expected.
