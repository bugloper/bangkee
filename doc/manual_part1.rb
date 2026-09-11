# Cover, contents, what it is, roles, vocabulary, money rules.
module ManualPart1
  def self.render(pdf, facts)
    pdf.instance_exec(facts) do |facts|
      # ------------------------------------------------------------------ cover
      fill_color DocKit::BRAND
      fill_rectangle [ -62, cursor + 64 ], 595, 300

      brand_mark size: 58, at: [ 0, cursor + 6 ], inverse: true
      move_down 96
      fill_color "ffffff"
      font_size 34
      text "Bangkee", style: :bold
      font_size 15
      move_down 2
      text "How the app works"
      move_down 10
      font_size 10.5
      fill_color "c4d2ff"
      text "The shared credit book for shops in Bhutan —\nwhat it does, who it is for, and the rules it keeps.",
           leading: 4

      move_down 96
      fill_color DocKit::INK
      font_size 11
      text "A shopkeeper writes what a customer owes in a notebook. Only the shopkeeper " \
           "can see it, it is easy to lose, and when the two of them disagree there is " \
           "nothing to check. Bangkee replaces that notebook with a ledger both of them " \
           "can open — on the shopkeeper's phone and on the customer's — and keeps the " \
           "rules a book of debts has to keep.",
           align: :justify, leading: 4

      move_down 28
      fill_color DocKit::MUTED
      font_size 9
      text "Rails 8 · Hotwire · installable as a PWA"
      text "Generated #{Time.now.strftime("%-d %B %Y")} from the code at commit " \
           "#{facts["commit"]}. The figures in it — trial length, grace period, overdue"
      text "window, accepted image types — are read out of the application at build time."

      # --------------------------------------------------------------- contents
      start_new_page
      furnish
      fill_color DocKit::INK
      font_size 20
      text "What is in here", style: :bold
      move_down 14

      contents = DocKit::CHAPTERS.each_with_index.map do |(title, blurb), index|
        [ format("%02d", index + 1), title, blurb ]
      end

      contents.each do |number, title, blurb|
        start = cursor
        page = DocKit.toc[number.to_i]
        fill_color DocKit::TINT
        font_size 13
        text_box number, at: [ 0, start ], width: 30, style: :bold
        fill_color DocKit::INK
        font_size 11.5
        text_box title, at: [ 34, start ], width: 240, style: :bold
        fill_color DocKit::MUTED
        font_size 9.5
        text_box blurb, at: [ 272, start - 1 ], width: bounds.width - 300
        if page
          fill_color DocKit::BRAND
          font_size 10
          text_box page.to_s, at: [ bounds.width - 24, start - 1 ], width: 24, align: :right, style: :bold
        end
        move_down 24
      end

      # ------------------------------------------------------------ 01 what for
      start_new_page
      chapter "What Bangkee is for",
        "Small shops in Bhutan sell on credit. A customer takes rice today and settles at " \
        "the end of the month; a table orders through the evening and pays when it leaves. " \
        "That trust is recorded in a notebook behind the counter."

      body "The notebook works until it does not. Only one side can read it, so the customer " \
           "has no way to check what they owe until they are asked to pay it. It goes missing, " \
           "gets wet, or runs out of pages. Entries are written in a hurry and crossed out " \
           "later, so a disagreement comes down to whose memory is better. And nothing in it " \
           "adds up by itself — working out what the whole shop is owed means reading every page."

      body "Bangkee is that notebook, shared. The shopkeeper records what was taken and what " \
           "was paid; the customer opens the same ledger on their own phone and sees the same " \
           "numbers. Neither of them has to remember anything, and neither of them can quietly " \
           "change history — entries are never deleted, only voided, and every void is signed " \
           "and dated."

      callout "The one idea to take away",
        "A balance in Bangkee is never typed in. It is always the sum of entries that are " \
        "still standing — credits minus payments — so the number and its explanation can " \
        "never disagree with each other."

      heading "What it is, technically"
      body "One Rails 8 application, served over the web and installable on a phone as a PWA. " \
           "There is no separate mobile app to download from a store: the shopkeeper opens it " \
           "in the browser once, adds it to the home screen, and from then on it behaves like " \
           "an app — full screen, its own icon, working when the signal drops, and able to send " \
           "notifications."

      # --------------------------------------------------------------- 02 roles
      chapter "Who uses it",
        "Three kinds of people sign in, and Bangkee shows each of them a different app. " \
        "Nobody chooses their role: it follows from how their account came to exist."

      subheading "Shop owner"
      body "Signs up by opening a shop. Keeps the book: adds customers, records credit and " \
           "payments, runs tabs, confirms bank transfers, and pays Bangkee's own subscription. " \
           "Sees five destinations — <b>Home, Tabs, Customers, Proofs, Settings</b>."

      subheading "Customer"
      body "Never signs up alone; they arrive through an invite link a shopkeeper shares. They " \
           "can read their own ledger at every shop they buy from, print a statement, and prove " \
           "a bank transfer — and they can change nothing. Sees two destinations — " \
           "<b>Home and Alerts</b>."

      subheading "Platform administrator"
      body "The person running Bangkee itself. Reviews the subscription payments shop owners " \
           "send in, and can see every shop's billing state. They are not a shopkeeper and not " \
           "a customer, and they never see anybody's ledger. Sees three destinations — " \
           "<b>Overview, Payments, Shops</b>."

      subheading "And the people who never sign in"
      body "A diner who scans the card on their table is none of the three. They have no " \
           "account, they are identified only by the code on the card, and everything they " \
           "can do — read the menu, send an order — is a request somebody in the shop has to " \
           "accept. See <b>Scan to order</b>."

      callout "A customer is never locked out",
        "Whatever happens between a shop and Bangkee — an unpaid subscription, an expired " \
        "trial — the customer's access to their own ledger is never affected. Their money is " \
        "their business, not a lever.", tone: :green

      # ---------------------------------------------------------- 03 vocabulary
      chapter "The vocabulary",
        "Six words do most of the work. They are worth getting right, because the screens " \
        "use them consistently and so does everyone who supports the app."

      data_table(
        [ "Word", "What it means" ],
        [
          [ "Shop", "One business, belonging to one owner. Everything else hangs off it." ],
          [ "Account", "One customer's page in the book. It belongs to the shop, and carries " \
                       "the customer's name whether or not they have ever signed in." ],
          [ "Credit", "Something taken and not yet paid for. It increases what the customer owes." ],
          [ "Payment", "Money coming back. It decreases what the customer owes." ],
          [ "Balance", "Credits minus payments, cached on the account. Positive means the " \
                       "customer owes the shop; negative means they have paid in advance; " \
                       "zero means settled." ],
          [ "Void", "The way an entry is undone. It stays visible, struck through, out of the " \
                    "balance, and recorded in the audit log." ]
        ], widths: [ 92, nil ])

      heading "Money"
      body "Every amount is stored as a whole number of chetrum — hundredths of a Ngultrum — " \
           "so nothing is ever lost to rounding. Amounts are shown as <b>Nu. 1,250</b> when they " \
           "are whole and <b>Nu. 1,250.50</b> when they are not, and figures line up in columns " \
           "so they can be scanned rather than read."

      heading "Overdue"
      body "An account is overdue when it owes money and nothing has happened on it for longer " \
           "than the shop allows — <b>#{facts["credit_due_days"]} days</b> by default. An account " \
           "that is settled, or in credit, is never overdue no matter how long it has been quiet."

      # -------------------------------------------------------- 04 money rules
      chapter "The rules that govern money",
        "These are enforced in the models, so they hold identically on every screen and " \
        "cannot be worked around by finding a different button."

      rules = [
        [ "A balance is derived, never entered",
          "It is recomputed from the entries that are still standing every time one is saved, " \
          "edited, voided or removed." ],
        [ "Nothing is ever deleted",
          "An entry is voided: it stays on the page struck through, stops counting, and the void " \
          "is written to an append-only audit log with who did it and when." ],
        [ "An itemised purchase adds itself up",
          "When a credit has items, the total comes from the items. There is no amount field to " \
          "disagree with the list." ],
        [ "A proof is a claim, not a payment",
          "A customer's uploaded transfer proof changes nothing until the shop owner confirms it. " \
          "Confirming is what creates the payment." ],
        [ "An open tab is not a balance",
          "Items on a running tab are owed by nobody until the tab is settled — the customer is " \
          "still ordering, and may well pay cash." ],
        [ "Only writing can be locked",
          "An unpaid subscription stops a shop owner recording anything new. It never stops them " \
          "reading, and it never touches their customers." ]
      ]

      rules.each do |title, explanation|
        start = cursor
        fill_color DocKit::BRAND
        font_size 10.5
        text_box "§", at: [ 0, start ], width: 16, style: :bold
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
