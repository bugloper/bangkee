#!/usr/bin/env ruby
# Builds the Bangkee manual. Run from the app root so the Rails constants the
# text quotes (trial length, overdue window, prices) come from the code itself:
#
# Usually you want the rake task, which does both steps:
#
#   bin/rails doc:manual
#
# By hand:
#
#   bin/rails runner doc/dump_facts.rb   # read the figures out of the code
#   ruby doc/build_manual.rb             # build the PDF
#
# Prawn is not in the Gemfile — the manual is documentation tooling, not part of
# the app — so this runs OUTSIDE the app bundle:
#
#   gem install prawn prawn-table
$LOAD_PATH.unshift(__dir__)
require "json"

begin
  require "doc_kit"
rescue LoadError => error
  abort "#{error.message}\n\nThe manual needs prawn: gem install prawn prawn-table"
end
require "manual_part1"
require "manual_part2"
require "manual_part3"

ROOT = File.expand_path("..", __dir__)
FACTS_PATH = File.join(ROOT, "tmp/manual_facts.json")

unless File.exist?(FACTS_PATH)
  abort "#{FACTS_PATH} is missing. Run: bin/rails runner doc/dump_facts.rb"
end

FACTS = JSON.parse(File.read(FACTS_PATH))
OUT = ARGV[0] || File.join(ROOT, "tmp/Bangkee-How-The-App-Works.pdf")

# Two passes: the first discovers which page each chapter starts on, the second
# prints those numbers on the contents page.
def build(facts)
  pdf = DocKit.document(title: "Bangkee — How the app works") { furnish }
  ManualPart1.render(pdf, facts)
  ManualPart2.render(pdf, facts)
  ManualPart3.render(pdf, facts)
  pdf
end

DocKit.reset_toc!
build(FACTS)               # pass one: locate the chapters
pdf = build(FACTS)         # pass two: with the contents filled in

pdf.render_file(OUT)
puts "wrote #{OUT} (#{(File.size(OUT) / 1024.0).round} KB, #{pdf.page_count} pages)"
