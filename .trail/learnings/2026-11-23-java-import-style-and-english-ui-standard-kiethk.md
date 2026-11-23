---
title: Java top-level imports and English language standard
author: Kiethk
date: 2026-11-23
branch: main
id: l-a81d9f42
scope: repo
status: active
src: agent
touches:
  - backend/src/main/java/com/givemepic/backend/
  - frontend/app/
  - frontend/components/
  - frontend/lib/
---

In this repository, inline fully-qualified Java class names (e.g. `org.springframework.http.HttpHeaders.CACHE_CONTROL`, `org.springframework.dao.DataIntegrityViolationException`) are strictly prohibited in method bodies and signatures; all external classes must be imported at the top of the file via `import` statements. Additionally, the application standard language is English: all frontend UI text, buttons, aria-labels, bottom sheets, toast messages, API client error messages, backend validation messages, and system prompts must be written in English.
