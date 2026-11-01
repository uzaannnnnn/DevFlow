package auth

import (
	"strings"
	"testing"
)

func TestValidatePassword(t *testing.T) {
	tests := []struct {
		name     string
		password string
		wantErr  error
	}{
		{"Too short - empty", "", ErrPasswordTooShort},
		{"Too short - 7 chars", "1234567", ErrPasswordTooShort},
		{"Valid min - 8 chars", "12345678", nil},
		{"Valid standard", "StrongPassw0rd!", nil},
		{"Valid max - 72 chars", strings.Repeat("a", 72), nil},
		{"Too long - 73 chars", strings.Repeat("a", 73), ErrPasswordTooLong},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidatePassword(tt.password)
			if tt.wantErr != nil {
				if err != tt.wantErr {
					t.Fatalf("expected error %v, got %v", tt.wantErr, err)
				}
			} else if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
		})
	}
}

func TestHashAndVerifyPassword(t *testing.T) {
	// Use lightweight params for test speed
	fastParams := Argon2Params{
		Memory:      16 * 1024,
		Iterations:  1,
		Parallelism: 1,
		SaltLength:  16,
		KeyLength:   32,
	}

	password := "SecretP@ssword123!"

	hash, err := HashPasswordCustom(password, fastParams)
	if err != nil {
		t.Fatalf("HashPasswordCustom failed: %v", err)
	}

	if !strings.HasPrefix(hash, "$argon2id$v=19$") {
		t.Fatalf("expected hash to start with $argon2id$v=19$, got: %s", hash)
	}

	// 1. Verify correct password
	match, err := VerifyPassword(password, hash)
	if err != nil {
		t.Fatalf("VerifyPassword returned unexpected error: %v", err)
	}
	if !match {
		t.Fatalf("expected password to match hash")
	}

	// 2. Verify wrong password
	match, err = VerifyPassword("WrongPassword123!", hash)
	if err != nil {
		t.Fatalf("VerifyPassword returned error on wrong password: %v", err)
	}
	if match {
		t.Fatalf("expected wrong password to not match")
	}

	// 3. Unique salts: hashing same password twice produces different hashes
	hash2, err := HashPasswordCustom(password, fastParams)
	if err != nil {
		t.Fatalf("second hash failed: %v", err)
	}
	if hash == hash2 {
		t.Fatalf("expected unique salts for repeated hashing of same password")
	}
	match2, err := VerifyPassword(password, hash2)
	if err != nil || !match2 {
		t.Fatalf("expected hash2 to match password")
	}
}

func TestVerifyPassword_InvalidHashes(t *testing.T) {
	invalidHashes := []struct {
		name string
		hash string
	}{
		{"Empty string", ""},
		{"Arbitrary text", "not-a-valid-argon2id-hash"},
		{"Wrong algorithm", "$bcrypt$v=19$m=65536,t=3,p=2$c2FsdA$aGFzaA"},
		{"Missing parts", "$argon2id$v=19$m=65536,t=3,p=2$c2FsdA"},
		{"Corrupt params", "$argon2id$v=19$corrupt_params$c2FsdA$aGFzaA"},
		{"Corrupt salt base64", "$argon2id$v=19$m=65536,t=3,p=2$???$aGFzaA"},
		{"Corrupt hash base64", "$argon2id$v=19$m=65536,t=3,p=2$c2FsdA$???"},
		{"Incompatible version", "$argon2id$v=18$m=65536,t=3,p=2$c2FsdA$aGFzaA"},
	}

	for _, tt := range invalidHashes {
		t.Run(tt.name, func(t *testing.T) {
			match, err := VerifyPassword("SecretP@ssword123!", tt.hash)
			if match {
				t.Fatalf("expected match to be false for invalid hash")
			}
			if err == nil {
				t.Fatalf("expected error for invalid hash, got nil")
			}
		})
	}
}

func TestHashPassword_UnicodeSupport(t *testing.T) {
	fastParams := Argon2Params{
		Memory:      16 * 1024,
		Iterations:  1,
		Parallelism: 1,
		SaltLength:  16,
		KeyLength:   32,
	}

	unicodePassword := "KunciRahasia🚀2026!"
	hash, err := HashPasswordCustom(unicodePassword, fastParams)
	if err != nil {
		t.Fatalf("unexpected error hashing unicode password: %v", err)
	}

	match, err := VerifyPassword(unicodePassword, hash)
	if err != nil || !match {
		t.Fatalf("failed to verify unicode password: err=%v, match=%v", err, match)
	}
}
