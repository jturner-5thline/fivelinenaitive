# Match Client Contacts styling to Affiliated Contacts

The blue fill comes from the preferred client contact chip using the solid primary badge variant, and from the field having no outlined container of its own.

## Changes

In `src/components/deal/DealClientContactField.tsx`:

1. Wrap the chip row in the same outlined shell used by Affiliated Contacts:
   `min-h-8 rounded-md border border-input bg-background px-2 py-1 flex flex-wrap items-center gap-1.5`
   (the deal-detail CSS already restyles this shell to the #171B2C / indigo-border field look).
2. Drop the `variant={chip.isPreferred ? 'default' : 'secondary'}` switch — always use `variant="secondary"` so no chip renders with a solid blue fill.
3. Match chip geometry to the affiliated chips: `h-6 pl-2 pr-1 gap-1 text-xs font-normal max-w-full`.
4. Keep the preferred indicator, but express it with the star icon only (filled star = preferred, outlined/faded = not), plus the existing tooltip — no fill change.
5. Move the empty-state text and the add-contact trigger inside the new bordered shell so the field reads as one control, same as Affiliated Contacts.

No data, query, or mutation logic changes.
