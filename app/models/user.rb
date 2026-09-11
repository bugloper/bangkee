class User < ApplicationRecord
  has_secure_password
  has_many :sessions, dependent: :destroy
  has_many :notifications, dependent: :destroy
  has_many :push_subscriptions, dependent: :destroy
  has_many :shared_receipts, dependent: :destroy

  # A shop owner owns one shop in this version; the plural association keeps
  # multi-shop ownership open without a migration (§18).
  has_many :owned_shops, class_name: "Shop", foreign_key: :owner_id, dependent: :destroy
  has_many :accounts, foreign_key: :customer_id, dependent: :nullify

  enum :role, { shop_owner: 0, customer: 1 }, validate: true

  normalizes :email_address, with: ->(e) { e.strip.downcase }
  normalizes :phone, with: ->(p) { p.strip.presence }

  validates :name, presence: true
  validates :email_address, presence: true, uniqueness: { case_sensitive: false }

  # nil means "follow the app default"; an unknown value is ignored rather than
  # trusted, so a stale row cannot break every page this person opens.
  def reading_locale
    locale.to_s.presence&.to_sym.then { |value| I18n.available_locales.include?(value) ? value : nil }
  end

  def shop = owned_shops.first

  def display_name = name.presence || email_address

  def initial = display_name.first.to_s.upcase
end
