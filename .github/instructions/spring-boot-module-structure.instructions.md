---
name: spring-boot-module-structure
description: Use when creating a new backend feature, deciding where a new class (Controller, Service, Repository, DTO, Entity) should live, or when a new business module is being introduced.
---

# Spring Boot Module Structure (Modular Monolith)

## Package-by-feature, not package-by-layer

The backend is organized by **business module** at the top level, and only by technical layer *inside* each module. Do not create top-level packages like `controllers/`, `services/`, `repositories/` that span multiple business concerns — that is package-by-layer and is explicitly avoided here.

```
com.givemepic.backend/
├── auth/
│   ├── controller/
│   ├── service/
│   ├── repository/
│   ├── dto/
│   └── entity/
├── media/
│   ├── controller/
│   ├── service/
│   ├── repository/
│   ├── dto/
│   └── entity/
├── subject/
│   └── ...same layout...
├── rag/            # ocr_results, document_chunks, chunk_embeddings, chat, citations
│   └── ...same layout...
└── common/
    ├── config/     # SecurityConfig, CORS, general beans
    ├── security/   # JwtAuthFilter, JwtService
    ├── exception/  # global exception handler, custom exceptions
    └── response/   # shared response wrappers, if any
```

## Why this structure

Each module is self-contained: everything related to `media` (Controller, Service, Repository, DTOs, Entities) lives under `media/`. If `media` is later extracted into its own microservice, the entire package can be copied out with minimal hunting for scattered related code elsewhere.

## Rules when adding a new class

- A new Controller/Service/Repository/DTO/Entity goes into the package of the business module it belongs to, in the matching technical sub-package (`controller`, `service`, etc.), not into `common`.
- `common` is reserved for code with **no business meaning of its own** — cross-cutting concerns like security config, exception handling, generic response wrappers. If a class is specific to one module's use case, it does not belong in `common`, even if it's technically reusable.
- A module should depend on another module's **service layer only**, never directly on another module's repository or entity internals, to keep the boundary clean for a future extraction into a separate service.

## Naming conventions

- Controller: `{Feature}Controller` (e.g. `AuthController`, `PhotoController`)
- Service: `{Feature}Service` (interface optional at this project's scale; a single concrete class is acceptable for now)
- Repository: `{Entity}Repository` (e.g. `PhotoRepository`)
- Request/response DTOs: `{Action}Request` / `{Action}Response` (e.g. `RegisterRequest`, `AuthResponse`) — do not reuse Entities directly as request/response bodies.
- Entity: singular noun matching the table name in PascalCase (e.g. table `photos` → entity `Photo`)

## When introducing a brand-new module

Before creating the package, confirm with the user:
1. What is the module's single responsibility (one sentence)?
2. Which existing modules will it depend on (service layer only)?
3. Does it need its own set of database tables, or does it extend an existing module's tables?
