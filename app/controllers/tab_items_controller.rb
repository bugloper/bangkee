# Adding to and correcting a running bill while the customer is still ordering.
class TabItemsController < ApplicationController
  before_action :require_shop_owner
  before_action :require_writable_shop
  before_action :set_tab

  def create
    @item = @tab.tab_items.new(item_params)
    @item.added_by = current_user

    if @item.save
      redirect_to @tab
    else
      redirect_to @tab, alert: @item.errors.full_messages.to_sentence
    end
  end

  # Ordered by mistake, or sent back to the kitchen. An open tab is not a
  # ledger entry, so a line can simply go.
  def destroy
    return redirect_to @tab, alert: "That tab is closed." unless @tab.open?

    item = @tab.tab_items.find(params[:id])
    item.destroy
    redirect_to @tab, notice: "#{item.name} removed."
  end

  private
    def set_tab
      @tab = current_shop.tabs.find(params[:tab_id])
    end

    def item_params
      params.require(:tab_item).permit(:name, :quantity, :unit_price)
    end
end
