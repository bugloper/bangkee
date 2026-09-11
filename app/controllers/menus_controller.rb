# What a customer sees when they scan the card on their table. No sign-in: a
# diner is not a Bangkee user and never will be, so the table's token is the
# whole of the identification.
class MenusController < ApplicationController
  allow_unauthenticated_access
  layout "public"

  before_action :set_table

  def show
    @menu = @shop.menu_items.available.grouped
    @tab = @table.open_tab
    @recent_orders = @table.table_orders.where(placed_at: 4.hours.ago..).recent.limit(5)
  end

  private
    def set_table
      @table = ShopTable.active.find_by(token: params[:token])
      return redirect_to root_path, alert: "That code is not in use." if @table.nil?

      @shop = @table.shop
    end
end
