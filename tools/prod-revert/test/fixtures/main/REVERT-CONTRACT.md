# Revert Contract

Each entry maps a PROD-REVERT marker id to its dev-form and prod-form patterns.

### r-dev

Gallery items use the mock table in dev.

```dev
Filter(
  MockBookings,
  Status = "Open"
)
```

```prod
Filter(Bookings, Status = "Open")
```

### r-prod

Environment flag.

```dev
Set(gEnv, "sandbox")
```

```prod
Set(gEnv, "production")
```

### r-unknown

Lookup source table.

```dev
LookUp(MockAccounts, ID = 1)
```

```prod
LookUp(Accounts, ID = 1)
```

### r-ambig

Patch target.

```dev
Patch(MockData
```

```prod
Patch(RealData
```

### r-two-sites

Submission helper used at two sites.

```dev
SubmitToMock(
```

```prod
SubmitToProd(
```

### r-nomarker

Entry with no marker anywhere in the source tree.

```dev
MockNothing()
```

```prod
ProdNothing()
```
