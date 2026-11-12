// Package szpt defines the SZPT section: socially significant food groups
// (a subset of the official list, order 362-nq) over existing canonical products.
package szpt

import (
	"context"
	"math"

	"adilbaga/backend-go/internal/catalog"
)

// Unit is the standard quantity a unit price refers to.
type Unit string

const (
	Kg    Unit = "kg"
	L     Unit = "l"
	Pcs10 Unit = "10pcs"
)

// Factor converts a price per base unit (gram, millilitre, piece) to the standard quantity.
func (u Unit) Factor() int {
	if u == Pcs10 {
		return 10
	}
	return 1000
}

type UnitPrice struct {
	Value float64 `json:"value"`
	Unit  Unit    `json:"unit"`
}

// PriceOf rounds half-up to 2 decimals for the response only; SQL sorts by the exact value.
func PriceOf(price int, size float64, u Unit) UnitPrice {
	exact := float64(price) * float64(u.Factor()) / size
	return UnitPrice{Value: math.Round(exact*100) / 100, Unit: u}
}

type Group struct {
	Slug  string    `json:"slug"`
	Name  string    `json:"name"`
	Unit  Unit      `json:"unit"`
	Sizes []float64 `json:"sizes"`
	Count int       `json:"count"`
}

type Offer struct {
	catalog.Offer
	UnitPrice *UnitPrice `json:"unitPrice"`
}

// Product keeps the catalog card shape; the outer Offers field replaces catalog.Product.Offers in JSON.
type Product struct {
	catalog.Product
	Offers    []Offer    `json:"offers"`
	UnitPrice *UnitPrice `json:"unitPrice"`
}

type Sort string

const (
	PriceAsc     Sort = "price_asc"
	UnitPriceAsc Sort = "unit_price_asc"
)

type Query struct {
	Group  string
	Sizes  []float64
	Sort   Sort
	Limit  int
	Offset int64
}

type Repository interface {
	ListGroups(context.Context) ([]Group, error)
	ListProducts(context.Context, Query) ([]Product, error)
}
