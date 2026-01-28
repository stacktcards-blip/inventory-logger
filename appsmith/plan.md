# Appsmith Plan: Japan Email Purchase Logger

## Data Sources
- Supabase Postgres (use service role key for admin access).

## Queries
### 1) List sources needing review
```sql
select *
from purchase_sources
where parse_status in ('needs_review', 'parsed', 'approved')
order by received_at desc;
```

### 2) Get source detail + drafts
```sql
select *
from purchase_sources
where id = {{SourcesTable.selectedRow.id}};
```

```sql
select *
from purchase_drafts
where purchase_source_id = {{SourcesTable.selectedRow.id}}
order by line_no asc;
```

### 3) Update draft (inline edit)
```sql
update purchase_drafts
set
  card_name = {{DraftsTable.editedRow.card_name}},
  set_abbr = {{DraftsTable.editedRow.set_abbr}},
  card_num = {{DraftsTable.editedRow.card_num}},
  quantity = {{DraftsTable.editedRow.quantity}},
  price_jpy = {{DraftsTable.editedRow.price_jpy}},
  lang = {{DraftsTable.editedRow.lang}},
  notes = {{DraftsTable.editedRow.notes}},
  review_status = {{DraftsTable.editedRow.review_status}}
where id = {{DraftsTable.editedRow.id}};
```

### 4) Approve all drafts for a source
```sql
update purchase_drafts
set
  review_status = 'approved',
  reviewed_by = {{appsmith.user.email}},
  reviewed_at = now()
where purchase_source_id = {{SourcesTable.selectedRow.id}};
```

```sql
update purchase_sources
set parse_status = 'approved'
where id = {{SourcesTable.selectedRow.id}};
```

### 5) Commit source (call API)
Use a REST API datasource:
- POST {{API_BASE_URL}}/sources/{{SourcesTable.selectedRow.id}}/commit
- Body:
```json
{ "committed_by": "{{appsmith.user.email}}" }
```

Commit button should be disabled unless all drafts are approved and required fields are present:
- set_abbr
- num (mapped from `card_num`)
- lang
- purchase_price (mapped from `price_jpy`)
- purchase_date
- seller (mapped from `store`)

## Page Layout
### Inbox Page
- Table: `SourcesTable` showing `received_at`, `source_system`, `raw_subject`, `parse_status`.
- Filter controls for status.
- Button: "Open" to navigate to Source Detail.

### Source Detail Page
- Section: Raw email
  - Text widgets for subject/from/date/snippet
  - Large text area for `raw_body_text`
- Table: `DraftsTable` with inline edit enabled
- Buttons:
  - "Approve All Drafts"
  - "Commit to raw_cards" (disabled until all drafts approved)
  - "Reject Selected" (optional: set review_status='rejected')

## Notes
- Always require manual approval before commit.
- Use Appsmith access control to restrict approve/commit actions.
