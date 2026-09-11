# The tables, and the QR cards that get printed and put on them.
class ShopTablesController < ApplicationController
  before_action :require_shop_owner
  before_action :require_writable_shop, except: %i[ index cards ]
  before_action :set_table, only: %i[ edit update destroy ]

  def index
    page_title "Tables", back: settings_path
    @tables = current_shop.shop_tables.ordered
    @table = current_shop.shop_tables.new
  end

  # The printable sheet: one card per table, each with its own code.
  def cards
    @tables = current_shop.shop_tables.active.ordered
  end

  def create
    @table = current_shop.shop_tables.new(table_params)

    if @table.save
      redirect_to shop_tables_path, notice: "#{@table.name} added. Print its card from this screen."
    else
      @tables = current_shop.shop_tables.ordered
      render :index, status: :unprocessable_entity
    end
  end

  def edit
    page_title "Edit #{@table.name}", back: shop_tables_path
  end

  def update
    if @table.update(table_params)
      redirect_to shop_tables_path, notice: "#{@table.name} updated."
    else
      render :edit, status: :unprocessable_entity
    end
  end

  def destroy
    @table.destroy
    redirect_to shop_tables_path, notice: "#{@table.name} removed. Its printed card no longer works."
  end

  private
    def set_table
      @table = current_shop.shop_tables.find(params[:id])
    end

    def table_params
      params.require(:shop_table).permit(:name, :active, :position)
    end
end
