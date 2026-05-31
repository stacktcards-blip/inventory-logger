-- Allow cert-only slab rows created from physical stocktake when PSA/master_cards metadata
-- cannot yet be safely converted to Stackt's strict set_abbr + num + lang key.
-- metadata_status/parse_review fields carry the enrichment state until confirmed.

alter table slabs
  alter column set_abbr drop not null,
  alter column num drop not null,
  alter column lang drop not null;
