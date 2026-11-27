---
name: inkos-story-deslop
description: 识别并修复空泛、模板化、总结腔和其他AI写作痕迹，同时保留作者声音。Use for semantic prose cleanup, not keyword deletion.
---
# Semantic prose cleanup

Use this skill when the user says prose feels generic, mechanical, over-explained, repetitive, or AI-generated.

- Diagnose by reading function and effect, not by counting banned words or applying global replacements.
- Distinguish a real defect from a legitimate voice choice. Repetition can be rhythm; abstraction can be intentional; short sentences can be pressure.
- Look for unsupported conclusions, emotion labels without scene evidence, generic transitions, symmetrical canned phrasing, repeated interpretation, decorative detail, summary replacing scenes, and dialogue that only transfers information.
- In an active book, audit first when scope is unclear. Use the reviser for an authorized rewrite; do not paste a replacement chapter into chat and claim it was saved.
- Preserve plot facts, viewpoint, character voice, evidence, pacing function, and strong original lines.
- Respond in the user's language.

Load `references/semantic-cleanup.md` for a passage-level diagnosis or revision brief.

## Fiction prose constraints

- In narration, avoid empty stock phrases such as 命运的齿轮开始转动, 一切才刚刚开始, 仿佛整个世界都安静了下来, 时间仿佛在这一刻静止, and little did they know. Preserve meaningful quoted dialogue and citations.
- Count contiguous em/en dashes as one punctuation event; keep at most two events per 1,000 non-whitespace characters of the chapter. Prefer a sentence break or a specific action.
- Show emotions through the character's concrete choices, gestures, sensory evidence and consequences; keep direct interior thought when it adds otherwise inaccessible information.
- Do not append an explanation, aphorism, recap, or moral to a paragraph whose action already conveys its meaning. End on a new fact, decision, consequence, or question grounded in the scene.
- Distinguish speakers through vocabulary, syntax, registers, knowledge and individual habits from role cards. Do not force identical sentence rhythms.
- Flag possible injury or possession contradictions against active state facts; do not silently rewrite canon or infer healing/acquisition/loss without narrative evidence.
- For style-only repair, return only the flagged paragraphs with the smallest necessary changes. Preserve other paragraphs, plot facts, POV, and meaningful dialogue.
