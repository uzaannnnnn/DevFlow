package middleware

import (
	"encoding/json"
	"io"
	"log"
	"os"
	"time"

	"github.com/gin-gonic/gin"
)

// LoggerConfig defines options for the structured JSON logger.
type LoggerConfig struct {
	Output io.Writer
}

// Logger returns a Gin middleware that records every HTTP request as a structured JSON log entry.
func Logger(cfg ...LoggerConfig) gin.HandlerFunc {
	var out io.Writer = os.Stdout
	if len(cfg) > 0 && cfg[0].Output != nil {
		out = cfg[0].Output
	}

	stdLog := log.New(out, "", 0)

	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path
		rawQuery := c.Request.URL.RawQuery

		c.Next()

		latency := time.Since(start)
		statusCode := c.Writer.Status()
		clientIP := c.ClientIP()
		method := c.Request.Method
		reqID := GetRequestID(c)

		fullPath := path
		if rawQuery != "" {
			fullPath = path + "?" + rawQuery
		}

		level := "INFO"
		if statusCode >= 500 {
			level = "ERROR"
		} else if statusCode >= 400 {
			level = "WARN"
		}

		entry := map[string]any{
			"level":         level,
			"time":          start.UTC().Format(time.RFC3339),
			"request_id":    reqID,
			"method":        method,
			"path":          fullPath,
			"status":        statusCode,
			"latency_ms":    float64(latency.Microseconds()) / 1000.0,
			"client_ip":     clientIP,
			"bytes_written": c.Writer.Size(),
		}

		if logBytes, err := json.Marshal(entry); err == nil {
			stdLog.Println(string(logBytes))
		}
	}
}
