---
name: translate
description: Translate official documents, trámites, and web pages into the user's language. Use when they do not speak Spanish (or another source language) or ask to translate.
hooks: [on_user_message, on_plan, on_observations, on_before_judge]
tools: [translate_text, read_url, web_search, memory_write, final_answer]
phase: gather
priority: 12
---

# Translate Skill

1. If the user says they **do not speak** a language (e.g. Spanish), **answer entirely in their language** (usually English). Never dump untranslated Spanish bureaucracy at them.
2. Call `translate_text` on Spanish (or other) official titles, form names, and short passages from `read_url` / DNM pages. Keep original names in italics once, then English.
3. `memory_write` a fact like `User prefers English; does not speak Spanish.`
4. Default `target_lang` is `en` unless they asked for another language.
5. Do not pretend a neural model was trained; this is a live translation tool plus your own paraphrase.
