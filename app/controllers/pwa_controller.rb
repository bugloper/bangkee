# The three files that make Bangkee installable. All public: the browser asks
# for the manifest and the service worker without cookies.
class PwaController < ApplicationController
  allow_unauthenticated_access
  layout false
  # A GET for JavaScript is normally refused as cross-origin script embedding;
  # the service worker is exactly that request, made by the browser itself.
  skip_forgery_protection only: :service_worker

  def manifest
    render template: "pwa/manifest", formats: :json,
           content_type: "application/manifest+json"
  end

  def service_worker
    # Must be served from the origin root to control the whole scope.
    response.headers["Service-Worker-Allowed"] = "/"
    render template: "pwa/service_worker", formats: :js,
           content_type: "text/javascript"
  end

  # Rendered by the service worker when a navigation fails with no cached copy.
  def offline
    render layout: "application"
  end
end
