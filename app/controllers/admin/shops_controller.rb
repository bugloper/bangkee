class Admin::ShopsController < Admin::BaseController
  def index
    page_title "Shops", back: admin_root_path
    @shops = Shop.includes(:owner, :subscription).order(:name)
  end
end
