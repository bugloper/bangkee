# The counter screen. Orders arrive here from customers' phones and have to be
# noticed while somebody is carrying plates, which is why this screen refreshes
# itself and makes a sound.
class CounterOrdersController < ApplicationController
  before_action :require_shop_owner
  before_action :require_writable_shop, only: %i[ accept reject ]
  before_action :set_order, only: %i[ accept reject ]

  def index
    page_title "Orders", back: tabs_path
    @pending = current_shop.table_orders.for_counter
    @recent = current_shop.table_orders.where.not(status: :pending)
                          .includes(:shop_table).recent.limit(8)
    # The counter screen polls this to decide whether anything is new.
    @latest_id = @pending.map(&:id).max.to_i
  end

  def accept
    if @order.accept!(by: current_user)
      redirect_to orders_path, notice: "#{@order.shop_table.name} — #{helpers.ngultrum @order.total_cents} added to the tab."
    else
      redirect_to orders_path, alert: "That order has already been dealt with."
    end
  end

  def reject
    if @order.reject!(by: current_user, reason: params[:rejection_reason])
      redirect_to orders_path, notice: "Order from #{@order.shop_table.name} turned down."
    else
      redirect_to orders_path, alert: "That order has already been dealt with."
    end
  end

  private
    def set_order
      @order = current_shop.table_orders.find(params[:id])
    end
end
