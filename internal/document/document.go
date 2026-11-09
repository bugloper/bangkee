// Package document draws the PDFs a shop hands over: a customer's statement
// and a payment's receipt. A4, the PDF core fonts, no images — a few
// kilobytes that open on any phone and print on any printer.
//
// The core fonts carry Latin text only (Windows-1252). Anything outside it —
// a name typed in Dzongkha — is printed as "?" rather than breaking the
// document; the screen versions show it as typed.
package document

import (
	"bytes"
	"strings"

	"github.com/go-pdf/fpdf"
)

const (
	margin    = 16.0
	pageWidth = 210.0
	inner     = pageWidth - 2*margin
)

// The brand's indigo, and the ledger's red and green.
var (
	brand = [3]int{77, 53, 241}
	owed  = [3]int{200, 45, 40}
	paid  = [3]int{30, 130, 90}
	muted = [3]int{110, 110, 120}
	ink   = [3]int{20, 20, 28}
	rule  = [3]int{225, 225, 232}
)

type page struct {
	*fpdf.Fpdf
	tr func(string) string
}

func newPage(title string) *page {
	f := fpdf.New("P", "mm", "A4", "")
	f.SetMargins(margin, margin, margin)
	f.SetAutoPageBreak(true, margin+6)
	f.SetTitle(title, true)
	f.SetCreator("Bangkee", true)
	p := &page{Fpdf: f, tr: f.UnicodeTranslatorFromDescriptor("")}
	f.SetFooterFunc(func() {
		f.SetY(-margin)
		p.color(muted)
		f.SetFont("Helvetica", "", 8)
		f.CellFormat(inner/2, 5, p.text("Made with Bangkee · bangkee.app"), "", 0, "L", false, 0, "")
		f.CellFormat(inner/2, 5, p.text("Page "+itoa(f.PageNo())+" of {nb}"), "", 0, "R", false, 0, "")
	})
	f.AliasNbPages("{nb}")
	f.AddPage()
	return p
}

// text makes a string printable in the core fonts.
func (p *page) text(s string) string {
	s = strings.NewReplacer("−", "-", "→", "->", "✓", "", "…", "...").Replace(s)
	var out strings.Builder
	for _, r := range s {
		if r < 0x2000 || strings.ContainsRune("–—‘’“”•€™", r) {
			out.WriteRune(r)
		} else {
			out.WriteRune('?')
		}
	}
	return p.tr(out.String())
}

func (p *page) color(c [3]int) { p.SetTextColor(c[0], c[1], c[2]) }

func (p *page) font(style string, size float64, c [3]int) {
	p.SetFont("Helvetica", style, size)
	p.color(c)
}

// header is the band at the top: the shop on the left, what this is on the right.
func (p *page) header(shopName, shopLine, kind, kindLine string) {
	p.SetFillColor(brand[0], brand[1], brand[2])
	p.Rect(0, 0, pageWidth, 4, "F")
	p.SetY(margin)
	top := p.GetY()
	p.font("B", 16, ink)
	p.MultiCell(inner*0.6, 7, p.text(shopName), "", "L", false)
	if shopLine != "" {
		p.font("", 9, muted)
		p.MultiCell(inner*0.6, 4.5, p.text(shopLine), "", "L", false)
	}
	left := p.GetY()
	p.SetXY(margin+inner*0.6, top)
	p.font("B", 13, brand)
	p.CellFormat(inner*0.4, 7, p.text(kind), "", 2, "R", false, 0, "")
	p.font("", 9, muted)
	p.MultiCell(inner*0.4, 4.5, p.text(kindLine), "", "R", false)
	p.SetY(max(left, p.GetY()) + 6)
	p.hr()
}

func (p *page) hr() {
	p.SetDrawColor(rule[0], rule[1], rule[2])
	p.SetLineWidth(0.3)
	y := p.GetY()
	p.Line(margin, y, pageWidth-margin, y)
	p.SetY(y + 4)
}

// label and value stacked, for the boxes of figures.
func (p *page) figure(x, y, w float64, label, value string, c [3]int) {
	p.SetXY(x, y)
	p.font("", 8.5, muted)
	p.CellFormat(w, 4.5, p.text(label), "", 2, "L", false, 0, "")
	p.SetX(x)
	p.font("B", 12, c)
	p.CellFormat(w, 7, p.text(value), "", 0, "L", false, 0, "")
}

func (p *page) bytes() ([]byte, error) {
	var buf bytes.Buffer
	err := p.Output(&buf)
	return buf.Bytes(), err
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var digits []byte
	for ; n > 0; n /= 10 {
		digits = append([]byte{byte('0' + n%10)}, digits...)
	}
	return string(digits)
}
