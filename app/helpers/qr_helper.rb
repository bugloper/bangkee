module QrHelper
  # An inline SVG QR code. Inline rather than a generated image file because a
  # table card is printed once and never needs to exist as a file, and SVG
  # prints at whatever size the paper gives it.
  def qr_svg(url, size: 150)
    qr = RQRCode::QRCode.new(url, level: :m)

    raw = qr.as_svg(module_size: 4, standalone: true, use_path: true,
                    color: "041b3c", viewbox: true)
    raw.sub("<svg ", %(<svg width="#{size}" height="#{size}" role="img" aria-label="QR code" )).html_safe
  end
end
