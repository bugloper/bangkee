require "test_helper"

# System tests need a Chromium that can actually run headless. Chrome and
# Chromium do; Brave, the only Chromium on some machines, hangs on startup — so
# these tests skip rather than fail when there is nothing usable. Point
# CHROME_BIN at a browser to run them anywhere:
#
#   CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" bin/rails test:system
class ApplicationSystemTestCase < ActionDispatch::SystemTestCase
  CANDIDATES = [
    ENV["CHROME_BIN"],
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium"
  ].compact.freeze

  BROWSER = CANDIDATES.find { |path| File.exist?(path) }

  def self.browser_available? = BROWSER.present?

  driven_by :selenium, using: :headless_chrome, screen_size: [ 414, 896 ] do |options|
    options.binary = BROWSER if BROWSER
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-gpu")
    options.add_argument("--disable-dev-shm-usage")
  end

  def sign_in(user)
    visit new_session_path
    fill_in "Email", with: user.email_address
    fill_in "Password", with: "password"
    click_on "Sign in"
    assert_no_current_path new_session_path, wait: 5
  end

  # Nothing else is honest about being offline: DevTools kills the request in
  # the browser, and the navigator.onLine override is what the app reads.
  def go_offline
    page.driver.browser.network_conditions = { offline: true, latency: 0, throughput: 0 }
    page.execute_script(<<~JS)
      Object.defineProperty(navigator, "onLine", { get: () => false, configurable: true })
      window.dispatchEvent(new Event("offline"))
    JS
  end

  def go_online
    page.driver.browser.network_conditions = { offline: false, latency: 0, throughput: -1 }
    page.execute_script(<<~JS)
      Object.defineProperty(navigator, "onLine", { get: () => true, configurable: true })
      window.dispatchEvent(new Event("online"))
    JS
  end
end
