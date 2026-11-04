// Package storage is where uploaded screenshots live. Same layout as Active
// Storage, so the files the Rails app stored are found by the blob keys it
// recorded:
//
//	local: storage/<key[0:2]>/<key[2:4]>/<key>
//	s3:    <key> in the bucket
//
// A payment's photo is evidence: it has to be retrievable long after the
// payment it shows.
package storage

import (
	"bytes"
	"context"
	"io"
	"os"
	"path/filepath"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"

	"bangkee/internal/config"
)

type Storage struct {
	root   string // local only
	client *minio.Client
	bucket string
}

func New(cfg config.Storage, root string) (*Storage, error) {
	if !cfg.S3 {
		if err := os.MkdirAll(root, 0o755); err != nil {
			return nil, err
		}
		return &Storage{root: root}, nil
	}
	endpoint, secure := "s3.amazonaws.com", true
	lookup := minio.BucketLookupAuto
	if cfg.Endpoint != "" {
		// R2 and B2: path-style, like Rails' force_path_style.
		endpoint, secure, lookup = stripScheme(cfg.Endpoint), !hasScheme(cfg.Endpoint, "http://"), minio.BucketLookupPath
	}
	client, err := minio.New(endpoint, &minio.Options{
		Creds:        credentials.NewStaticV4(cfg.AccessKeyID, cfg.SecretAccessKey, ""),
		Secure:       secure,
		Region:       cfg.Region,
		BucketLookup: lookup,
	})
	if err != nil {
		return nil, err
	}
	return &Storage{client: client, bucket: cfg.Bucket}, nil
}

func hasScheme(url, scheme string) bool {
	return len(url) >= len(scheme) && url[:len(scheme)] == scheme
}

func stripScheme(url string) string {
	for _, scheme := range []string{"https://", "http://"} {
		if hasScheme(url, scheme) {
			return url[len(scheme):]
		}
	}
	return url
}

// ServiceName is Active Storage's service name for the rows this server writes.
func (s *Storage) ServiceName() string {
	if s.client != nil {
		return "s3"
	}
	return "local"
}

func (s *Storage) path(key string) string {
	if len(key) < 4 {
		return filepath.Join(s.root, key)
	}
	return filepath.Join(s.root, key[0:2], key[2:4], key)
}

func (s *Storage) Put(ctx context.Context, key, contentType string, data []byte) error {
	if s.client != nil {
		_, err := s.client.PutObject(ctx, s.bucket, key, bytes.NewReader(data), int64(len(data)),
			minio.PutObjectOptions{ContentType: contentType})
		return err
	}
	path := s.path(key)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}

func (s *Storage) Get(ctx context.Context, key string) ([]byte, error) {
	if s.client != nil {
		object, err := s.client.GetObject(ctx, s.bucket, key, minio.GetObjectOptions{})
		if err != nil {
			return nil, err
		}
		defer object.Close()
		return io.ReadAll(object)
	}
	return os.ReadFile(s.path(key))
}

// Delete removes a file; one already gone is not an error.
func (s *Storage) Delete(ctx context.Context, key string) error {
	if s.client != nil {
		return s.client.RemoveObject(ctx, s.bucket, key, minio.RemoveObjectOptions{})
	}
	if err := os.Remove(s.path(key)); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}
