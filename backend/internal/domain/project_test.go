package domain

import (
	"testing"
)

func TestProjectKeyValidation(t *testing.T) {
	tests := []struct {
		key   string
		valid bool
	}{
		{"DEV", true},
		{"API", true},
		{"DF1", true},
		{"PROJECT", true},
		{"PROJ12345", true},
		{"D1", true},
		{"A", false},          // Too short (< 2)
		{"VERYLONGKEY1", false}, // Too long (> 10)
		{"1ABC", false},        // Must start with letter
		{"dev", false},         // Must be uppercase
		{"DEV-1", false},       // Hyphens not allowed in key
		{"DEV_1", false},       // Underscores not allowed in key
		{"", false},            // Empty
	}

	for _, tt := range tests {
		t.Run(tt.key, func(t *testing.T) {
			got := ValidateProjectKey(tt.key)
			if got != tt.valid {
				t.Errorf("ValidateProjectKey(%q) = %v, want %v", tt.key, got, tt.valid)
			}
		})
	}
}

func TestGenerateProjectKey(t *testing.T) {
	tests := []struct {
		name string
		want string
	}{
		{"Backend Core API", "BCA"},
		{"Frontend", "FRO"},
		{"DevFlow Monorepo System", "DMS"},
		{"AI Engine", "AE"},
		{"Go", "GO"},
		{"123 Numeric", "P1N"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := GenerateProjectKey(tt.name)
			if !ValidateProjectKey(got) {
				t.Fatalf("GenerateProjectKey(%q) generated invalid key %q", tt.name, got)
			}
			if got != tt.want {
				t.Errorf("GenerateProjectKey(%q) = %q, want %q", tt.name, got, tt.want)
			}
		})
	}
}

func TestProjectPermissions(t *testing.T) {
	// Owner has all permissions
	if !HasProjectPermission(ProjectRoleOwner, PermProjectRead) {
		t.Error("expected owner to have PermProjectRead")
	}
	if !HasProjectPermission(ProjectRoleOwner, PermProjectUpdate) {
		t.Error("expected owner to have PermProjectUpdate")
	}
	if !HasProjectPermission(ProjectRoleOwner, PermProjectDelete) {
		t.Error("expected owner to have PermProjectDelete")
	}
	if !HasProjectPermission(ProjectRoleOwner, PermProjectMemberAdd) {
		t.Error("expected owner to have PermProjectMemberAdd")
	}

	// Admin has update and delete (AC-C5)
	if !HasProjectPermission(ProjectRoleAdmin, PermProjectRead) {
		t.Error("expected admin to have PermProjectRead")
	}
	if !HasProjectPermission(ProjectRoleAdmin, PermProjectUpdate) {
		t.Error("expected admin to have PermProjectUpdate")
	}
	if !HasProjectPermission(ProjectRoleAdmin, PermProjectDelete) {
		t.Error("expected admin to have PermProjectDelete")
	}

	// Member has read only
	if !HasProjectPermission(ProjectRoleMember, PermProjectRead) {
		t.Error("expected member to have PermProjectRead")
	}
	if HasProjectPermission(ProjectRoleMember, PermProjectUpdate) {
		t.Error("member must NOT have PermProjectUpdate")
	}
	if HasProjectPermission(ProjectRoleMember, PermProjectDelete) {
		t.Error("member must NOT have PermProjectDelete")
	}
	if HasProjectPermission(ProjectRoleMember, PermProjectMemberAdd) {
		t.Error("member must NOT have PermProjectMemberAdd")
	}
}

func TestCanManageProjectMember(t *testing.T) {
	// Owner can manage anyone
	if !CanManageProjectMember(ProjectRoleOwner, ProjectRoleAdmin) {
		t.Error("owner should be able to manage admin")
	}
	if !CanManageProjectMember(ProjectRoleOwner, ProjectRoleMember) {
		t.Error("owner should be able to manage member")
	}

	// Admin can manage member, but NOT owner
	if !CanManageProjectMember(ProjectRoleAdmin, ProjectRoleMember) {
		t.Error("admin should be able to manage member")
	}
	if CanManageProjectMember(ProjectRoleAdmin, ProjectRoleOwner) {
		t.Error("admin must NOT be able to manage owner")
	}

	// Member cannot manage anyone
	if CanManageProjectMember(ProjectRoleMember, ProjectRoleMember) {
		t.Error("member must NOT be able to manage anyone")
	}
}
