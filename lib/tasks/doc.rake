namespace :doc do
  desc "Build the Bangkee manual (doc/) as a PDF in tmp/"
  task manual: :environment do
    load Rails.root.join("doc/dump_facts.rb").to_s

    # Prawn is deliberately not in the Gemfile — the manual is documentation
    # tooling, not part of the app — so the build runs outside the bundle.
    # with_unbundled_env is what clears the whole of Bundler's footprint;
    # unsetting BUNDLE_GEMFILE by hand leaves GEM_HOME behind.
    command = "ruby #{Rails.root.join("doc/build_manual.rb")} #{ARGV[1]}".strip
    built = Bundler.with_unbundled_env { system(command) }

    abort "Building the manual failed." unless built
  end
end
