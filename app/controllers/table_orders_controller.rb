# Orders placed from a customer's phone. Public, and rate limited: the token on
# a table card is not a secret once the card is on the table, so this has to
# survive somebody tapping send twenty times.
class TableOrdersController < ApplicationController
  allow_unauthenticated_access
  layout "public"

  rate_limit to: 12, within: 2.minutes, only: :create,
             with: -> { redirect_to table_menu_path(params[:token]), alert: "Too many orders at once. Give the counter a moment." }

  before_action :set_table

  def create
    lines = ordered_lines
    return redirect_to table_menu_path(@table.token), alert: "Choose something first." if lines.empty?

    order = @shop.table_orders.new(shop_table: @table, note: params[:note].presence, tab: @table.open_tab)

    ActiveRecord::Base.transaction do
      order.save!
      lines.each { |line| order.table_order_items.create!(line) }
    end

    Notifier.table_order_placed(order.reload)
    redirect_to table_menu_order_path(@table.token, order)
  end

  def show
    @order = @table.table_orders.find(params[:id])
  end

  private
    def set_table
      @table = ShopTable.active.find_by(token: params[:token])
      return redirect_to root_path, alert: "That code is not in use." if @table.nil?

      @shop = @table.shop
    end

    # The form posts quantities keyed by menu item. Prices come from the menu,
    # never from the form — a price in a form field is a price the customer can
    # edit.
    def ordered_lines
      wanted = params.fetch(:quantities, {}).to_unsafe_h.filter_map do |id, quantity|
        count = quantity.to_i
        [ id.to_i, count ] if count.positive?
      end.to_h
      return [] if wanted.empty?

      @shop.menu_items.available.where(id: wanted.keys).map do |item|
        { menu_item: item, name: item.name, unit_price_cents: item.price_cents,
          quantity: [ wanted[item.id], 50 ].min }
      end
    end
end
