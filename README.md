# API Automation Portfolio Sample

Closed-environment API automation, represented with a sanitized and portable project layout.

This sample demonstrates the organization of a shell-based automation framework: shared HTTP, authentication, logging, and reporting utilities are separated from product scenarios. Product names, endpoints, credentials, certificates, resource identifiers, customer data, and execution results are intentionally omitted.

## Layout

```text
api-auto/
├── config/
│   └── environments.example.env  # variable names and safe placeholder values
├── docs/
│   ├── architecture.md
│   └── scenario-template.md
├── lib/
│   ├── auth.sh                   # authentication interface
│   ├── http.sh                   # shared request interface
│   ├── logger.sh
│   └── report.sh
├── products/
│   ├── cloud-api/
│   │   ├── scenarios/
│   │   └── run.sh
│   ├── container-api/
│   │   ├── scenarios/
│   │   └── run.sh
│   └── storage-api/
│       ├── scenarios/
│       └── run.sh
├── reports/                      # generated output, ignored by Git
├── scripts/
│   └── run-suite.sh
├── .env.example
└── .gitignore
```

## Design

- `lib/` keeps request handling, authentication boundaries, log formatting, and result output reusable.
- `products/` groups product-specific flows and keeps each scenario small and independently runnable.
- `config/` documents configuration shape. Real environment files and secrets stay outside version control.
- `reports/` is reserved for generated artifacts and is excluded from commits.

The files are structural examples, not runnable checks against a real service. Add verified endpoints and request contracts only in an authorized environment.

## Configuration

Copy `.env.example` to a local environment file and supply values in your local environment. Never commit credentials, tokens, private keys, customer URLs, or captured responses containing customer data.

## Example workflow

```text
suite runner → product runner → scenario → shared HTTP/auth helpers → report
```

See [architecture](docs/architecture.md) and the [scenario template](docs/scenario-template.md).
