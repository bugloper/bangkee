namespace :test do
  desc "Run the JavaScript tests (the offline queue) with Node's test runner"
  task :javascript do
    unless system("which node > /dev/null 2>&1")
      puts "Skipping JavaScript tests: node is not installed."
      next
    end

    puts "Running JavaScript tests…"
    abort "JavaScript tests failed" unless system("node --test test/javascript/*_test.mjs")
  end
end

# `rake test` picks these up. `bin/rails test` does not go through Rake, so
# bin/ci runs `bin/rails test:javascript` as its own step.
Rake::Task["test"].enhance do
  Rake::Task["test:javascript"].invoke
end
