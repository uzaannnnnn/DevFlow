package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// CORS returns a middleware that handles Cross-Origin Resource Sharing
// using explicitly allowed origins and credentials support.
func CORS(allowedOrigins []string) gin.HandlerFunc {
	// Build map for O(1) lookup
	originsMap := make(map[string]bool, len(allowedOrigins))
	for _, origin := range allowedOrigins {
		originsMap[strings.ToLower(strings.TrimSpace(origin))] = true
	}

	return func(c *gin.Context) {
		origin := c.Request.Header.Get("Origin")
		if origin != "" {
			normalizedOrigin := strings.ToLower(strings.TrimSpace(origin))
			if originsMap[normalizedOrigin] {
				c.Header("Access-Control-Allow-Origin", origin)
				c.Header("Access-Control-Allow-Credentials", "true")
				c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD")
				c.Header("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept, Origin, X-Request-ID, X-CSRF-Token")
				c.Header("Access-Control-Expose-Headers", "Content-Length, X-Request-ID")
				c.Header("Access-Control-Max-Age", "86400")
			}
		}

		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}
