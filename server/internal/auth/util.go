package auth

import (
	"crypto/rand"
	"encoding/hex"
)

func generateState() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
