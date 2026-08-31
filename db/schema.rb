# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_08_31_162410) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "accounts", force: :cascade do |t|
    t.bigint "balance_cents", default: 0, null: false
    t.datetime "created_at", null: false
    t.bigint "customer_id"
    t.string "customer_name", null: false
    t.string "customer_phone"
    t.string "invite_token", null: false
    t.datetime "last_activity_at"
    t.bigint "shop_id", null: false
    t.datetime "updated_at", null: false
    t.index ["customer_id"], name: "index_accounts_on_customer_id"
    t.index ["invite_token"], name: "index_accounts_on_invite_token", unique: true
    t.index ["shop_id", "customer_id"], name: "index_accounts_on_shop_id_and_customer_id"
    t.index ["shop_id", "customer_phone"], name: "index_accounts_on_shop_id_and_customer_phone"
    t.index ["shop_id"], name: "index_accounts_on_shop_id"
  end

  create_table "active_storage_attachments", force: :cascade do |t|
    t.bigint "blob_id", null: false
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.bigint "record_id", null: false
    t.string "record_type", null: false
    t.index ["blob_id"], name: "index_active_storage_attachments_on_blob_id"
    t.index ["record_type", "record_id", "name", "blob_id"], name: "index_active_storage_attachments_uniqueness", unique: true
  end

  create_table "active_storage_blobs", force: :cascade do |t|
    t.bigint "byte_size", null: false
    t.string "checksum"
    t.string "content_type"
    t.datetime "created_at", null: false
    t.string "filename", null: false
    t.string "key", null: false
    t.text "metadata"
    t.string "service_name", null: false
    t.index ["key"], name: "index_active_storage_blobs_on_key", unique: true
  end

  create_table "active_storage_variant_records", force: :cascade do |t|
    t.bigint "blob_id", null: false
    t.string "variation_digest", null: false
    t.index ["blob_id", "variation_digest"], name: "index_active_storage_variant_records_uniqueness", unique: true
  end

  create_table "audit_events", force: :cascade do |t|
    t.string "action", null: false
    t.bigint "actor_id"
    t.bigint "auditable_id", null: false
    t.string "auditable_type", null: false
    t.datetime "created_at", null: false
    t.jsonb "metadata", default: {}, null: false
    t.index ["actor_id"], name: "index_audit_events_on_actor_id"
    t.index ["auditable_type", "auditable_id", "created_at"], name: "index_audit_events_on_auditable_and_created_at"
    t.index ["auditable_type", "auditable_id"], name: "index_audit_events_on_auditable_type_and_auditable_id"
  end

  create_table "bank_accounts", force: :cascade do |t|
    t.string "account_name", null: false
    t.string "account_number", null: false
    t.boolean "active", default: true, null: false
    t.string "bank_name", null: false
    t.string "branch"
    t.datetime "created_at", null: false
    t.text "instructions"
    t.string "mobile_wallet"
    t.boolean "primary", default: false, null: false
    t.bigint "shop_id", null: false
    t.datetime "updated_at", null: false
    t.index ["shop_id", "primary"], name: "index_bank_accounts_on_shop_id_and_primary"
    t.index ["shop_id"], name: "index_bank_accounts_on_shop_id"
  end

  create_table "line_items", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.decimal "quantity", precision: 10, scale: 2, default: "1.0", null: false
    t.bigint "transaction_id", null: false
    t.bigint "unit_price_cents", default: 0, null: false
    t.datetime "updated_at", null: false
    t.index ["transaction_id"], name: "index_line_items_on_transaction_id"
  end

  create_table "notifications", force: :cascade do |t|
    t.string "body"
    t.datetime "created_at", null: false
    t.string "kind", null: false
    t.string "path"
    t.datetime "read_at"
    t.string "title", null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.index ["user_id", "created_at"], name: "index_notifications_on_user_id_and_created_at"
    t.index ["user_id", "read_at"], name: "index_notifications_on_user_id_and_read_at"
    t.index ["user_id"], name: "index_notifications_on_user_id"
  end

  create_table "payment_proofs", force: :cascade do |t|
    t.bigint "account_id", null: false
    t.bigint "amount_cents", default: 0, null: false
    t.datetime "created_at", null: false
    t.text "note"
    t.string "reference"
    t.string "rejection_reason"
    t.datetime "reviewed_at"
    t.bigint "reviewed_by_id"
    t.integer "status", default: 0, null: false
    t.bigint "submitted_by_id", null: false
    t.bigint "transaction_id"
    t.datetime "updated_at", null: false
    t.index ["account_id", "status"], name: "index_payment_proofs_on_account_id_and_status"
    t.index ["account_id"], name: "index_payment_proofs_on_account_id"
    t.index ["reviewed_by_id"], name: "index_payment_proofs_on_reviewed_by_id"
    t.index ["submitted_by_id"], name: "index_payment_proofs_on_submitted_by_id"
    t.index ["transaction_id"], name: "index_payment_proofs_on_transaction_id"
  end

  create_table "push_subscriptions", force: :cascade do |t|
    t.string "auth_key", null: false
    t.datetime "created_at", null: false
    t.string "endpoint", null: false
    t.datetime "last_used_at"
    t.string "p256dh_key", null: false
    t.datetime "updated_at", null: false
    t.string "user_agent"
    t.bigint "user_id", null: false
    t.index ["endpoint"], name: "index_push_subscriptions_on_endpoint", unique: true
    t.index ["user_id"], name: "index_push_subscriptions_on_user_id"
  end

  create_table "sessions", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "ip_address"
    t.string "token"
    t.datetime "updated_at", null: false
    t.string "user_agent"
    t.bigint "user_id", null: false
    t.index ["token"], name: "index_sessions_on_token", unique: true
    t.index ["user_id"], name: "index_sessions_on_user_id"
  end

  create_table "shops", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.integer "credit_due_days", default: 30, null: false
    t.string "name", null: false
    t.bigint "owner_id", null: false
    t.datetime "updated_at", null: false
    t.index ["owner_id"], name: "index_shops_on_owner_id"
  end

  create_table "subscription_payments", force: :cascade do |t|
    t.bigint "amount_cents", default: 0, null: false
    t.datetime "created_at", null: false
    t.string "method"
    t.integer "months", default: 1, null: false
    t.string "reference"
    t.string "rejection_reason"
    t.datetime "reviewed_at"
    t.bigint "reviewed_by_id"
    t.bigint "shop_id", null: false
    t.integer "status", default: 0, null: false
    t.bigint "submitted_by_id", null: false
    t.datetime "updated_at", null: false
    t.index ["reviewed_by_id"], name: "index_subscription_payments_on_reviewed_by_id"
    t.index ["shop_id", "status"], name: "index_subscription_payments_on_shop_id_and_status"
    t.index ["shop_id"], name: "index_subscription_payments_on_shop_id"
    t.index ["submitted_by_id"], name: "index_subscription_payments_on_submitted_by_id"
  end

  create_table "subscriptions", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.datetime "current_period_end", null: false
    t.datetime "disabled_at"
    t.datetime "grace_until"
    t.string "plan", default: "standard", null: false
    t.bigint "price_cents", default: 20000, null: false
    t.bigint "shop_id", null: false
    t.integer "status", default: 0, null: false
    t.datetime "updated_at", null: false
    t.index ["shop_id"], name: "index_subscriptions_on_shop_id", unique: true
  end

  create_table "transactions", force: :cascade do |t|
    t.bigint "account_id", null: false
    t.bigint "amount_cents", default: 0, null: false
    t.datetime "created_at", null: false
    t.bigint "created_by_id", null: false
    t.string "description"
    t.string "idempotency_key"
    t.boolean "itemized", default: false, null: false
    t.integer "kind", default: 0, null: false
    t.text "notes"
    t.datetime "occurred_at", null: false
    t.string "payment_method"
    t.datetime "updated_at", null: false
    t.datetime "voided_at"
    t.bigint "voided_by_id"
    t.index ["account_id", "kind"], name: "index_transactions_on_account_id_and_kind"
    t.index ["account_id", "occurred_at"], name: "index_transactions_on_account_id_and_occurred_at"
    t.index ["account_id"], name: "index_transactions_on_account_id"
    t.index ["created_by_id"], name: "index_transactions_on_created_by_id"
    t.index ["idempotency_key"], name: "index_transactions_on_idempotency_key", unique: true
    t.index ["voided_by_id"], name: "index_transactions_on_voided_by_id"
  end

  create_table "users", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "email_address", null: false
    t.string "name", null: false
    t.string "password_digest", null: false
    t.string "phone"
    t.boolean "platform_admin", default: false, null: false
    t.integer "role", default: 1, null: false
    t.datetime "updated_at", null: false
    t.index ["email_address"], name: "index_users_on_email_address", unique: true
    t.index ["phone"], name: "index_users_on_phone"
  end

  add_foreign_key "accounts", "shops"
  add_foreign_key "accounts", "users", column: "customer_id"
  add_foreign_key "active_storage_attachments", "active_storage_blobs", column: "blob_id"
  add_foreign_key "active_storage_variant_records", "active_storage_blobs", column: "blob_id"
  add_foreign_key "audit_events", "users", column: "actor_id"
  add_foreign_key "bank_accounts", "shops"
  add_foreign_key "line_items", "transactions"
  add_foreign_key "notifications", "users"
  add_foreign_key "payment_proofs", "accounts"
  add_foreign_key "payment_proofs", "transactions"
  add_foreign_key "payment_proofs", "users", column: "reviewed_by_id"
  add_foreign_key "payment_proofs", "users", column: "submitted_by_id"
  add_foreign_key "push_subscriptions", "users"
  add_foreign_key "sessions", "users"
  add_foreign_key "shops", "users", column: "owner_id"
  add_foreign_key "subscription_payments", "shops"
  add_foreign_key "subscription_payments", "users", column: "reviewed_by_id"
  add_foreign_key "subscription_payments", "users", column: "submitted_by_id"
  add_foreign_key "subscriptions", "shops"
  add_foreign_key "transactions", "accounts"
  add_foreign_key "transactions", "users", column: "created_by_id"
  add_foreign_key "transactions", "users", column: "voided_by_id"
end
