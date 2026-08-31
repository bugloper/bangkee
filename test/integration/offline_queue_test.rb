require "test_helper"

# The server half of "recorded with no signal": an entry replayed twice must
# land in the book exactly once.
class OfflineQueueTest < ActionDispatch::IntegrationTest
  setup do
    @owner = create_owner
    @shop = @owner.shop
    @account = create_account(@shop)
    sign_in_as @owner
  end

  test "replaying a queued credit twice records it once" do
    key = SecureRandom.uuid

    assert_difference -> { @account.transactions.count }, 1 do
      2.times do
        post account_credits_path(@account), params: {
          transaction: { amount: "1250", description: "Groceries", idempotency_key: key }
        }
        assert_redirected_to account_path(@account)
      end
    end

    assert_equal 125_000, @account.reload.balance_cents
    assert_equal key, @account.transactions.sole.idempotency_key
  end

  test "replaying a queued payment twice records it once" do
    key = SecureRandom.uuid
    record_credit(@account, amount_cents: 100_000, by: @owner)

    assert_difference -> { @account.transactions.count }, 1 do
      2.times do
        post account_payments_path(@account), params: {
          transaction: { amount: "400", payment_method: "Cash", idempotency_key: key }
        }
      end
    end

    assert_equal 60_000, @account.reload.balance_cents
  end

  test "two different queued entries both land" do
    assert_difference -> { @account.transactions.count }, 2 do
      2.times do |index|
        post account_credits_path(@account), params: {
          transaction: { amount: "100", idempotency_key: SecureRandom.uuid, description: "Item #{index}" }
        }
      end
    end
  end

  test "an entry queued offline keeps the time it happened, not the time it sent" do
    happened_at = 3.hours.ago.change(usec: 0)

    post account_credits_path(@account), params: {
      transaction: { amount: "500", occurred_at: happened_at.iso8601, idempotency_key: SecureRandom.uuid }
    }

    assert_in_delta happened_at, @account.transactions.sole.occurred_at, 1.second
  end

  test "a replay into a write-locked shop is refused, not silently accepted" do
    @shop.subscription.update!(current_period_end: 40.days.ago, grace_until: 26.days.ago)

    assert_no_difference -> { Transaction.count } do
      post account_credits_path(@account), params: {
        transaction: { amount: "500", idempotency_key: SecureRandom.uuid }
      }
    end
    assert_redirected_to subscription_path
  end

  test "the queue's javascript is served and pinned" do
    get root_path
    assert_response :success
    assert_match "offline_queue", response.body, "the queue module must be in the importmap"
  end
end
