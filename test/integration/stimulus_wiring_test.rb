require "test_helper"

# The bugs that reached the user were all the same shape: markup referring to a
# Stimulus target, value or action that was not there, or was out of the
# controller's scope. Nothing in a Rails suite notices that, so this walks every
# screen and checks the wiring against the controllers themselves.
class StimulusWiringTest < ActionDispatch::IntegrationTest
  CONTROLLER_DIR = Rails.root.join("app/javascript/controllers")

  # --------------------------------------------------------------- the checks
  test "every data-action names a controller and a method that exist" do
    each_element_with_attribute("data-action") do |element, descriptors, path|
      descriptors.split(/\s+/).each do |descriptor|
        next if descriptor.blank?

        identifier, method = parse_action(descriptor)
        next if identifier.nil?   # a bare event name, e.g. "submit"

        controller = controllers[identifier]
        assert controller, "#{path}: data-action=\"#{descriptor}\" names no controller (have: #{controllers.keys.sort.join(", ")})"
        assert_includes controller[:methods], method,
          "#{path}: data-action=\"#{descriptor}\" — #{identifier}_controller.js has no ##{method}"
        assert_in_scope element, identifier, path, "data-action=\"#{descriptor}\""
      end
    end
  end

  test "every data-*-target is declared by its controller and inside its scope" do
    seen = 0

    each_attribute do |element, name, value, path|
      next unless name.start_with?("data-") && name.end_with?("-target")

      identifier = name.delete_prefix("data-").delete_suffix("-target")
      assert controllers.key?(identifier),
        "#{path}: #{name} names no controller (have: #{controllers.keys.sort.join(", ")})"
      seen += 1

      value.split(/\s+/).each do |target|
        assert_includes controllers[identifier][:targets], target,
          "#{path}: #{name}=\"#{target}\" — #{identifier}_controller.js does not declare that target"
      end
      assert_in_scope element, identifier, path, name
    end

    # A guard on the guard: an earlier version of this test skipped every
    # attribute through an off-by-one and could not fail.
    assert_operator seen, :>=, 8, "the target check examined almost nothing — it is broken"
  end

  test "every data-*-value is declared by its controller and inside its scope" do
    seen = 0

    each_attribute do |element, name, _value, path|
      next unless name.start_with?("data-") && name.end_with?("-value")

      inner = name.delete_prefix("data-").delete_suffix("-value")
      identifier = controllers.keys.sort_by { |key| -key.length }.find { |key| inner.start_with?("#{key}-") }
      assert identifier, "#{path}: #{name} names no controller (have: #{controllers.keys.sort.join(", ")})"
      seen += 1

      declared = controllers[identifier][:values]
      attribute_name = name.delete_prefix("data-#{identifier}-").delete_suffix("-value")
      camelised = attribute_name.split("-").each_with_index.map { |part, i| i.zero? ? part : part.capitalize }.join

      assert_includes declared, camelised,
        "#{path}: #{name} — #{identifier}_controller.js does not declare the value #{camelised}"
      assert_in_scope element, identifier, path, name
    end

    assert_operator seen, :>=, 4, "the value check examined almost nothing — it is broken"
  end

  # A <button> in a form submits it unless told otherwise, so a Stimulus button
  # inside a form without type="button" fires its action AND posts the form.
  test "no Stimulus button inside a form can submit it by accident" do
    pages.each do |path, document|
      document.css("form button[data-action]").each do |button|
        assert_equal "button", button["type"],
          "#{path}: <button data-action=\"#{button["data-action"]}\"> inside a form needs type=\"button\""
      end
    end
  end

  test "every icon-only control says what it does" do
    pages.each do |path, document|
      document.css("button, a").each do |control|
        next if control.text.strip.present?
        next if control["aria-label"].present? || control["title"].present?

        flunk "#{path}: a control with no text and no aria-label: #{control.to_html.first(120)}"
      end
    end
  end

  test "every controller a page declares is a controller that exists" do
    each_element_with_attribute("data-controller") do |_element, value, path|
      value.split(/\s+/).each do |identifier|
        assert controllers.key?(identifier),
          "#{path}: data-controller=\"#{identifier}\" has no app/javascript/controllers/#{identifier.tr("-", "_")}_controller.js"
      end
    end
  end

  test "every controller with targets is used somewhere, and every page parses" do
    assert_predicate pages, :any?
    used = pages.values.flat_map { |doc| doc.css("[data-controller]").map { |el| el["data-controller"].split(/\s+/) } }.flatten.uniq

    (controllers.keys - used).each do |unused|
      flunk "#{unused}_controller.js is never attached to anything — dead code or missing markup"
    end
  end

  private
    # ------------------------------------------------------------- controllers
    def controllers
      @controllers ||= Dir[CONTROLLER_DIR.join("*_controller.js")].to_h do |file|
        source = File.read(file)
        identifier = File.basename(file, "_controller.js").tr("_", "-")

        [ identifier, {
          targets: source[/static targets\s*=\s*\[([^\]]*)\]/, 1].to_s.scan(/["']([^"']+)["']/).flatten,
          values: source[/static values\s*=\s*\{(.+?)\n\s*\}/m, 1].to_s.scan(/(\w+)\s*:/).flatten,
          # Two-space indentation is the class body; anything deeper is a nested
          # function, not an action target.
          methods: source.scan(/^  (?:async\s+)?(\w+)\s*\(/).flatten
        } ]
      end
    end

    def parse_action(descriptor)
      body = descriptor.include?("->") ? descriptor.split("->", 2).last : descriptor
      return [ nil, nil ] unless body.include?("#")

      identifier, method = body.split("#", 2)
      [ identifier.split(":").first, method.split(":").first ]
    end

    # Stimulus resolves a target or an action against the nearest ancestor
    # carrying that controller — this is what the notifications sheet got wrong.
    def assert_in_scope(element, identifier, path, description)
      scope = [ element, *element.ancestors ].find do |node|
        node.respond_to?(:[]) && node["data-controller"].to_s.split(/\s+/).include?(identifier)
      end

      assert scope, "#{path}: #{description} has no ancestor with data-controller=\"#{identifier}\""
    end

    # ------------------------------------------------------------------ pages
    def each_attribute
      pages.each do |path, document|
        document.css("*").each do |element|
          element.attribute_nodes.each { |attribute| yield element, attribute.name, attribute.value, path }
        end
      end
    end

    def each_element_with_attribute(name)
      pages.each do |path, document|
        document.css("[#{name}]").each { |element| yield element, element[name], path }
      end
    end

    # Every screen that carries any Stimulus wiring, for all three roles.
    def pages
      @pages ||= {}.tap do |collected|
        owner = create_owner
        shop = owner.shop
        account = create_account(shop, name: "Tashi Wangmo")
        record_credit(account, amount_cents: 100_000, by: owner, description: "Groceries")
        itemize(account, owner)
        shop.bank_accounts.create!(bank_name: "BoB", account_name: "Karma", account_number: "1023", primary: true)

        customer = create_customer
        customer_account = create_account(shop, name: "Dawa Tashi", customer: customer)
        record_credit(customer_account, amount_cents: 50_000, by: owner)
        proof = build_proof(customer_account, customer)
        payment = build_subscription_payment(shop, owner)

        tab = shop.tabs.create!(label: "Table 4", opened_by: owner)
        tab.tab_items.create!(name: "Beer", quantity: 2, unit_price_cents: 12_000, added_by: owner)
        settled = shop.tabs.create!(label: "Table 5", opened_by: owner)
        settled.tab_items.create!(name: "Momo", unit_price_cents: 8_000, added_by: owner)
        settled.settle_paid!(by: owner, method: "Cash")

        shop_table = shop.shop_tables.create!(name: "Table 9")
        shop.menu_items.create!(name: "Beer", price_cents: 12_000, category: "Drinks")
        waiting_order = shop.table_orders.create!(shop_table: shop_table, placed_at: Time.current)
        waiting_order.table_order_items.create!(name: "Beer", quantity: 2, unit_price_cents: 12_000)

        gather collected, owner, [
          tabs_path, new_tab_path, tab_path(tab), tab_path(settled),
          orders_path, menu_items_path, shop_tables_path,
          edit_shop_table_path(shop_table), cards_shop_tables_path,
          dashboard_path, accounts_path, new_account_path, edit_account_path(account),
          account_path(account), new_account_credit_path(account),
          new_account_credit_path(account, mode: "itemized"), new_account_payment_path(account),
          edit_transaction_path(account.transactions.first), account_statement_path(account),
          account_invite_path(account), payment_proofs_path, bank_accounts_path,
          new_bank_account_path, edit_bank_account_path(shop.bank_accounts.first),
          settings_path, subscription_path, notifications_path
        ]

        # Both states of a shared bank receipt: still being read, and read.
        waiting = shared_receipt_for(customer)
        read = shared_receipt_for(customer, status: :read, amount_cents: 50_000,
                                  reference: "BT123", matched_account: customer_account)

        gather collected, customer, [
          dashboard_path, account_path(customer_account),
          new_account_payment_proof_path(customer_account),
          account_statement_path(customer_account), notifications_path, settings_path,
          shared_receipt_path(waiting), shared_receipt_path(read)
        ]

        gather collected, create_admin, [
          admin_root_path, admin_subscription_payments_path, admin_shops_path
        ]

        # Signed-out screens carry wiring too — including the one a diner
        # reaches by scanning a table card.
        sign_out
        [ new_session_path, new_registration_path, new_password_path, offline_path,
          table_menu_path(shop_table.token) ].each do |path|
          get path
          collected["(guest) #{path}"] = Nokogiri::HTML(response.body)
        end

        assert proof.pending? && payment.pending?, "the review queues need something to review"
      end
    end

    def gather(collected, user, paths)
      sign_in_as user
      paths.each do |path|
        get path
        assert_response :success, "GET #{path} as #{user.role} failed — the wiring test needs every screen"
        collected["#{user.role}#{" (admin)" if user.platform_admin?} #{path}"] = Nokogiri::HTML(response.body)
      end
    end

    def shared_receipt_for(user, **attributes)
      receipt = SharedReceipt.new(user: user, **attributes)
      receipt.image.attach(io: File.open(screenshot_path), filename: "r.png", content_type: "image/png")
      receipt.save!
      receipt
    end

    def itemize(account, owner)
      purchase = account.transactions.new(kind: :credit, itemized: true, created_by: owner, amount_cents: 1)
      purchase.line_items.build(name: "Rice 25 kg", quantity: 1, unit_price_cents: 62_000)
      purchase.save!
    end

    def build_proof(account, customer)
      proof = account.payment_proofs.new(amount_cents: 20_000, submitted_by: customer)
      proof.screenshot.attach(io: File.open(screenshot_path), filename: "p.png", content_type: "image/png")
      proof.save!
      proof
    end

    def build_subscription_payment(shop, owner)
      payment = shop.subscription_payments.new(amount_cents: 20_000, months: 1, submitted_by: owner)
      payment.screenshot.attach(io: File.open(screenshot_path), filename: "s.png", content_type: "image/png")
      payment.save!
      payment
    end
end
