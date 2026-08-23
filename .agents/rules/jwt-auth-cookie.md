---
name: jwt-auth-cookie
description: Use when working on anything related to authentication - SecurityConfig, JwtAuthFilter, JwtService, cookie handling, CORS, or when a request that should be public is returning 401.
---

# JWT Auth via httpOnly Cookie

## Why httpOnly cookie instead of localStorage

The access/refresh tokens are stored in `httpOnly` cookies rather than `localStorage`. A cookie marked `HttpOnly` cannot be read by JavaScript (`document.cookie` won't see it), only the browser can send it automatically. This closes off the most common token-theft vector (XSS): even if malicious JS gets injected into the frontend, it cannot read the token to exfiltrate it.

The tradeoff: the browser must be told to actually send the cookie cross-origin, and the backend must explicitly write to a cookie instead of just returning JSON — both pieces have to be configured correctly together, or the whole thing silently doesn't work (see the three-part checklist below).

## The three parts that must move together

Authentication-related changes almost always touch these three files together. If one is missing or misconfigured, the others won't work even if individually correct:

1. **`SecurityConfig`** — declares which endpoints are `permitAll()` vs `authenticated()`, and registers CORS with `allowCredentials(true)`.
2. **`JwtAuthFilter`** — reads the token from the incoming `Authorization` header **or** cookie, and only sets the `Authentication` in the security context if a valid token is found. It must NOT reject or short-circuit the request just because a token is missing — it should always fall through to `filterChain.doFilter(...)` and let `SecurityConfig`'s rules decide whether the request is allowed.
3. **Frontend fetch calls** — must include `credentials: 'include'` on every request to the backend, or the browser will not attach the cookie cross-origin, no matter how correctly the backend is configured.

## Known failure mode: permitAll() endpoint still returns 401

This was hit directly during this project's development. Root cause checklist, in order of likelihood:

1. `JwtAuthFilter` is rejecting the request itself before `SecurityConfig`'s rules are even evaluated — check that the filter never returns an error response for a missing/invalid token, it should just skip setting the `Authentication` and continue the chain.
2. There are **two `SecurityFilterChain` beans** defined somewhere in the codebase (easy to accidentally leave behind from an earlier iteration) — Spring will only use one, and it may not be the one that was just edited. Search the whole codebase for `SecurityFilterChain` before assuming a single config file is authoritative.
3. `server.servlet.context-path` is set in `application.yml`, causing the actual URL to be prefixed (e.g. `/api/api/auth/register` instead of `/api/auth/register`) — check this before assuming the Security layer is at fault.
4. The `@RequestMapping` base path on the Controller doesn't match what's being called.

## CORS requirements for cookie-based auth

- `Access-Control-Allow-Credentials: true` must be set on the backend CORS config.
- `Access-Control-Allow-Origin` must be an exact origin (e.g. `http://localhost:3000`), never `*`, when credentials are involved — the wildcard is rejected by browsers in this scenario.
- Cookies should be set with `SameSite=Lax` (or `Strict` if the frontend and backend will always be same-site in production) and `Secure=true` in production (HTTPS only).

## When adding a new protected endpoint

State explicitly whether it should be public (`permitAll()`) or require authentication, and add it to `SecurityConfig` accordingly — do not rely on the default `anyRequest().authenticated()` catch-all without confirming that's the intended behavior for the new route.
