namespace :db do
  # Solid Cache, Queue and Cable ship schemas rather than migrations, and
  # `db:prepare` only loads a schema when it has just created the database. On a
  # host where all four configurations share one database — which is what a
  # managed Postgres gives you — the primary creates it and the other three find
  # it already there, so their tables are never made and every background job
  # fails on the first deploy.
  #
  # This loads each missing schema into the database that is actually connected,
  # and does nothing at all once the tables exist, so it is safe on every boot.
  desc "Load any missing Solid Cache/Queue/Cable schemas into the current database"
  task prepare_solid: :environment do
    sentinels = { cache: "solid_cache_entries", queue: "solid_queue_jobs", cable: "solid_cable_messages" }
    connection = ActiveRecord::Base.connection

    sentinels.each do |name, table|
      next if connection.table_exists?(table)

      schema = Rails.root.join("db/#{name}_schema.rb")
      next unless schema.exist?

      puts "  loading #{schema.basename} (#{table} missing)"
      ActiveRecord::Schema.verbose = false
      load schema

      # Each of these schemas is defined at version 1, and loading it stamps
      # that into schema_migrations — where it sits next to this app's
      # timestamped migrations and shows up as "up ***** NO FILE *****".
      connection.delete("DELETE FROM schema_migrations WHERE version = '1'")
    end
  end
end
