package ai

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestLoadConfigReturnsDeprecatedError(t *testing.T) {
	_, err := LoadConfig("config/ai.yaml")

	require.Error(t, err)
	require.Contains(t, err.Error(), "configure the provider in Settings")
}
