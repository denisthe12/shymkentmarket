// Package catalog defines read-only domain contracts, without HTTP wiring.
package catalog

import (
	"context"
	"encoding/json"
	"errors"
	"regexp"
	"time"
)

var ErrNotFound = errors.New("catalog item not found")
var ErrInvalidQuery = errors.New("invalid catalog query")

type Category struct {
	ID   string `json:"id"`
	Slug string `json:"slug"`
	Name string `json:"name"`
}
type CategoryRef struct {
	Slug string `json:"slug"`
	Name string `json:"name"`
}
type FilterDefinition struct {
	Key     string            `json:"key"`
	Label   string            `json:"label"`
	Type    string            `json:"type"`
	Options []json.RawMessage `json:"options,omitempty"`
}
type FilterSchema struct {
	Category string             `json:"category"`
	Filters  []FilterDefinition `json:"filters"`
}

// StoreCode is a stores.code value. The set of stores lives in public.stores, not in code.
type StoreCode string

// storeCodePattern is the one store code format, shared with the stores.code CHECK and the OpenAPI StoreCode.
var storeCodePattern = regexp.MustCompile(`^[A-Z][A-Z0-9_]{1,31}$`)

// ValidStoreCode reports whether code has the store code format; it does not say the store exists.
func ValidStoreCode(code string) bool { return storeCodePattern.MatchString(code) }

type Offer struct {
	StoreCode StoreCode `json:"storeCode"`
	StoreName string    `json:"storeName"`
	Price     int       `json:"price"`
	OldPrice  *int      `json:"oldPrice"`
}
type Product struct {
	ID         string                     `json:"id"`
	Name       string                     `json:"name"`
	Brand      *string                    `json:"brand"`
	Category   CategoryRef                `json:"category"`
	ImageURL   *string                    `json:"imageUrl"`
	Attributes map[string]json.RawMessage `json:"attributes"`
	MinPrice   int                        `json:"minPrice"`
	Offers     []Offer                    `json:"offers"`
	SnapshotAt time.Time                  `json:"snapshotAt"`
}
type Sort string

const (
	PriceAsc  Sort = "price_asc"
	PriceDesc Sort = "price_desc"
	NameAsc   Sort = "name_asc"
)

type DynamicFilter map[string][]json.RawMessage
type ProductQuery struct {
	Category string
	Search   string
	Sort     Sort
	Limit    int
	Offset   int64
	Filters  DynamicFilter
}
type CategoryRepository interface {
	ListCategories(context.Context) ([]Category, error)
	GetFilterSchema(context.Context, string) (FilterSchema, error)
}

// VoiceVocabulary is configured metadata, not authoritative live option discovery.
// Declared options stay internal for primitive inference and preliminary validation.
type VoiceVocabulary struct {
	Categories []Category
	Schemas    []FilterSchema
}
type VoiceVocabularyRepository interface {
	ListVoiceVocabulary(context.Context) (VoiceVocabulary, error)
}
type ProductRepository interface {
	ListProducts(context.Context, ProductQuery) ([]Product, error)
	GetProductByID(context.Context, string) (Product, error)
}
