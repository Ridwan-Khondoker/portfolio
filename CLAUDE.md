# CRM Platform — Project Instructions

Read this before doing anything. These are standing rules, not suggestions.

## What this is

A multi-tenant CRM for agencies and dev shops: leads → proposals → clients →
projects → retainers, with time tracked against budget. Built first for our own
team's use, sold as a SaaS product later. The public portfolio site is a surface
of this same application, not a separate project.

Because it will be sold: tenancy, team permissions, and billing hooks are designed
in from the start. Nothing gets built "just for us."

## Stack

- Laravel 12, PHP 8.3
- MySQL 8
- Filament v4 (admin panels) + Livewire v3
- Blade for the public site
- Tailwind CSS
- Pest for tests
- Queue: database driver in dev, Redis in production

Do not introduce another framework, CSS library, or state management approach
without asking first.

## Architecture rules — do not break these

### Tenancy

Single database. Every tenant-owned table has a `tenant_id` column with a foreign
key and an index.

- Every tenant-owned model uses the `BelongsToTenant` trait, which applies a global
  scope and auto-fills `tenant_id` on create.
- Never write a raw query (`DB::table`, raw SQL) against a tenant-owned table. Go
  through Eloquent so the scope applies.
- Queued jobs and scheduled commands run outside request context. Pass the tenant
  ID into the job's constructor and resolve it explicitly in `handle()`. Never rely
  on ambient tenant state in a job.
- Every new tenant-owned model needs an isolation test asserting tenant A cannot
  read, update, or delete tenant B's records. A model without this test is not done.

### Permissions

`spatie/laravel-permission` in team mode, teams keyed to tenants. A user can hold
different roles in different tenants. Authorize through policies, never with
inline role-name string checks in controllers or Livewire components.

### API

Versioned under `/api/v1`. Sanctum tokens. Resource classes for all responses —
never return an Eloquent model directly. Write endpoints are rate-limited.

### Billing

Laravel Cashier with the Paddle driver (Stripe does not support Bangladesh-based
merchants). Plans and subscriptions exist in the schema from the start even while
everything is free. Feature gates read from the plan, never from hardcoded checks.

## Security rules

These come from problems we hit on a previous platform. They are not negotiable.

- Hash anything token-shaped before storing it: OTPs, invite codes, API tokens.
  Never store a credential in plaintext.
- No secrets in code or in committed config. `.env` only.
- Validate in Form Requests, not inline in controllers.
- Any file upload gets MIME and size validation, stored outside the public path.
- Never log request bodies that could contain client data.

## Conventions

- Migrations are additive. Never edit a migration that has run in production;
  write a new one.
- One concern per migration. Name them descriptively.
- Actions/service classes for business logic. Controllers and Livewire components
  stay thin.
- Enums are PHP backed enums, not string constants scattered through the codebase.
- Naming: singular models, plural tables, `snake_case` columns.
- Use `declare(strict_types=1);` in all new PHP files.

## Commands

```bash
php artisan test              # full suite — run before saying a task is done
php artisan test --filter=X   # single test
vendor/bin/pint               # format; run after any PHP change
php artisan migrate:fresh --seed   # reset local database
npm run dev                   # asset watcher
```

## How to work with me

- For anything structural (schema, tenancy, auth, billing), propose a plan and wait
  for approval before writing code.
- Small, reviewable changes. One concern per commit.
- Run the tests yourself and iterate until they pass. Do not hand back code you
  have not run.
- If a request conflicts with a rule in this file, say so instead of working around it.
- If you are unsure whether something is tenant-scoped, ask. Guessing here is how
  data leaks between customers.

## Current phase

Phase 1: tenancy foundation and team permissions. Nothing else gets built until a
tenant can be created, users invited with roles, and isolation tests pass.

Later phases, in order: CRM core (leads, clients, projects, time) → public portfolio
surface → public API → billing and self-serve signup.
