# The feature chapters: 05 getting in through 12 offline.
module ManualPart2
  def self.render(pdf, facts)
    pdf.instance_exec(facts) do |facts|
      # ---------------------------------------------------------- 05 getting in
      chapter "Getting in",
        "Shop owners let themselves in. Customers are let in by a shopkeeper, which is what " \
        "keeps a stranger from claiming somebody's page in the book."

      subheading "Opening a shop"
      body "The sign-up form asks for a name, the shop's name, an email address and a password. " \
           "Saving it creates the owner, the shop and a subscription in one go, and drops the " \
           "owner on a dashboard with nothing in it yet. The shop's name is required — a shop " \
           "without one is not a shop."

      subheading "Inviting a customer"
      body "Every account carries a private invite link. The owner opens a customer's page, taps " \
           "<b>Share the invite link</b>, and sends it to that person directly — the native share " \
           "sheet where the phone has one, a copy button otherwise. Opening the link shows the " \
           "shop's name and an explanation, then sign-up."

      callout "Send it to the person, not to a group",
        "Anyone holding the link can claim the account. The app says so on the invite screen. " \
        "An account can be claimed once: a second person opening the same link is turned away, " \
        "and so is a shop owner who opens it.", tone: :amber

      subheading "Signing in"
      body "Email and password. A signed-in session persists on the device, which matters for an " \
           "installed app — a shopkeeper should not be signing in every morning. Forgotten " \
           "passwords are reset by email link."

      # ------------------------------------------------------- 06 the credit book
      chapter "The credit book",
        "The heart of the app: one page per customer, every entry on it, and the running " \
        "balance at the top."

      subheading "Adding a customer"
      body "A name, and optionally a phone number. Nothing else is required, because a shopkeeper " \
           "adding a customer mid-transaction has no time for a form. The customer does not need " \
           "to have a phone, an email address, or any interest in the app — the page exists " \
           "whether or not they ever sign in."

      subheading "Recording credit"
      body "There are two ways, because shops keep two kinds of note. A <b>simple credit</b> is " \
           "one amount and a description — \"Groceries, Nu. 1,250\". An <b>itemised purchase</b> " \
           "is a list: name, quantity and unit price per line, adding itself up as you type. Use " \
           "the second when the customer will want to know what the total was made of."

      body "The amount field is deliberately large, and on a phone it comes with its own keypad " \
           "— thumb-sized digits rather than the system keyboard, because the entry is being made " \
           "one-handed behind a counter."

      subheading "Recording a payment"
      body "An amount and how it was paid — cash, mobile transfer, bank transfer or other. The " \
           "customer's outstanding balance is shown above the field so the shopkeeper can see " \
           "what a full settlement would be. Paying more than is owed is allowed: the account " \
           "simply goes into credit."

      subheading "Correcting a mistake"
      body "Two different tools for two different mistakes. <b>Edit</b> is for a typo — the wrong " \
           "amount, the wrong description — and is recorded in the audit log. <b>Void</b> is for " \
           "an entry that should not exist: it stays on the page, struck through, stops counting " \
           "toward the balance, and is signed and dated. Nothing is ever removed from the record."

      subheading "The statement"
      body "Every account has a printable statement: date, description, who recorded it, what was " \
           "given on credit, what was paid, and the running balance — with totals. It prints " \
           "without any of the app's navigation, so it can be handed over or filed."

      # ---------------------------------------------------------------- 07 tabs
      chapter "Tabs",
        "Restaurants, bars and snooker halls do not work the way the credit book does. Nobody " \
        "takes goods away: the customer sits down, orders through the evening, and settles when " \
        "they leave."

      body "A tab is a running bill. It has a label — \"Table 4\", \"Snooker 2\", or a name — and " \
           "optionally a customer already in the book. Items go on as they are ordered. The tab " \
           "list shows every table running, what each one is up to, and how long it has been open."

      subheading "Adding what they order"
      body "Two ways in. The <b>usual orders</b> chips add a line with one tap, and they are " \
           "learned from what this shop has actually sold — most ordered first, each at the price " \
           "it last went out at. Nobody maintains a price list. Anything unusual gets typed in " \
           "full. An item added by mistake comes straight off, because an open tab is not yet a " \
           "ledger entry."

      subheading "Settling"
      body "Three roads, and the difference matters."

      bullets [
        "<b>Paid</b> — cash or transfer handed over there and then. This raises no credit and no " \
        "payment, because nothing was ever owed. The tab itself is the record of the sale.",
        "<b>On the book</b> — one itemised credit on that customer's page, carrying every line. " \
        "From that moment it is an ordinary ledger entry: the customer sees it, it counts toward " \
        "their balance, and it can be voided like anything else.",
        "<b>Part paid</b> — some cash now, the difference on the book. This raises both entries: " \
        "the credit for the whole bill and a payment for what was handed over, so the page shows " \
        "what they took and what they gave rather than one netted-off number."
      ]

      callout "Why a paid tab raises nothing",
        "Recording a credit and immediately cancelling it with a payment would be tidy " \
        "double-entry and terrible for the person reading the page. The ledger's job is showing " \
        "what is outstanding; a meal that was paid for at the table was never outstanding."

      body "A tab opened by mistake, or a table that leaves without ordering, is closed without " \
           "charging. It stays on record as closed."

      subheading "What the customer sees"
      body "A tab opened against somebody already in the book shows on their own phone while it " \
           "runs — the lines, and what it comes to so far — under <b>Running now</b>. It says " \
           "plainly that it is not on their balance yet, because it is not: a tab reaches the " \
           "ledger only when the shop settles it, and only if it goes on the book. A walk-in's " \
           "tab, and a tab on somebody else's account, are invisible to them."

      # ------------------------------------------------------- 08 bank transfers
      # ------------------------------------------------------- 08 scan to order
      chapter "Scan to order",
        "A printed card on each table, a menu on the customer's own phone, and " \
        "a counter screen that makes a noise when something arrives. Nobody has to " \
        "walk over to take an order, and nobody has to download anything."

      body "Each table gets a card with its own QR code. A customer scans it with the " \
           "camera, reads the shop's menu, chooses what they want and sends it. It appears " \
           "at the counter within a few seconds, where somebody accepts it — and only then " \
           "does it join that table's tab."

      steps [
        "The owner adds the tables and the menu once, from <b>Settings</b>.",
        "<b>Print the table cards</b> gives a sheet of cards, two to a row. Cut them up and " \
        "put one on each table.",
        "A customer scans, orders, and sees that it has been sent.",
        "The counter screen shows it and chimes. <b>Accept</b> puts it on the table's tab; " \
        "<b>Turn down</b> asks for a reason the customer will read."
      ]

      subheading "Why an order is not a charge"
      body "The ordering pages are public — a diner is not a Bangkee user and will not sign " \
           "up to ask for a beer — so the code on the table is the whole of the " \
           "identification. That means anyone who can see a card can send an order from that " \
           "table. So an order is a <i>request</i>: it sits at the counter, it costs nobody " \
           "anything, and somebody in the shop decides. Accepting is what turns it into money " \
           "owed, and from that moment the lines are ordinary tab items."

      callout "Take the cards in if the shop is not secure",
        "A card left on an outside table overnight is an open invitation to send orders. " \
        "They will only ever sit unaccepted at the counter, but somebody still has to clear " \
        "them in the morning.", tone: :amber

      subheading "The menu"
      body "This is the one place Bangkee needs a real price list: a customer cannot be asked " \
           "to type \"Ema datshi 180\". Items can be grouped — Drinks, Food, Snooker — and " \
           "taken off for the day without deleting them. A shop that has already been running " \
           "tabs does not start from an empty page: the menu screen offers what it has been " \
           "selling, one tap each, at the price it last went out at."

      body "Prices always come from the menu and never from the customer's phone, and " \
           "quantities are capped. Changing a price later does not rewrite orders already " \
           "placed — each one keeps its own copy of what it cost."

      subheading "The counter"
      body "The counter screen re-checks every few seconds and chimes when something new " \
           "lands. Two things are worth knowing. <b>The sound has to be switched on once per " \
           "device</b> — browsers refuse to play audio until somebody has tapped the page, so " \
           "there is a Sound button and the choice is remembered on that phone or tablet. And " \
           "the owner gets the usual notification on their phone as well, for when nobody is " \
           "standing at the counter."

      body "A shop that has not paid its subscription still <i>receives</i> orders — the " \
           "diner does not owe Bangkee anything — but cannot accept them until billing is " \
           "sorted out."

      chapter "Paying by bank transfer",
        "Most settling up now happens by mobile banking rather than cash. The shop needs to " \
        "publish where the money should go, and to see proof that it went there."

      subheading "Publishing bank details"
      body "The owner adds one or more accounts — bank, account name, account number, and " \
           "optionally a branch, a mobile wallet number and free-text instructions. One is marked " \
           "primary and shown first. An account can be hidden from customers without deleting it."

      subheading "The customer's side"
      body "A customer who owes money sees the shop's details on their own page, transfers the " \
           "money in their banking app, and then taps <b>I've paid — upload proof</b>. They enter " \
           "the amount, attach a screenshot, and optionally add the bank's reference number and " \
           "a note."

      subheading "The owner's review"
      body "Pending proofs land in the <b>Proofs</b> queue with a count on the tab bar. Each one " \
           "shows the screenshot — which opens full screen in place, because the owner is " \
           "comparing a number against their bank statement and should not lose the queue — " \
           "along with the amount, the reference and who sent it."

      body "<b>Confirm</b> records a payment on that customer's account for the amount, links the " \
           "two together, and tells the customer. <b>Reject</b> asks for a reason, which the " \
           "customer is shown. Either way the decision is final: a reviewed proof cannot be " \
           "reviewed again."

      callout "A pending proof moves nothing",
        "Between upload and confirmation the balance is unchanged. The customer is told this on " \
        "the upload screen, so nobody believes a debt is cleared because a screenshot was sent."

      # ----------------------------------------------------- 09 shared receipts
      chapter "Sharing a receipt from your bank",
        "Bhutanese banking apps end a transfer on a receipt screen with a Share button. " \
        "Bangkee can be one of the things you share it to."

      body "Share the receipt and it arrives in Bangkee as a picture. Claude reads the amount, " \
           "the reference, the date and who was paid; Bangkee works out which shop that was by " \
           "comparing the beneficiary against the bank details each shop published; and the " \
           "customer is shown the result to check before it is sent. What they confirm is an " \
           "ordinary payment proof — the shop still confirms it afterwards."

      steps [
        "Finish the transfer in BoB, mBoB, BNB or PNB and tap <b>Share</b> on the receipt.",
        "Choose <b>Bangkee</b> from the share sheet.",
        "Bangkee reads the receipt — a few seconds — and shows what it found.",
        "Check the amount, pick the shop if it could not be worked out, and send."
      ]

      callout "Android only, and only once installed",
        "This uses the Web Share Target API. Safari implements no such thing, so on an iPhone " \
        "Bangkee will never appear in a bank app's share sheet and payments are entered by hand " \
        "instead. Both screens say so rather than leaving people hunting for it.", tone: :amber

      subheading "What happens when it cannot read it"
      body "A blurred photo, an unfamiliar layout, a screen that is not a completed transfer, or " \
           "no reading service configured at all — every one of these ends at the same place: the " \
           "ordinary form, with the picture already attached and the fields empty. Reading a " \
           "receipt is a convenience, never a dependency. Fields it is unsure of are left blank " \
           "rather than guessed, because a wrong amount on a payment claim is worse than a " \
           "missing one."

      # ------------------------------------------------------- 10 subscription
      chapter "Subscription and billing",
        "Bangkee is sold to shop owners at Nu. #{facts["price"]} a month. " \
        "There is no card payment: the owner transfers the money and sends a screenshot, and " \
        "a person approves it."

      data_table(
        [ "State", "What it means", "Can the owner write?" ],
        [
          [ "Trial", "The first #{facts["trial_days"]} days, free", "Yes" ],
          [ "Active", "Paid through a date in the future", "Yes" ],
          [ "Payment due", "The paid period ended; #{facts["grace_days"]} days of grace are running", "Yes, with a warning on every screen" ],
          [ "Inactive", "Grace exhausted with no approved payment", "No" ]
        ], widths: [ 86, nil, 150 ])

      body "The state is worked out from the server's clock every time it is asked, not stored " \
           "and trusted, so nothing on a customer's or shopkeeper's device can buy an extra day."

      subheading "Paying"
      body "The billing screen shows the operator's bank details and instructions. The owner " \
           "transfers the money, then submits the amount, how many months it covers, an optional " \
           "reference and a screenshot. It appears as pending until a platform administrator " \
           "approves it."

      subheading "What lockout actually does"
      body "In the inactive state the owner can still open every screen, read every page, print " \
           "every statement and reach billing. What stops is writing: no new customers, credits, " \
           "payments, voids, tabs, bank details or proof confirmations. The buttons that would " \
           "write lead to the billing screen instead of to a form that would only refuse them."

      callout "Approval restores everything immediately",
        "An approved payment extends the paid period from the later of today or the existing " \
        "end date — so cover is never lost and never double-counted — clears the lockout, and " \
        "tells the owner.", tone: :green

      # ----------------------------------------------------- 11 notifications
      chapter "Notifications",
        "Every event that matters reaches the person it concerns three ways: a row in the " \
        "app's own notification centre, a push notification on their phone, and an email."

      data_table(
        [ "When this happens", "This person hears about it" ],
        [
          [ "Credit recorded", "The customer" ],
          [ "Payment recorded", "The customer" ],
          [ "Entry voided", "The customer" ],
          [ "A customer joins through an invite", "The shop owner" ],
          [ "An account goes overdue (checked daily)", "Both the owner and the customer" ],
          [ "Payment proof submitted", "The shop owner" ],
          [ "Proof confirmed or rejected", "The customer" ],
          [ "Subscription payment submitted", "Every platform administrator" ],
          [ "Subscription payment approved or rejected", "The shop owner" ]
        ], widths: [ 230, nil ])

      body "All three are sent in the background. A mail server being down or a phone that has " \
           "uninstalled the app can never stop a credit being recorded — the ledger is written " \
           "first and the telling happens afterwards."

      subheading "Turning push on"
      body "Bangkee asks for notification permission <i>after</i> something worth being notified " \
           "about — a recorded credit, a submitted proof — and never on arrival, where the answer " \
           "is always no. Declining is remembered on that device. On an iPhone push works only " \
           "once the app is on the home screen."

      # ------------------------------------------------------ 12 install/offline
      chapter "Installing and working offline",
        "A shop with two bars of signal is the normal case, not the exception. What the app " \
        "does when the connection goes is a feature, not an error screen."

      subheading "Installing"
      body "On Android the browser offers to install it and Bangkee shows a card saying so. On " \
           "an iPhone Safari cannot install anything by itself, so Bangkee explains the Share → " \
           "Add to Home Screen route in a sheet of its own. Installed, it runs full screen with " \
           "its own icon — which is also when iPhone notifications and Android share-target " \
           "sharing start working."

      subheading "Reading offline"
      body "Pages already visited come back from the device's own cache, with a banner saying " \
           "the connection is gone and the figures are the last ones this phone loaded."

      subheading "Writing offline"
      body "Credits and payments recorded with no signal are kept on the phone and sent when the " \
           "connection returns. They appear under <b>Waiting to send</b> on the customer's page — " \
           "they exist nowhere else yet — and each carries a key so that a retry cannot enter the " \
           "same thing in the book twice. The browser also replays the queue in the background " \
           "after the app has been closed, where it supports that; on an iPhone it replays when " \
           "the app is next open."

      body "Rounds added to a tab that is already open queue in the same way, which covers the " \
           "case that actually happens: a bar with no signal, adding drinks all evening. Both " \
           "the typed form and the one-tap chips keep them on the phone, and each round carries " \
           "a key so a replay cannot put the same beer on the bill twice."

      callout "What does not queue",
        "Opening or settling a tab, and anything with a photo attached — proofs, subscription " \
        "payments, shared receipts. A half-sent picture is worse than an honest failure; and " \
        "opening a tab offline would mean inventing an id on the phone, while settling offline " \
        "would mean deciding a balance without the server.", tone: :amber

      subheading "Language"
      body "Bangkee is written in English and set up to be read in Dzongkha. The translation " \
           "itself is not finished — what is in place is the machinery and the screens a " \
           "customer reads. Anything not yet translated shows in English rather than breaking, " \
           "so the translation can be filled in a screen at a time and used at every stage. A " \
           "signed-in person picks their language in <b>Settings</b>, and it follows them to " \
           "their next phone."
    end
  end
end
