package domain

import (
	"bytes"
	"context"
	"fmt"
	"net/http"
	"time"

	"bangkee/internal/apperr"
	"bangkee/internal/storage"
	"bangkee/internal/store"
)

// Documents on an entry: the supplier's receipt, a delivery note, a photo
// of the goods. Any entry can carry up to MaxDocuments of them, each an
// image or a PDF under 8 MB. They are private: whoever can see the entry
// (the shop, and the account's customer) can open them, nobody else —
// /api/attachments checks the entry, not the file. They stay with the entry
// for as long as it is in the book, crossed out or not, and go when the
// customer is removed from the book.

const (
	DocumentName = "document"
	MaxDocuments = 5
)

type DocumentDTO struct {
	ID          int64     `json:"id"`
	URL         string    `json:"url"`
	Filename    string    `json:"filename"`
	ContentType string    `json:"content_type"`
	ByteSize    int64     `json:"byte_size"`
	AddedAt     time.Time `json:"added_at"`
}

func documentsFor(ctx context.Context, q *store.Queries, ids []int64) (map[int64][]DocumentDTO, error) {
	rows, err := q.AttachedFiles(ctx, store.AttachedFilesParams{RecordType: TransactionRecordType, RecordIds: ids, Name: DocumentName})
	if err != nil {
		return nil, err
	}
	out := map[int64][]DocumentDTO{}
	for _, r := range rows {
		out[r.RecordID] = append(out[r.RecordID], DocumentDTO{ID: r.ID, URL: AttachmentURL(r.ID), Filename: r.Filename, ContentType: r.ContentType, ByteSize: r.ByteSize, AddedAt: r.CreatedAt})
	}
	return out, nil
}

// documentType is what the file really is, from its first bytes — never
// from the name or the type the browser claimed. HEIC (an iPhone's photos)
// has no signature Go knows; it is recognised by its ISO box.
func documentType(data []byte) (string, bool) {
	switch sniffed := http.DetectContentType(data); sniffed {
	case "application/pdf", "image/png", "image/jpeg", "image/webp":
		return sniffed, true
	}
	if len(data) > 12 && bytes.Equal(data[4:8], []byte("ftyp")) {
		switch string(data[8:12]) {
		case "heic", "heix", "mif1", "msf1", "heim", "heis":
			return "image/heic", true
		}
	}
	return "", false
}

// AddDocument stores a file on an entry.
func AddDocument(ctx context.Context, q *store.Queries, files *storage.Storage, t Entry, upload *Upload, by int64) (int64, error) {
	if upload == nil {
		return 0, apperr.NewValidation("Choose a file to attach")
	}
	if t.CrossedOutAt != nil {
		return 0, apperr.NewRule("That entry was crossed out; nothing more can be attached to it.")
	}
	var errs apperr.Errors
	kind, ok := documentType(upload.Data)
	errs.Check(ok, "Attach a photo (JPEG, PNG, WebP, HEIC) or a PDF")
	errs.Check(len(upload.Data) <= MaxUploadBytes, "The file must be smaller than 8 MB")
	if err := errs.Err(); err != nil {
		return 0, err
	}
	count, err := q.CountAttachments(ctx, store.CountAttachmentsParams{RecordType: TransactionRecordType, RecordID: t.ID, Name: DocumentName})
	if err != nil {
		return 0, err
	}
	if count >= MaxDocuments {
		return 0, apperr.NewRule(fmt.Sprintf("An entry can have up to %d files. Remove one first.", MaxDocuments))
	}
	upload.ContentType = kind
	blob, err := CreateBlob(ctx, q, files, *upload)
	if err != nil {
		return 0, err
	}
	id, err := q.Attach(ctx, store.AttachParams{Name: DocumentName, RecordType: TransactionRecordType, RecordID: t.ID, BlobID: blob})
	if err != nil {
		return 0, err
	}
	return id, Audit(ctx, q, TransactionRecordType, t.ID, "document_added", &by, map[string]any{"filename": upload.Filename})
}

// RemoveDocument takes a file off an entry, returning its key to delete once
// the transaction has committed.
func RemoveDocument(ctx context.Context, q *store.Queries, t Entry, attachmentID, by int64) (string, error) {
	row, err := q.AttachmentOn(ctx, store.AttachmentOnParams{ID: attachmentID, RecordType: TransactionRecordType, RecordID: t.ID, Name: DocumentName})
	if err != nil {
		return "", err
	}
	if err := q.DeleteAttachment(ctx, row.ID); err != nil {
		return "", err
	}
	if err := q.DeleteBlobs(ctx, []int64{row.BlobID}); err != nil {
		return "", err
	}
	return row.Key, Audit(ctx, q, TransactionRecordType, t.ID, "document_removed", &by, map[string]any{"filename": row.Filename})
}

// detachDocuments removes every document on these entries (the account is
// leaving the book), returning the files' keys.
func detachDocuments(ctx context.Context, q *store.Queries, transactionIDs []int64) ([]string, error) {
	return detachFiles(ctx, q, TransactionRecordType, transactionIDs, DocumentName)
}
