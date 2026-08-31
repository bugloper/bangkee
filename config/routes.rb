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
