# The whole Bangkee schema in one migration. Development-only convention for
# this project: there are no incremental migrations yet, so the initial schema
# stays a single readable file (see README). Money is bigint chetrum.
class CreateInitialSchema < ActiveRecord::Migration[8.1]
  def change
    # ---------------------------------------------------------------- identity
    create_table :users do |t|
      t.string   :email_address,  null: false
      t.string   :password_digest, null: false
      t.string   :name,           null: false
      t.string   :phone
      t.integer  :role,           null: false, default: 1   # 0 shop_owner, 1 customer
      t.boolean  :platform_admin, null: false, default: false
      t.timestamps
    end
    add_index :users, :email_address, unique: true
    add_index :users, :phone

    create_table :sessions do |t|
      t.references :user, null: false, foreign_key: true
      t.string :token
      t.string :ip_address
      t.string :user_agent
      t.timestamps
    end
    add_index :sessions, :token, unique: true

    # ------------------------------------------------------------------ ledger
    create_table :shops do |t|
      t.string :name, null: false
      t.references :owner, null: false, foreign_key: { to_table: :users }
      t.integer :credit_due_days, null: false, default: 30
      t.timestamps
    end

    create_table :accounts do |t|
      t.references :shop,     null: false, foreign_key: true
      t.references :customer, foreign_key: { to_table: :users }
      t.string   :customer_name,  null: false
      t.string   :customer_phone
      t.bigint   :balance_cents,  null: false, default: 0
      t.string   :invite_token,   null: false
      t.datetime :last_activity_at
      t.timestamps
    end
    add_index :accounts, :invite_token, unique: true
    add_index :accounts, [ :shop_id, :customer_id ]
    add_index :accounts, [ :shop_id, :customer_phone ]

    create_table :transactions do |t|
      t.references :account, null: false, foreign_key: true
      t.integer  :kind,          null: false, default: 0   # 0 credit, 1 payment
      t.bigint   :amount_cents,  null: false, default: 0
      t.string   :description
      t.text     :notes
      t.string   :payment_method
      t.boolean  :itemized,      null: false, default: false
      t.datetime :occurred_at,   null: false
      t.references :created_by, null: false, foreign_key: { to_table: :users }
      t.datetime :voided_at
      t.references :voided_by,  foreign_key: { to_table: :users }
      # Set by the browser when an entry is recorded offline and replayed
      # later, so a retried POST cannot enter the book twice.
      t.string :idempotency_key
      t.timestamps
    end
    add_index :transactions, :idempotency_key, unique: true
    add_index :transactions, [ :account_id, :occurred_at ]
    add_index :transactions, [ :account_id, :kind ]

    create_table :line_items do |t|
      t.references :transaction, null: false, foreign_key: true
      t.string  :name,             null: false
      t.decimal :quantity,         null: false, default: 1.0, precision: 10, scale: 2
      t.bigint  :unit_price_cents, null: false, default: 0
      t.timestamps
    end

    create_table :audit_events do |t|
      t.string     :auditable_type, null: false
      t.bigint     :auditable_id,   null: false
      t.references :actor, foreign_key: { to_table: :users }
      t.string     :action,   null: false
      t.jsonb      :metadata, null: false, default: {}
      t.datetime   :created_at, null: false
    end
    add_index :audit_events, [ :auditable_type, :auditable_id ]
    add_index :audit_events, [ :auditable_type, :auditable_id, :created_at ],
              name: "index_audit_events_on_auditable_and_created_at"

    # --------------------------------------- §16 bank-transfer settlement
    create_table :bank_accounts do |t|
      t.references :shop, null: false, foreign_key: true
      t.string  :bank_name,      null: false
      t.string  :account_name,   null: false
      t.string  :account_number, null: false
      t.string  :branch
      t.string  :mobile_wallet
      t.text    :instructions
      t.boolean :primary, null: false, default: false
      t.boolean :active,  null: false, default: true
      t.timestamps
    end
    add_index :bank_accounts, [ :shop_id, :primary ]

    create_table :payment_proofs do |t|
      t.references :account,      null: false, foreign_key: true
      t.references :submitted_by, null: false, foreign_key: { to_table: :users }
      t.bigint   :amount_cents, null: false, default: 0
      t.string   :reference
      t.text     :note
      t.integer  :status, null: false, default: 0   # 0 pending, 1 confirmed, 2 rejected
      t.references :reviewed_by, foreign_key: { to_table: :users }
      t.datetime :reviewed_at
      t.string   :rejection_reason
      t.references :transaction, foreign_key: true
      t.timestamps
    end
    add_index :payment_proofs, [ :account_id, :status ]

    # ------------------------------------------- §17 subscription billing
    create_table :subscriptions do |t|
      t.references :shop, null: false, foreign_key: true, index: { unique: true }
      t.string   :plan,        null: false, default: "standard"
      t.bigint   :price_cents, null: false, default: 20_000
      t.integer  :status,      null: false, default: 0  # 0 trialing 1 active 2 past_due 3 disabled
      t.datetime :current_period_end, null: false
      t.datetime :grace_until
      t.datetime :disabled_at
      t.timestamps
    end

    create_table :subscription_payments do |t|
      t.references :shop,         null: false, foreign_key: true
      t.references :submitted_by, null: false, foreign_key: { to_table: :users }
      t.bigint  :amount_cents, null: false, default: 0
      t.string  :method
      t.string  :reference
      t.integer :months, null: false, default: 1
      t.integer :status, null: false, default: 0   # 0 pending, 1 approved, 2 rejected
      t.references :reviewed_by, foreign_key: { to_table: :users }
      t.datetime :reviewed_at
      t.string :rejection_reason
      t.timestamps
    end
    add_index :subscription_payments, [ :shop_id, :status ]

    # ------------------------------------------------------- notifications
    # In-app notification centre; every push has a row here so the bell and
    # the device notification stay in sync.
    create_table :notifications do |t|
      t.references :user, null: false, foreign_key: true
      t.string   :kind,  null: false          # credit, payment, void, overdue, proof, sub
      t.string   :title, null: false
      t.string   :body
      t.string   :path                        # where tapping it should land
      t.datetime :read_at
      t.timestamps
    end
    add_index :notifications, [ :user_id, :read_at ]
    add_index :notifications, [ :user_id, :created_at ]

    # Web Push (VAPID) subscriptions — one row per browser/device that opted in.
    create_table :push_subscriptions do |t|
      t.references :user, null: false, foreign_key: true
      t.string :endpoint,   null: false
      t.string :p256dh_key, null: false
      t.string :auth_key,   null: false
      t.string :user_agent
      t.datetime :last_used_at
      t.timestamps
    end
    add_index :push_subscriptions, :endpoint, unique: true

    # ------------------------------------------------------ Active Storage
    create_table :active_storage_blobs do |t|
      t.string   :key,          null: false
      t.string   :filename,     null: false
      t.string   :content_type
      t.text     :metadata
      t.string   :service_name, null: false
      t.bigint   :byte_size,    null: false
      t.string   :checksum
      t.datetime :created_at,   null: false
      t.index [ :key ], unique: true
    end

    create_table :active_storage_attachments do |t|
      t.string     :name,     null: false
      t.references :record,   null: false, polymorphic: true, index: false
      t.references :blob,     null: false
      t.datetime   :created_at, null: false
      t.index [ :record_type, :record_id, :name, :blob_id ],
              name: "index_active_storage_attachments_uniqueness", unique: true
      t.foreign_key :active_storage_blobs, column: :blob_id
    end

    create_table :active_storage_variant_records do |t|
      t.belongs_to :blob, null: false, index: false
      t.string     :variation_digest, null: false
      t.index [ :blob_id, :variation_digest ],
              name: "index_active_storage_variant_records_uniqueness", unique: true
      t.foreign_key :active_storage_blobs, column: :blob_id
    end
  end
end
