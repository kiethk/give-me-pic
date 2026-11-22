---
title: Replace settings tab with profile page and interactive user dropdown
author: Kiethk
date: 2026-11-22
branch: main
id: l-01a15d55
scope: repo
status: active
src: agent
touches:
  - frontend/app/dashboard/layout.tsx
---

Removed settings tab from navigation and moved /dashboard/settings to /dashboard/profile because the page currently only manages user profile data (avatar, name). Replaced the static sidebar user card with an interactive popover menu offering Profile and Log out options to streamline navigation.
