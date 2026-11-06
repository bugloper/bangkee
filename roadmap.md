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
2. **Stock goes down on its own.** An itemized credit that sells
   2 × Rice 25 kg takes 2 off the count. Crossing that entry out puts the
   stock back.
3. **Restocking.** "Add stock" records what came in (+50) and when.
   Corrections ("counted 47, not 50") are logged too, so each item has a
   history of how its count moved.
4. **Low-stock warning.** The owner sets a level per item ("warn me under 5").
   Running low shows on the home screen and the Items list, with a
   notification.
5. **Out of stock is automatic.** At 0 the item reads "Out of stock" to
   customers; restocking brings it back. The in-stock switch stays for items
   without a count.

### What changes underneath

A line item on a credit entry stores the item's name only, not which item it
was. Stock can only follow sales once a line item links to its item, so this
needs a migration. Entries recorded before it stay as they are.

### Decisions to make first

- **Cash sales.** Bangkee records credit only, but most stock leaves a shop
  as cash sales. If only credit sales reduce stock, counts drift. Either add
  a quick "cash sale" entry that reduces stock without touching any
  customer's book, or keep to credit sales and let the owner correct counts
  by hand.
- **Units.** Whole numbers only (bottles, packets), or decimals for loose
  goods sold by weight (2.5 kg of rice)?
- **Cost and profit.** Should restocking record the buying price, so the
  owner sees stock value and margin? Useful, but more to fill in each time.
- **What customers see.** "Only 3 left", or just in stock / out of stock as
  now?
