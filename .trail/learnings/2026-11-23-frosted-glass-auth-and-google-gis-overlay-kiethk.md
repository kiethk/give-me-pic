---
title: Frosted glass mobile auth and Google GIS transparent overlay
author: Kiethk
date: 2026-11-23
branch: main
id: l-f47b2c91
scope: repo
status: active
src: agent
touches:
  - frontend/app/(auth)/layout.tsx
  - frontend/app/(auth)/login/page.tsx
  - frontend/app/(auth)/register/page.tsx
  - frontend/components/GoogleSignInButton.tsx
---

On mobile Safari/PWA, Google GIS iframe rendering (`google.accounts.id.renderButton`) injects dynamic DOM that conflicts with custom button CSS, resulting in awkward double borders, clipped badges, and localized user account previews. To produce a native mobile app appearance, do not apply CSS transforms or scales to the iframe; instead, render a custom native button (rounded-xl, SVG icon, typography) and layer an invisible Google GIS iframe (`opacity-[0.001] absolute inset-0 z-10`) directly above it to safely capture tap events while maintaining Google FedCM/OAuth compliance. Pair with a fullscreen background image and `backdrop-blur-2xl` frosted glass auth card for iOS mobile aesthetic.
