package middleware

import (
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const (
	// RequestIDHeader is the HTTP header used to propagate the request ID.
	RequestIDHeader = "X-Request-ID"
	// RequestIDKey is the context key under which the request ID is stored.
	RequestIDKey = "RequestID"
)

// RequestID returns a Gin middleware that extracts an existing X-Request-ID header
// or generates a new UUID v4, attaching it to both the gin.Context and the response header.
func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		reqID := c.GetHeader(RequestIDHeader)
		if reqID == "" {
			reqID = uuid.NewString()
		}

		c.Set(RequestIDKey, reqID)
		c.Header(RequestIDHeader, reqID)
		c.Next()
	}
}

// GetRequestID retrieves the request ID from the gin.Context, or returns an empty string.
func GetRequestID(c *gin.Context) string {
	if val, ok := c.Get(RequestIDKey); ok {
		if id, ok := val.(string); ok {
			return id
		}
	}
	return ""
}
