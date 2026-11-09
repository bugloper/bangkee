package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/labstack/echo/v5"

	"bangkee/internal/apperr"
)

// Turning a pin on the map into words for the shop's Location field
// ("Norzin Lam, Thimphu"). The words come from OpenStreetMap's Nominatim,
// asked from here rather than from the browser so that Bangkee follows its
// usage policy as one well-behaved client: it says who it is, sends at most
// one request a second, and remembers what it was told.

const nominatimURL = "https://nominatim.openstreetmap.org/reverse"

type geocoder struct {
	endpoint string
	client   *http.Client
	mu       sync.Mutex
	last     time.Time
	cache    map[string]string
}

func newGeocoder(endpoint string) *geocoder {
	return &geocoder{endpoint: endpoint, client: &http.Client{Timeout: 6 * time.Second}, cache: map[string]string{}}
}

// place is the useful part of Nominatim's answer.
type place struct {
	Address map[string]string `json:"address"`
	Error   string            `json:"error"`
}

// first is the first of these address parts that is there.
func first(address map[string]string, keys ...string) string {
	for _, key := range keys {
		if value := strings.TrimSpace(address[key]); value != "" {
			return value
		}
	}
	return ""
}

// describe is the street (or the neighbourhood) and the town, as a shop
// would write its address: "Norzin Lam, Thimphu".
func describe(address map[string]string) string {
	near := first(address, "road", "pedestrian", "footway", "neighbourhood", "quarter", "suburb", "hamlet")
	town := first(address, "city", "town", "village", "municipality", "county", "state_district", "state")
	switch {
	case near != "" && town != "" && !strings.EqualFold(near, town):
		return near + ", " + town
	case town != "":
		return town
	default:
		return near
	}
}

// lookup is the words for a point, from memory or from Nominatim.
func (g *geocoder) lookup(ctx context.Context, latitude, longitude float64) (string, error) {
	// Pins within about 10 metres share an answer.
	key := fmt.Sprintf("%.4f,%.4f", latitude, longitude)
	g.mu.Lock()
	if words, ok := g.cache[key]; ok {
		g.mu.Unlock()
		return words, nil
	}
	// One request a second for the whole server: wait out the rest of it.
	wait := time.Until(g.last.Add(time.Second))
	g.last = time.Now().Add(max(wait, 0))
	g.mu.Unlock()
	if wait > 0 {
		select {
		case <-ctx.Done():
			return "", ctx.Err()
		case <-time.After(wait):
		}
	}

	query := url.Values{
		"format": {"jsonv2"}, "lat": {strconv.FormatFloat(latitude, 'f', 6, 64)}, "lon": {strconv.FormatFloat(longitude, 'f', 6, 64)},
		"zoom": {"17"}, "addressdetails": {"1"}, "accept-language": {"en"},
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, g.endpoint+"?"+query.Encode(), nil)
	if err != nil {
		return "", err
	}
	request.Header.Set("User-Agent", "Bangkee/1.0 (+https://bangkee.app)")
	response, err := g.client.Do(request)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return "", fmt.Errorf("nominatim answered %d", response.StatusCode)
	}
	var found place
	if err := json.NewDecoder(response.Body).Decode(&found); err != nil {
		return "", err
	}
	words := describe(found.Address)
	g.mu.Lock()
	if len(g.cache) > 5000 {
		g.cache = map[string]string{}
	}
	g.cache[key] = words
	g.mu.Unlock()
	return words, nil
}

// placeName answers GET /api/places/name?lat=&lon= for a shop placing its pin.
func (s *Server) placeName(c *echo.Context) error {
	o, err := s.owner(c)
	if err != nil {
		return err
	}
	if !s.limiter.allow("place_name", strconv.FormatInt(o.User.ID, 10), 30, time.Minute) {
		return apperr.NewRateLimited("Too many lookups. Type the location instead.")
	}
	latitude, errLat := strconv.ParseFloat(c.QueryParam("lat"), 64)
	longitude, errLon := strconv.ParseFloat(c.QueryParam("lon"), 64)
	if errLat != nil || errLon != nil || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 {
		return apperr.NewRule("That is not a place on the map.")
	}
	words, err := s.places.lookup(c.Request().Context(), latitude, longitude)
	if err != nil {
		// Nothing the shop did wrong, and nothing to block on: the field stays theirs to type.
		return c.JSON(http.StatusOK, M{"name": ""})
	}
	return c.JSON(http.StatusOK, M{"name": words})
}

// UsePlacesEndpoint points the lookup elsewhere; tests use a stand-in for Nominatim.
func (s *Server) UsePlacesEndpoint(endpoint string) { s.places = newGeocoder(endpoint) }
