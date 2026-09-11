Rails.application.routes.draw do
  # ---------------------------------------------------------------- identity
  resource :session
  resources :passwords, param: :token
  resource :registration, only: %i[ new create ]
  get "join/:token", to: "invitations#show", as: :invitation

  # ------------------------------------------------------------------ ledger
  get "dashboard", to: "dashboards#show", as: :dashboard

  resources :accounts do
    resources :credits,  only: %i[ new create ]
    resources :payments, only: %i[ new create ]
    resource  :statement, only: :show
    resource  :invite, only: :show
    # §16 — the customer's own settlement claims
    resources :payment_proofs, only: %i[ new create ]
  end

  # Running bills — a restaurant table, a snooker table, a round at the bar.
  resources :tabs, only: %i[ index show new create ] do
    resources :items, only: %i[ create destroy ], controller: "tab_items"
    member do
      post   :settle
      delete :void
    end
  end

  resources :transactions, only: %i[ edit update ] do
    member { patch :void }
  end

  # §16 — the owner's review queue
  resources :payment_proofs, only: :index do
    member do
      patch :confirm
      patch :reject
    end
  end
  resources :bank_accounts

  # ---------------------------------------------------------------- settings
  get "settings", to: "settings#show", as: :settings

  # §17 — billing
  resource :subscription, only: :show, controller: "subscriptions" do
    resources :payments, only: :create, controller: "subscription_payments"
  end

  # §17 — the Bangkee operator
  namespace :admin do
    root "dashboard#show"
    resources :subscription_payments, only: :index do
      member do
        patch :approve
        patch :reject
      end
    end
    resources :shops, only: :index
  end

  # Receipts shared in from a bank's own app (Web Share Target). The manifest
  # points the share sheet at #create; nothing else posts here.
  resources :shared_receipts, only: %i[ create show ] do
    member { post :confirm }
  end

  # --------------------------------------------------------- notifications
  resources :notifications, only: :index do
    member     { patch :read }
    collection { patch :read_all }
  end
  # Web Push: one row per browser that opted in.
  resource :push_subscription, only: %i[ create destroy ]

  # ------------------------------------------------------------------- PWA
  get "manifest.webmanifest", to: "pwa#manifest",       as: :pwa_manifest
  get "service-worker.js",    to: "pwa#service_worker", as: :pwa_service_worker
  get "offline",              to: "pwa#offline",        as: :offline

  get "up" => "rails/health#show", as: :rails_health_check

  root "dashboards#show"
end
