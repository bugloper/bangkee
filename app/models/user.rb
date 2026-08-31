class User < ApplicationRecord
  has_secure_password
  has_many :sessions, dependent: :destroy
  has_many :notifications, dependent: :destroy
  has_many :push_subscriptions, dependent: :destroy

  # A shop owner owns one shop in this version; the plural association keeps
  # multi-shop ownership open without a migration (§18).
  has_many :owned_shops, class_name: "Shop", foreign_key: :owner_id, dependent: :destroy
  has_many :accounts, foreign_key: :customer_id, dependent: :nullify

  enum :role, { shop_owner: 0, customer: 1 }, validate: true

  normalizes :email_address, with: ->(e) { e.strip.downcase }
  normalizes :phone, with: ->(p) { p.strip.presence }

  validates :name, presence: true
  validates :email_address, presence: true, uniqueness: { case_sensitive: false }

  def shop = owned_shops.first

  def display_name = name.presence || email_address

  def initial = display_name.first.to_s.upcase
end
