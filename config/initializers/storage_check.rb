# Uploaded screenshots are evidence: a confirmed payment proof has to be
# retrievable long after the payment it proves (SRS §16.9). On a host whose
# filesystem is rebuilt with every deploy, the Disk service loses them silently
# — the rows survive, the images do not — so say so loudly at boot.
Rails.application.config.after_initialize do
  next unless Rails.env.production?
  next unless Rails.application.config.active_storage.service.to_s == "local"
  # Asset precompilation during a Docker build boots the app with a dummy key
  # and no env; nothing is being stored, so there is nothing to warn about.
  next if ENV["SECRET_KEY_BASE_DUMMY"].present?

  Rails.logger.warn <<~WARNING
    [storage] Active Storage is writing to the local filesystem in production.
    [storage] If this host rebuilds its disk between deploys, every payment proof,
    [storage] subscription screenshot and shared receipt will be lost — the database
    [storage] rows will remain and the images will 404.
    [storage] Set ACTIVE_STORAGE_SERVICE=s3 with S3_BUCKET / S3_ACCESS_KEY_ID /
    [storage] S3_SECRET_ACCESS_KEY (and S3_ENDPOINT for R2 or B2), or attach a
    [storage] persistent disk mounted at #{Rails.root.join("storage")}.
  WARNING
end
