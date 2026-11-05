# Cedente issuance consolidation
- [ ] Add monthly and weekly issued nominal USD totals per cedente with date and cedente filters.
- [ ] Register the new section in navigation and role access settings.
- [ ] Test aggregation and verify the section with authenticated real records.

# CSV discount compatibility
- [x] Recognize percentage discount headers in the new CSV without replacing values with program defaults.
- [x] Preserve CSV discounts on program reassignment and register missing values automatically.
- [x] Run regression tests and verify authenticated CSV import and discount readback.

# Calendar (previous work)
- [ ] Add persisted daily signing status with Admin/Backoffice updates.
- [ ] Add monthly consolidated calendar with daily previews.
- [ ] Reuse Emisiones table for daily interaction and vector exports.
- [ ] Test status rules, permissions, and daily calendar flow.