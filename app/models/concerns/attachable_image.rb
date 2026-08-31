# Shared validation for the screenshots customers and owners upload as proof.
# Deliberately hand-rolled — one rule, no gem.
module AttachableImage
  extend ActiveSupport::Concern

  ACCEPTED_TYPES = %w[ image/png image/jpeg image/jpg image/webp image/heic image/heif ].freeze
  MAX_BYTES = 8.megabytes

  class_methods do
    def validates_attached_image(name, required: true)
      validate do
        attachment = public_send(name)

        if !attachment.attached?
          errors.add(name, "must be attached") if required
          next
        end

        unless attachment.blob.content_type.in?(ACCEPTED_TYPES)
          errors.add(name, "must be a PNG, JPEG, WebP or HEIC image")
        end

        if attachment.blob.byte_size > MAX_BYTES
          errors.add(name, "must be smaller than #{MAX_BYTES / 1.megabyte} MB")
        end
      end
    end
  end
end
