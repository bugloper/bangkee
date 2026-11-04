// Package migrations embeds the schema, so the binary migrates the database
// it is pointed at on boot and needs nothing beside it.
package migrations

import "embed"

//go:embed *.sql
var FS embed.FS
