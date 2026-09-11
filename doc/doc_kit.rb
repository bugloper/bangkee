# Typographic scaffolding for the Bangkee manual: page furniture, headings,
# justified body text, callouts and tables. Content lives in bangkee_manual.rb.
require "prawn"
require "prawn/table"

module DocKit
  # Filled during a render so the contents page can carry page numbers on the
  # second pass. (Prawn lays out forwards; the numbers are not known until the
  # chapters have been placed.)
  def self.toc = (@toc ||= {})
  def self.reset_toc! = (@toc = {})

  # The contents page and the chapter openers read from one list, so a chapter
  # inserted in the middle renumbers everything by itself.
  CHAPTERS = [
    [ "What Bangkee is for",           "The problem, and the answer" ],
    [ "Who uses it",                   "Three roles, and walk-in customers" ],
    [ "The vocabulary",                "Shop, account, credit, payment, balance" ],
    [ "The rules that govern money",   "What the app will not let you do" ],
    [ "Getting in",                    "Opening a shop, inviting a customer" ],
    [ "The credit book",               "Recording entries, correcting mistakes" ],
    [ "Tabs",                          "Tables that pay at the end" ],
    [ "Scan to order",                 "QR cards, the menu, and the counter" ],
    [ "Paying by bank transfer",       "Publishing details, proofs, confirmation" ],
    [ "Sharing a receipt from your bank", "The share sheet, and reading a receipt" ],
    [ "Subscription and billing",      "Trial, grace, lockout, and the operator" ],
    [ "Notifications",                 "The bell, the phone, and the inbox" ],
    [ "Installing and working offline", "What still works with no signal" ],
    [ "A day in three roles",          "End-to-end walkthroughs" ],
    [ "Who may do what",               "The permission matrix" ],
    [ "Limits and what is not built",  "Read this before promising anything" ]
  ].freeze

  def self.number_for(title)
    index = CHAPTERS.index { |chapter_title, _| chapter_title == title }
    raise ArgumentError, "#{title.inspect} is not in DocKit::CHAPTERS" if index.nil?
    index + 1
  end

  BRAND   = "003d9b"
  INK     = "041b3c"
  SOFT    = "434654"
  MUTED   = "737685"
  LINE    = "e0e4f0"
  TINT    = "dae2ff"
  GREEN   = "006c47"
  GREENBG = "d6f5e4"
  RED     = "b02300"
  REDBG   = "ffdad2"
  AMBER   = "8a6100"
  AMBERBG = "fbe9c8"
  PAPER   = "f7f8fd"

  FONT_DIR = "/System/Library/Fonts/Supplemental".freeze

  def self.document(title:, &block)
    pdf = Prawn::Document.new(
      page_size: "A4", margin: [ 64, 62, 66, 62 ],
      info: { Title: title, Author: "Bangkee", Creator: "Bangkee", CreationDate: Time.now }
    )

    pdf.font_families.update(
      "Body" => {
        normal: "#{FONT_DIR}/Arial.ttf",
        bold: "#{FONT_DIR}/Arial Bold.ttf",
        italic: "#{FONT_DIR}/Arial Italic.ttf",
        bold_italic: "#{FONT_DIR}/Arial Bold Italic.ttf"
      }
    )
    pdf.font "Body"
    pdf.extend(Helpers)
    pdf.instance_eval(&block)
    pdf
  end

  module Helpers
    # ------------------------------------------------------------- page furniture
    def furnish
      # number_pages draws on the page it is called from and leaves the cursor
      # at the foot of it, which would push the cover off the page.
      origin = y

      repeat(->(page) { page > 1 }, dynamic: true) do
        canvas do
          left = 62
          width = bounds.width - 124
          baseline = 42

          fill_color LINE
          fill_rectangle [ left, baseline + 14 ], width, 0.5

          fill_color MUTED
          font_size 7.5
          text_box "BANGKEE · HOW THE APP WORKS", at: [ left, baseline ],
                   width: width - 40, height: 12, character_spacing: 0.8
          font_size 8
          text_box page_number.to_s, at: [ left + width - 40, baseline ],
                   width: 40, height: 12, align: :right
        end
      end

      self.y = origin
    end

    # ------------------------------------------------------------------ headings
    def chapter(title, blurb = nil)
      number = DocKit.number_for(title)
      start_new_page unless cursor > bounds.top - 2
      move_down 6
      fill_color TINT
      font_size 42
      text number.to_s.rjust(2, "0"), style: :bold, leading: -6
      fill_color INK
      font_size 21
      text title, style: :bold, leading: 2
      if blurb
        move_down 5
        fill_color SOFT
        font_size 10.5
        text blurb, align: :justify, leading: 3.2
      end
      move_down 14
      DocKit.toc[number] = page_number
      outline.section(title, destination: page_number) if respond_to?(:outline)
    end

    def heading(text_content, top: 16)
      # Never leave a heading stranded at the foot of a page.
      start_new_page if cursor < 96
      move_down top
      fill_color INK
      font_size 13
      text text_content, style: :bold
      move_down 6
    end

    def subheading(text_content)
      start_new_page if cursor < 88
      move_down 10
      fill_color BRAND
      font_size 10
      text text_content.upcase, style: :bold, character_spacing: 0.7
      move_down 4
    end

    # ---------------------------------------------------------------------- body
    def body(content, indent: 0, size: 10.2)
      fill_color SOFT
      font_size size
      text content, align: :justify, leading: 3.6, inline_format: true, indent_paragraphs: indent
      move_down 7
    end

    def bullets(items, size: 10.2)
      fill_color SOFT
      font_size size
      items.each do |item|
        # float restores the cursor but not the fill colour, so the dash's
        # colour has to be put back by hand or the whole list turns blue.
        float { fill_color BRAND; text_box "—", at: [ 4, cursor ], width: 14 }
        fill_color SOFT
        indent(20) { text item, align: :justify, leading: 3.4, inline_format: true }
        move_down 5
      end
      move_down 3
    end

    # Steps in a walkthrough: numbered, tight, scannable.
    def steps(items)
      items.each_with_index do |item, index|
        start = cursor
        float do
          fill_color BRAND
          font_size 9.5
          text_box "#{index + 1}.", at: [ 2, start ], width: 20, style: :bold
        end
        fill_color SOFT
        indent(22) do
          font_size 10.2
          text item, align: :justify, leading: 3.4, inline_format: true
        end
        move_down 6
      end
      move_down 3
    end

    # ------------------------------------------------------------------ callouts
    def callout(title, content, tone: :brand)
      background, accent, ink = case tone
      when :green then [ GREENBG, GREEN, GREEN ]
      when :red   then [ REDBG, RED, RED ]
      when :amber then [ AMBERBG, AMBER, AMBER ]
      else             [ PAPER, BRAND, BRAND ]
      end

      font_size 10
      inner = bounds.width - 34
      height = height_of(content, width: inner, leading: 3.4, inline_format: true) +
               height_of(title, width: inner, size: 9.5) + 26

      start_new_page if cursor < height + 20
      top = cursor

      fill_color background
      fill_rounded_rectangle [ 0, top ], bounds.width, height, 6
      fill_color accent
      fill_rectangle [ 0, top ], 3, height

      bounding_box([ 16, top - 11 ], width: inner) do
        fill_color ink
        font_size 9.5
        text title.upcase, style: :bold, character_spacing: 0.6
        move_down 4
        fill_color SOFT
        font_size 10
        text content, align: :justify, leading: 3.4, inline_format: true
      end

      # Set the position outright: the bounding box above has already moved the
      # cursor, so moving down by the height again would double the gap.
      self.y = top - height - 14 + bounds.absolute_bottom
      fill_color SOFT
    end

    # ------------------------------------------------------------------- tables
    def data_table(header, rows, widths: nil, align: {})
      move_down 4
      table([ header ] + rows, header: true, width: bounds.width, cell_style: { size: 9, padding: [ 6, 8, 6, 8 ], border_color: LINE, borders: [ :bottom ] }) do |t|
        t.row(0).background_color = PAPER
        t.row(0).text_color = BRAND
        t.row(0).font_style = :bold
        t.row(0).size = 8.5
        t.rows(1..-1).text_color = SOFT
        t.column_widths = widths if widths
        align.each { |index, value| t.column(index).align = value }
      end
      move_down 12
    end

    # --------------------------------------------------------------- decoration
    # `inverse` draws the mark for a blue ground: white tile, blue letter.
    def brand_mark(size: 54, at: nil, inverse: false)
      x, y = at || [ 0, cursor ]
      fill_color(inverse ? "ffffff" : BRAND)
      fill_rounded_rectangle [ x, y ], size, size, size * 0.22
      fill_color(inverse ? BRAND : "ffffff")
      font_size size * 0.56
      text_box "B", at: [ x, y - size * 0.22 ], width: size, height: size, align: :center, style: :bold
      fill_color INK
    end

    def rule(colour = LINE)
      move_down 6
      stroke_color colour
      stroke_horizontal_rule
      move_down 12
      stroke_color "000000"
    end
  end
end
