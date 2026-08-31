require "test_helper"

class AuthenticationFlowTest < ActionDispatch::IntegrationTest
  test "the auth screens render for a visitor" do
    [ new_session_path, new_registration_path, new_password_path ].each do |path|
      get path
      assert_response :success, "GET #{path} failed"
    end
  end

  test "signing up opens a shop and provisions its subscription (BR-36)" do
    assert_difference [ -> { User.count }, -> { Shop.count }, -> { Subscription.count } ], 1 do
      post registration_path, params: {
        user: { name: "Karma Dorji", shop_name: "Karma General Shop",
                email_address: "karma@shop.bt", password: "secret123" }
      }
    end

    assert_redirected_to root_path
    owner = User.find_by(email_address: "karma@shop.bt")
    assert owner.shop_owner?
    assert_equal "Karma General Shop", owner.shop.name
    assert owner.shop.subscription.trialing?
  end

  test "a shop name is required to open a shop" do
    assert_no_difference -> { User.count } do
      post registration_path, params: {
        user: { name: "Karma", email_address: "k@shop.bt", password: "secret123" }
      }
    end
    assert_response :unprocessable_entity
  end

  test "an invite link signs a new customer up and claims their account (BR-23, BR-26)" do
    owner = create_owner
    account = create_account(owner.shop, name: "Pema Choden")

    get invitation_path(account.invite_token)
    assert_response :success
    assert_match owner.shop.name, response.body

    post registration_path, params: {
      user: { name: "Pema Choden", email_address: "pema@example.bt", password: "secret123" }
    }

    customer = User.find_by(email_address: "pema@example.bt")
    assert customer.customer?, "an invited visitor signs up as a customer, not an owner"
    assert_equal customer, account.reload.customer
    assert_equal 0, Shop.where(owner: customer).count
  end

  test "an owner who opens an invite link is turned away (BR-25)" do
    owner = create_owner
    account = create_account(create_owner(email: "other@shop.bt").shop)
    sign_in_as owner

    get invitation_path(account.invite_token)
    assert_redirected_to root_path
    assert_not account.reload.joined?
  end

  test "a bad invite token is refused" do
    get invitation_path("nonsense")
    assert_redirected_to root_path
  end

  test "signing in and out works and protects the app" do
    owner = create_owner(email: "karma@shop.bt")

    post session_path, params: { email_address: "karma@shop.bt", password: "password" }
    assert_redirected_to root_url
    get dashboard_path
    assert_response :success

    delete session_path
    assert_redirected_to new_session_path

    get dashboard_path
    assert_redirected_to new_session_path
  end

  test "a wrong password does not sign anyone in" do
    create_owner(email: "karma@shop.bt")
    post session_path, params: { email_address: "karma@shop.bt", password: "wrong" }
    assert_redirected_to new_session_path
  end

  test "a platform admin lands on the operator dashboard" do
    sign_in_as create_admin
    get root_path
    assert_redirected_to admin_root_path
  end
end
