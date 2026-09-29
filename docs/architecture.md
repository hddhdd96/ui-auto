# Architecture

## Execution flow

```text
scripts/run-suite.sh
  └── products/<product>/run.sh
        └── scenarios/<scenario>.sh
              ├── lib/auth.sh
              ├── lib/http.sh
              ├── lib/logger.sh
              └── lib/report.sh
```

## Responsibilities

| Area | Responsibility |
| --- | --- |
| `scripts/` | Select and launch a suite with consistent exit handling |
| `products/` | Keep service-specific scenario sequencing together |
| `lib/` | Provide shared request, auth, logging, and reporting functions |
| `config/` | Document configuration keys without storing live credentials |
| `reports/`, `logs/` | Hold generated output locally; never commit execution evidence with sensitive data |

## Scenario lifecycle

Scenarios should validate prerequisites, perform one focused operation, check the response and resulting state, record a concise result, and clean up only resources created by that scenario. Shared helpers should return explicit status codes and useful error context.

## Safe extension points

Replace example product groups and add verified request contracts when adapting this layout. Keep secret resolution outside scenario files and sanitize response bodies before writing evidence.
