package api

import (
	"io"
	"mime/multipart"

	"bangkee/internal/domain"
)

// upload reads one file field of a multipart form; nil when it is absent or empty.
func upload(header *multipart.FileHeader) (*domain.Upload, error) {
	if header == nil {
		return nil, nil
	}
	file, err := header.Open()
	if err != nil {
		return nil, err
	}
	defer file.Close()
	data, err := io.ReadAll(file)
	if err != nil || len(data) == 0 {
		return nil, err
	}
	contentType := header.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	return &domain.Upload{Filename: header.Filename, ContentType: contentType, Data: data}, nil
}

// formFile finds the first of several field names that holds a file.
func formFile(form *multipart.Form, names ...string) *multipart.FileHeader {
	for _, name := range names {
		if files := form.File[name]; len(files) > 0 {
			return files[0]
		}
	}
	return nil
}

func formValue(form *multipart.Form, name string) string {
	if values := form.Value[name]; len(values) > 0 {
		return values[0]
	}
	return ""
}
