# Walkthroughs, the permission matrix, and the honest limits.
module ManualPart3
  def self.render(pdf, facts)
    pdf.instance_exec(facts) do |facts|
      # -------------------------------------------------------- 13 walkthroughs
      chapter "A day in three roles",
        "The same app, seen from three sides. These follow the screens in order."

      subheading "Karma, who keeps a shop"
      steps [
        "Opens Bangkee from the home screen. <b>Home</b> shows total outstanding credit across " \
        "every customer, how many are overdue, what is sitting on the tables, and how many " \
        "transfer proofs are waiting.",
        "A customer takes rice and oil on credit. Karma opens their page from <b>Customers</b>, " \
        "taps <b>Itemised purchase</b>, adds two lines, and saves. The customer's phone buzzes.",
        "Four people sit down to eat. Karma opens a tab for <b>Table 4</b> and taps the usual " \
        "orders as they come — two beers, a fried rice, an ema datshi.",
        "They ask to put it on their account. Karma settles the tab <b>on the book</b>, and it " \
        "becomes one itemised credit on their page. Another table hands over most of what they " \
        "owe in cash and asks for the rest to go on the book — that is <b>part paid</b>, and " \
        "their page shows both the bill and the cash.",
        "The counter chimes: table 2 has scanned their card and ordered two more beers. " \
        "Karma taps <b>Accept</b> and the beers join that table's tab.",
        "A proof appears in <b>Proofs</b>. Karma opens the screenshot full screen, checks it " \
        "against the bank, and confirms — which records the payment and drops the balance.",
        "At closing time, <b>Home</b> shows what was repaid this month and who has been quiet " \
        "too long."
      ]

      subheading "Dawa, who buys on credit"
      steps [
        "Gets an invite link from the shopkeeper, opens it, and creates an account. Their page " \
        "at that shop is now theirs to read.",
        "<b>Home</b> shows the total owed across every shop they buy from, and each shop's " \
        "balance separately.",
        "Opening a shop shows every entry: what was taken, when, who recorded it, and the " \
        "running balance — including anything voided, struck through. If a tab is being run " \
        "up on their account right now, it shows under <b>Running now</b>, marked as not yet " \
        "on the balance.",
        "They pay by mobile banking. On the receipt they tap <b>Share</b> and pick Bangkee; " \
        "the amount and reference are read off it and the shop is matched automatically.",
        "They check the figures and send. It shows as <b>pending</b> until the shop confirms — " \
        "the balance has not moved yet, and the screen says so.",
        "The shop confirms. Their phone buzzes and the balance drops."
      ]

      subheading "The Bangkee operator"
      steps [
        "<b>Overview</b> shows what was approved this month, how many shops are on the platform, " \
        "how many are write-locked, and what is waiting.",
        "<b>Payments</b> lists subscription payments shop owners have sent, newest first, each " \
        "with its screenshot.",
        "Approving one extends that shop's paid period by the months it covers, clears any " \
        "lockout at once, and tells the owner. Rejecting asks for a reason the owner will read.",
        "<b>Shops</b> lists every shop with its owner and billing state."
      ]

      # -------------------------------------------------- 14 permission matrix
      chapter "Who may do what",
        "Enforced in the controllers, not only hidden in the interface. A link nobody can see " \
        "is still refused if it is typed in."

      data_table(
        [ "Action", "Owner", "Customer", "Operator" ],
        [
          [ "Read own shop's ledger", "Yes", "—", "No" ],
          [ "Read own account", "Yes", "Yes", "No" ],
          [ "Read another customer's account", "No", "No", "No" ],
          [ "Add or edit a customer", "Yes", "No", "No" ],
          [ "Record credit or payment", "Yes", "No", "No" ],
          [ "Edit or void an entry", "Yes", "No", "No" ],
          [ "Open and settle tabs", "Yes", "No", "No" ],
          [ "Order by scanning a table card", "—", "—", "—" ],
          [ "Accept or turn down an order", "Own shop", "No", "No" ],
          [ "Edit the menu and the tables", "Yes", "No", "No" ],
          [ "Publish bank details", "Yes", "No", "No" ],
          [ "Upload a payment proof", "No", "Own account", "No" ],
          [ "Confirm or reject a proof", "Own shop", "No", "No" ],
          [ "Print a statement", "Own shop", "Own account", "No" ],
          [ "Submit a subscription payment", "Yes", "No", "No" ],
          [ "Approve a subscription payment", "No", "No", "Yes" ],
          [ "See every shop's billing state", "No", "No", "Yes" ]
        ], widths: [ 230, 82, 96, nil ],
        align: { 1 => :center, 2 => :center, 3 => :center })

      body "One row sits outside the table entirely. <b>Ordering by scanning a table card</b> " \
           "belongs to none of the three roles: it is open to whoever is holding the card, " \
           "which is why it produces a request that somebody in the shop has to accept rather " \
           "than anything that moves money."

      body "Two rules cut across the table. An owner can only ever reach their own shop's " \
           "records — another shop's account, tab or proof is not found, not merely hidden. And " \
           "when a shop is write-locked for non-payment, every <i>Yes</i> in the owner column " \
           "that writes becomes a redirect to the billing screen, while every read stays open."

      # ------------------------------------------------------------- 15 limits
      chapter "Limits and what is not built",
        "Worth reading before promising anything to a shopkeeper. None of these is a bug; " \
        "they are the current edges."

      limits = [
        [ "Sharing receipts is Android-only",
          "Safari implements no share target, so on an iPhone Bangkee cannot appear in a bank " \
          "app's share sheet. Those customers upload a screenshot the ordinary way." ],
        [ "Reading receipts needs a key, and is unproven on real receipts",
          "Set ANTHROPIC_API_KEY to turn it on. No real BoB or mBoB receipt has been through it " \
          "yet — expect to tune the wording once they arrive." ],
        [ "A table card is a key to that table",
          "Anyone who can see it can send orders. They spend nobody's money — an order does " \
          "nothing until the counter accepts it — but cards left out overnight mean a queue to " \
          "clear in the morning." ],
        [ "A push cannot have its own sound",
          "No browser lets a web app choose its tone, so a push sounds like everything else on " \
          "that phone. Vibration carries the meaning instead." ],
        [ "The counter's chime needs one tap per device",
          "Browsers will not play sound until the page has been tapped. Staff turn it on once " \
          "per device." ],
        [ "Orders need a connection",
          "The counter re-checks every few seconds rather than holding a permanent connection, " \
          "but a table with no signal cannot send an order at all." ],
        [ "Opening and settling a tab need a connection",
          "Rounds added to a tab that already exists queue on the device like credits and " \
          "payments. Opening one offline would mean inventing an id on the phone; settling " \
          "offline would mean deciding a balance without the server." ],
        [ "The Dzongkha translation is not written",
          "The app is set up for it and the screens a customer reads are extracted, so anything " \
          "translated appears immediately and anything not yet translated stays English. What " \
          "is missing is a Dzongkha speaker to fill it in — inventing the words would be worse " \
          "than leaving English." ],
        [ "One shop per owner — on purpose",
          "The data model allows more, but nothing in the interface manages a second shop. " \
          "Nobody has asked for one, and re-scoping every query in the app is exactly where an " \
          "owner-sees-another-shop's-ledger bug would come from." ],

        [ "Reading a receipt is Claude, and costs money",
          "Every shared receipt is one API call. It is small, but it is not free, and it is the " \
          "only part of Bangkee that depends on a service outside it." ]
      ]

      limits.each do |title, explanation|
        start = cursor
        fill_color DocKit::AMBER
        font_size 11
        text_box "!", at: [ 0, start ], width: 14, style: :bold
        indent(16) do
          fill_color DocKit::INK
          font_size 10.8
          text title, style: :bold
          move_down 2
          fill_color DocKit::SOFT
          font_size 10
          text explanation, align: :justify, leading: 3.4
        end
        move_down 11
      end
    end
  end
end
