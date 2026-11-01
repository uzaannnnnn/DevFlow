package middleware

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"runtime/debug"
	"time"

	"devflow/backend/internal/domain"

	"github.com/gin-gonic/gin"
)

// Recovery returns a Gin middleware that recovers from panics, logs the error,
// and returns a standard HTTP 500 internal server error JSON envelope.
func Recovery() gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if r := recover(); r != nil {
				reqID := GetRequestID(c)
				stack := string(debug.Stack())

				// Log structured internal error without leaking stack to client
				logEntry := map[string]any{
					"level":      "ERROR",
					"time":       time.Now().UTC().Format(time.RFC3339),
					"request_id": reqID,
					"panic":      fmt.Sprintf("%v", r),
					"path":       c.Request.URL.Path,
					"method":     c.Request.Method,
					"stack":      stack,
				}
				if logBytes, err := json.Marshal(logEntry); err == nil {
					log.Println(string(logBytes))
				} else {
					log.Printf("ERROR: panic recovered: %v\n%s", r, stack)
				}

				c.AbortWithStatusJSON(http.StatusInternalServerError, domain.ErrorResponse{
					Success: false,
					Error: domain.APIError{
						Code:    domain.ErrCodeInternal,
						Message: "An unexpected server error occurred",
						Details: []any{},
					},
				})
			}
		}()

		c.Next()
	}
}
