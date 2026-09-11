# The shop's own menu, which is what customers read when they scan.
class MenuItemsController < ApplicationController
  before_action :require_shop_owner
  before_action :require_writable_shop
  before_action :set_item, only: %i[ edit update destroy ]

  def index
    page_title "Menu", back: settings_path
    @items = current_shop.menu_items.ordered
    @item = current_shop.menu_items.new
    # A shop that has been running tabs already knows what it sells.
    @suggestions = current_shop.frequent_tab_items.reject do |sold|
      current_shop.menu_items.exists?(name: sold.name)
    end
  end

  def new
    page_title "Add to the menu", back: menu_items_path
    @item = current_shop.menu_items.new
  end

  def create
    @item = current_shop.menu_items.new(item_params)

    if @item.save
      redirect_to menu_items_path, notice: "#{@item.name} added to the menu."
    else
      @items = current_shop.menu_items.ordered
      @suggestions = []
      render :index, status: :unprocessable_entity
    end
  end

  def edit
    page_title "Edit #{@item.name}", back: menu_items_path
  end

  def update
    if @item.update(item_params)
      redirect_to menu_items_path, notice: "#{@item.name} updated."
    else
      render :edit, status: :unprocessable_entity
    end
  end

  def destroy
    @item.destroy
    redirect_to menu_items_path, notice: "#{@item.name} taken off the menu."
  end

  private
    def set_item
      @item = current_shop.menu_items.find(params[:id])
    end

    def item_params
      params.require(:menu_item).permit(:name, :category, :price, :available, :position)
    end
end
