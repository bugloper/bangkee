# Roadmap

Ideas agreed in principle but not built yet. Each one lists the decisions
that have to be made before work starts.

## Inventory: stock counts for a shop's items

Shops already keep items with a price, a category and an in-stock switch,
and itemized credit lets the owner pick items when recording what was taken.
Inventory adds a count to each item and keeps it right.

### What it would do

1. **A stock count on each item.** Optional, so items a shop does not count
   (a plate of momos, mobile recharge) carry on as now.
2. **Stock goes down on its own.** An itemized credit or a cash sale that
   sells 2 × Rice 25 kg takes 2 off the count. Crossing that entry or sale
   out puts the stock back.
3. **Restocking.** "Add stock" records what came in (+50) and when.
   Corrections ("counted 47, not 50") are logged too, so each item has a
   history of how its count moved.
4. **Low-stock warning.** The owner sets a level per item ("warn me under 5").
   Running low shows on the home screen and the Items list, with a
   notification.
5. **Out of stock is automatic.** Running low, customers see "Only 3
   left"; at 0 the item reads "Out of stock", and restocking brings it back. The in-stock switch stays for items
   without a count.

### What changes underneath

A line item stores the item's name only, not which item it was. That is
true of both credit lines (`line_items`) and cash-sale lines
(`sale_items`). Stock can only follow sales once a line links to its item,
so both need a migration. Entries and sales recorded before it stay as they
are.

### Decided

- **Cash sales.** Settled: cash sales shipped on every plan (Sales, from +).
  A sale picked from the shop's items reduces stock just as an itemized
  credit does, and crossing a sale out puts the stock back, so counts follow
  what actually leaves the shop. A sale typed as an amount names no items
  and leaves stock alone.
- **Units.** Whole numbers only (bottles, packets, bags). A counted item is
  sold in whole units; details such as "2.5 kg of rice" go in the entry's
  note.
- **Cost and profit.** Yes. Restocking records the buying price per unit,
  the item keeps the latest one, and the owner sees what the stock on the
  shelf is worth and the margin on each item.
- **What customers see.** "Only 3 left" when an item is running low, and
  "Out of stock" at 0.
