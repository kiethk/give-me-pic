---
title: Hide technical image filenames across UI for friendly labels
author: Kiethk
date: 2026-11-22
branch: main
id: l-e10d6e57
scope: repo
status: active
src: agent
touches:
  - frontend/app/dashboard/upload/page.tsx
  - frontend/app/dashboard/chat/page.tsx
  - "frontend/app/dashboard/subjects/[id]/page.tsx"
---

Raw filenames (image.jpg, IMG_XXXX.jpeg, photo_<timestamp>.jpg) are technical noise in user-facing mobile PWA views because students take camera shots where filenames are random numbers or generic WebKit defaults. In UI components (upload queue, failed cards, photo preview, and chat citation buttons), replace raw filenames with user caption if available, or clean contextual fallbacks ('Photo', 'Photo N', 'Source N', 'Photo preview'). Preserve raw filenames only for internal APIs and storage.
