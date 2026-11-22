---
title: iOS camera empty MIME fallback and upload queue zombie recovery
author: Kiethk
date: 2026-11-22
branch: main
id: l-ef7dc644
scope: repo
status: active
src: agent
touches:
  - frontend/lib/use-upload-queue.ts
  - frontend/app/dashboard/upload/page.tsx
  - backend/src/main/java/com/givemepic/backend/media/service/MediaService.java
  - backend/src/main/java/com/givemepic/backend/common/config/SecurityConfig.java
---

## Decided
- iOS Safari camera capture (`input type="file" capture="environment"`) outputs `image.jpg` with empty MIME type (`file.type === ""`). FormData sets `application/octet-stream`, which backend rejected with 400.
- Resolved by inferring MIME type from file extension on frontend (`inferMimeType`) and backend fallback (`resolveImageContentType` in `MediaService.java`).
- Renamed camera captures to timestamped names (`photo_${Date.now()}_${idx}.jpg`) to prevent `image.jpg` collisions.
- Upload items in IndexedDB with status `uploading` can get stuck if app is closed or reloaded; queue initialization must recover zombie `uploading` items and UI must expose deletion/dismissal.
## Touches
- frontend/lib/use-upload-queue.ts
- frontend/app/dashboard/upload/page.tsx
- backend/src/main/java/com/givemepic/backend/media/service/MediaService.java
- backend/src/main/java/com/givemepic/backend/common/config/SecurityConfig.java
