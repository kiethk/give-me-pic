---
title: Move primary navigation to topbar and keep single chat history sidebar in Ask AI
author: Kiethk
date: 2026-11-22
branch: main
id: l-15013e38
scope: repo
status: active
src: agent
touches:
  - frontend/app/dashboard/layout.tsx
  - frontend/app/dashboard/settings/page.tsx
  - frontend/components/GoogleSignInButton.tsx
  - frontend/public/sw.js
  - frontend/app/dashboard/chat/page.tsx
---

## Decided
- Replaced the 220px desktop left sidebar with a top navigation bar (Ask AI, Subjects, Upload, Upgrade Pro, User Profile dropdown).
- Removed the redundant search input from the desktop topbar.
- Retained the chat history sidebar as the single sidebar inside the Ask AI page (/dashboard/chat) to eliminate cramped dual-sidebar layouts.

## Tried and ruled out
- Dual sidebars side-by-side (220px nav sidebar + 256px chat history sidebar): consumed ~500px horizontal space, severely squeezing chat bubbles.
- Embedding chat history inside a persistent global sidebar across all pages: created unnecessary layout weight when viewing Subjects or Upload pages.

## Touches
- frontend/app/dashboard/layout.tsx
- frontend/app/dashboard/chat/page.tsx
