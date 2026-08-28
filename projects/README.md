# Product suites

Create one isolated directory per stable Tower product code:

```text
projects/
  PRODUCT-CODE/
    tests/
    pages/
    fixtures/
```

Keep product-specific selectors, fixtures, and credentials inside that product's
boundary. A newly registered product intentionally starts with only `.gitkeep`
and runs successfully with 0 tests. Credentials enter through environment
variables and must not be committed.
