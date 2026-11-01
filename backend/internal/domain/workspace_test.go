package domain

import (
	"testing"
)

func TestIsValidRole(t *testing.T) {
	validRoles := []string{"owner", "admin", "member", "viewer", "OWNER", "Admin", " Member "}
	for _, r := range validRoles {
		if !IsValidRole(r) {
			t.Errorf("expected role %q to be valid", r)
		}
	}

	invalidRoles := []string{"", "superadmin", "guest", "root", "manager"}
	for _, r := range invalidRoles {
		if IsValidRole(r) {
			t.Errorf("expected role %q to be invalid", r)
		}
	}
}

func TestHasPermission(t *testing.T) {
	// 1. Owner has all permissions
	ownerPerms := []Permission{
		PermWorkspaceRead,
		PermWorkspaceUpdate,
		PermWorkspaceDelete,
		PermWorkspaceTransferOwnership,
		PermMemberView,
		PermMemberAdd,
		PermMemberRemove,
		PermMemberRoleChange,
	}
	for _, p := range ownerPerms {
		if !HasPermission(RoleOwner, p) {
			t.Errorf("expected Owner to have permission %v", p)
		}
	}

	// 2. Admin cannot delete workspace or transfer ownership
	if HasPermission(RoleAdmin, PermWorkspaceDelete) {
		t.Errorf("Admin must NOT have PermWorkspaceDelete")
	}
	if HasPermission(RoleAdmin, PermWorkspaceTransferOwnership) {
		t.Errorf("Admin must NOT have PermWorkspaceTransferOwnership")
	}
	if !HasPermission(RoleAdmin, PermWorkspaceUpdate) {
		t.Errorf("Admin must have PermWorkspaceUpdate")
	}
	if !HasPermission(RoleAdmin, PermMemberAdd) {
		t.Errorf("Admin must have PermMemberAdd")
	}

	// 3. Member cannot update or manage members
	if HasPermission(RoleMember, PermWorkspaceUpdate) {
		t.Errorf("Member must NOT have PermWorkspaceUpdate")
	}
	if HasPermission(RoleMember, PermMemberAdd) {
		t.Errorf("Member must NOT have PermMemberAdd")
	}
	if !HasPermission(RoleMember, PermWorkspaceRead) {
		t.Errorf("Member must have PermWorkspaceRead")
	}

	// 4. Viewer has read-only
	if HasPermission(RoleViewer, PermWorkspaceUpdate) {
		t.Errorf("Viewer must NOT have PermWorkspaceUpdate")
	}
	if HasPermission(RoleViewer, PermMemberRemove) {
		t.Errorf("Viewer must NOT have PermMemberRemove")
	}
	if !HasPermission(RoleViewer, PermWorkspaceRead) {
		t.Errorf("Viewer must have PermWorkspaceRead")
	}
}

func TestCanManageMember(t *testing.T) {
	// Owner can manage everyone
	if !CanManageMember(RoleOwner, RoleOwner) {
		t.Errorf("Owner should be able to manage Owner")
	}
	if !CanManageMember(RoleOwner, RoleAdmin) {
		t.Errorf("Owner should be able to manage Admin")
	}

	// Admin cannot manage Owner
	if CanManageMember(RoleAdmin, RoleOwner) {
		t.Errorf("SECURITY RISK: Admin must NOT be allowed to manage Owner")
	}
	// Admin can manage Admin, Member, Viewer
	if !CanManageMember(RoleAdmin, RoleAdmin) {
		t.Errorf("Admin should be able to manage Admin")
	}
	if !CanManageMember(RoleAdmin, RoleMember) {
		t.Errorf("Admin should be able to manage Member")
	}
	if !CanManageMember(RoleAdmin, RoleViewer) {
		t.Errorf("Admin should be able to manage Viewer")
	}

	// Member and Viewer cannot manage anyone
	if CanManageMember(RoleMember, RoleMember) {
		t.Errorf("Member must NOT be allowed to manage members")
	}
	if CanManageMember(RoleViewer, RoleViewer) {
		t.Errorf("Viewer must NOT be allowed to manage members")
	}
}

func TestCanAssignRole(t *testing.T) {
	// Owner can assign any valid role
	if !CanAssignRole(RoleOwner, RoleAdmin) {
		t.Errorf("Owner should be able to assign Admin")
	}
	if !CanAssignRole(RoleOwner, RoleOwner) {
		t.Errorf("Owner should be able to assign Owner (transfer)")
	}

	// Admin cannot assign Owner
	if CanAssignRole(RoleAdmin, RoleOwner) {
		t.Errorf("SECURITY RISK: Admin must NOT be allowed to assign Owner role (privilege escalation)")
	}
	if !CanAssignRole(RoleAdmin, RoleAdmin) {
		t.Errorf("Admin should be able to assign Admin")
	}
	if !CanAssignRole(RoleAdmin, RoleMember) {
		t.Errorf("Admin should be able to assign Member")
	}
	if !CanAssignRole(RoleAdmin, RoleViewer) {
		t.Errorf("Admin should be able to assign Viewer")
	}

	// Member cannot assign any role
	if CanAssignRole(RoleMember, RoleMember) {
		t.Errorf("Member must NOT be allowed to assign roles")
	}
}

func TestSlugGenerationAndValidation(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{"Simple name", "Acme Corp", "acme-corp"},
		{"Special characters", "DevFlow & Co. (Alpha)", "devflow-co-alpha"},
		{"Trim hyphens", "---Leading & Trailing---", "leading-trailing"},
		{"Short name", "AB", "ab-ws"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			slug := GenerateSlug(tt.input)
			if slug != tt.expected {
				t.Errorf("GenerateSlug(%q) = %q, expected %q", tt.input, slug, tt.expected)
			}
			if !ValidateSlug(slug) {
				t.Errorf("generated slug %q is invalid according to ValidateSlug", slug)
			}
		})
	}

	// Direct slug validation
	if !ValidateSlug("valid-slug-123") {
		t.Errorf("expected 'valid-slug-123' to be valid")
	}
	if ValidateSlug("Invalid_Slug") {
		t.Errorf("expected 'Invalid_Slug' with underscore/uppercase to be invalid")
	}
	if ValidateSlug("a") {
		t.Errorf("expected 1-char slug to be invalid")
	}
}

