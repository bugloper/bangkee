package domain

import (
	"context"
	"fmt"
	"slices"

	"bangkee/internal/apperr"
	"bangkee/internal/storage"
	"bangkee/internal/store"
)

// Photos of people and shops: a person's profile photo, and the photo a shop
// shows customers. Each has at most one; a new one replaces the old. A
// person's is served to anyone signed in (/api/attachments/:id); a shop's to
// anyone at all (/api/public/shop_photos/:id), like its items' photos.

const (
	UserRecordType = "User"
	AvatarName     = "avatar"
	ShopRecordType = "Shop"
	ShopPhotoName  = "photo"
)

// setPhoto puts a record's one photo in place, returning the replaced
// files' keys to delete once the transaction has committed.
func setPhoto(ctx context.Context, q *store.Queries, files *storage.Storage, recordType, name string, recordID int64, upload *Upload) ([]string, error) {
	var errs apperr.Errors
	if upload == nil {
		errs.Add("Photo must be attached")
	} else {
		errs.Check(slices.Contains(ItemImageTypes, upload.ContentType), "Photo must be a PNG, JPEG or WebP image")
		errs.Check(len(upload.Data) <= MaxItemImageBytes, "Photo must be smaller than 3 MB")
	}
	if err := errs.Err(); err != nil {
		return nil, err
	}
	old, err := detachFiles(ctx, q, recordType, []int64{recordID}, name)
	if err != nil {
		return nil, err
	}
	blobID, err := CreateBlob(ctx, q, files, *upload)
	if err != nil {
		return nil, err
	}
	return old, Attach(ctx, q, recordType, recordID, name, blobID)
}

func SetAvatar(ctx context.Context, q *store.Queries, files *storage.Storage, userID int64, upload *Upload) ([]string, error) {
	return setPhoto(ctx, q, files, UserRecordType, AvatarName, userID, upload)
}

func RemoveAvatar(ctx context.Context, q *store.Queries, userID int64) ([]string, error) {
	return detachFiles(ctx, q, UserRecordType, []int64{userID}, AvatarName)
}

func SetShopPhoto(ctx context.Context, q *store.Queries, files *storage.Storage, shopID int64, upload *Upload) ([]string, error) {
	return setPhoto(ctx, q, files, ShopRecordType, ShopPhotoName, shopID, upload)
}

func RemoveShopPhoto(ctx context.Context, q *store.Queries, shopID int64) ([]string, error) {
	return detachFiles(ctx, q, ShopRecordType, []int64{shopID}, ShopPhotoName)
}

// AvatarURLs maps each user to their photo's URL; users without one are absent.
func AvatarURLs(ctx context.Context, q *store.Queries, userIDs []int64) (map[int64]string, error) {
	return AttachmentURLs(ctx, q, UserRecordType, userIDs, AvatarName)
}

// ShopPhotoURLs maps each shop to its photo's URL. Shop photos are public,
// like item photos: the homepage shows them to visitors.
func ShopPhotoURLs(ctx context.Context, q *store.Queries, shopIDs []int64) (map[int64]string, error) {
	rows, err := q.AttachmentIDs(ctx, store.AttachmentIDsParams{RecordType: ShopRecordType, RecordIds: shopIDs, Name: ShopPhotoName})
	if err != nil {
		return nil, err
	}
	out := map[int64]string{}
	for _, row := range rows {
		out[row.RecordID] = fmt.Sprintf("/api/public/shop_photos/%d", row.ID)
	}
	return out, nil
}

// PhotoURL is one record's photo, or nil.
func PhotoURL(urls map[int64]string, id *int64) *string {
	if id == nil {
		return nil
	}
	return optionalURL(urls, *id)
}
