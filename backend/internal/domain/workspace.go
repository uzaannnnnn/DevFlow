package domain

import (
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
)

// Workspace Roles
const (
	RoleOwner  = "owner"
	RoleAdmin  = "admin"
	RoleMember = "member"
	RoleViewer = "viewer"
)

// IsValidRole checks whether a role string is a recognized workspace role.
func IsValidRole(role string) bool {
	switch strings.ToLower(strings.TrimSpace(role)) {
	case RoleOwner, RoleAdmin, RoleMember, RoleViewer:
		return true
	default:
		return false
	}
}

// Workspace Permissions
type Permission string

const (
	PermWorkspaceRead              Permission = "workspace:read"
	PermWorkspaceUpdate            Permission = "workspace:update"
	PermWorkspaceDelete            Permission = "workspace:delete"
	PermWorkspaceTransferOwnership Permission = "workspace:transfer_ownership"
	PermMemberView                 Permission = "member:view"
	PermMemberAdd                  Permission = "member:add"
	PermMemberRemove               Permission = "member:remove"
	PermMemberRoleChange           Permission = "member:role_change"
)

// rolePermissions maps each role to its granted permissions.
var rolePermissions = map[string]map[Permission]bool{
	RoleOwner: {
		PermWorkspaceRead:              true,
		PermWorkspaceUpdate:            true,
		PermWorkspaceDelete:            true,
		PermWorkspaceTransferOwnership: true,
		PermMemberView:                 true,
		PermMemberAdd:                  true,
		PermMemberRemove:               true,
		PermMemberRoleChange:           true,
	},
	RoleAdmin: {
		PermWorkspaceRead:    true,
		PermWorkspaceUpdate:  true,
		PermMemberView:       true,
		PermMemberAdd:        true,
		PermMemberRemove:     true,
		PermMemberRoleChange: true,
	},
	RoleMember: {
		PermWorkspaceRead: true,
		PermMemberView:    true,
	},
	RoleViewer: {
		PermWorkspaceRead: true,
		PermMemberView:    true,
	},
}

// HasPermission checks whether a given workspace role holds the specified permission.
func HasPermission(role string, perm Permission) bool {
	perms, ok := rolePermissions[strings.ToLower(strings.TrimSpace(role))]
	if !ok {
		return false
	}
	return perms[perm]
}

// CanManageMember checks whether an actor with actorRole is permitted to modify or remove
// a target member holding targetRole.
func CanManageMember(actorRole, targetRole string) bool {
	actor := strings.ToLower(strings.TrimSpace(actorRole))
	target := strings.ToLower(strings.TrimSpace(targetRole))

	switch actor {
	case RoleOwner:
		// Owner can manage any member
		return true
	case RoleAdmin:
		// Admin cannot manage the Owner, but can manage admins, members, and viewers
		return target != RoleOwner
	default:
		// Members and Viewers cannot manage members
		return false
	}
}

// CanAssignRole checks whether an actor with actorRole is permitted to assign targetRole to a member.
func CanAssignRole(actorRole, targetRole string) bool {
	actor := strings.ToLower(strings.TrimSpace(actorRole))
	target := strings.ToLower(strings.TrimSpace(targetRole))

	switch actor {
	case RoleOwner:
		// Owner can assign any role
		return IsValidRole(target)
	case RoleAdmin:
		// Admin cannot grant Owner privileges (prevents privilege escalation)
		return target == RoleAdmin || target == RoleMember || target == RoleViewer
	default:
		return false
	}
}

var slugRegex = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

// ValidateSlug validates that a slug consists of lowercase alphanumeric characters and single hyphens.
func ValidateSlug(slug string) bool {
	if len(slug) < 3 || len(slug) > 63 {
		return false
	}
	return slugRegex.MatchString(slug)
}

// GenerateSlug produces a sanitized URL-safe slug from a human-readable workspace name.
func GenerateSlug(name string) string {
	s := strings.ToLower(strings.TrimSpace(name))
	// Replace non-alphanumeric characters with hyphens
	reg := regexp.MustCompile(`[^a-z0-9]+`)
	s = reg.ReplaceAllString(s, "-")
	// Trim leading/trailing hyphens
	s = strings.Trim(s, "-")
	if len(s) > 50 {
		s = s[:50]
		s = strings.Trim(s, "-")
	}
	if len(s) < 3 {
		s = s + "-ws"
	}
	return s
}

// DTOs for Workspace API

type CreateWorkspaceInput struct {
	Name        string  `json:"name" binding:"required,min=1,max=255"`
	Slug        *string `json:"slug"`
	Description *string `json:"description"`
}

type UpdateWorkspaceInput struct {
	Name        *string `json:"name"`
	Slug        *string `json:"slug"`
	Description *string `json:"description"`
}

type WorkspaceResponse struct {
	ID          uuid.UUID  `json:"id"`
	Name        string     `json:"name"`
	Slug        string     `json:"slug"`
	Description *string    `json:"description,omitempty"`
	OwnerID     uuid.UUID  `json:"owner_id"`
	Role        string     `json:"role,omitempty"` // Actor's role in this workspace
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
	DeletedAt   *time.Time `json:"deleted_at,omitempty"`
}

type WorkspaceMemberResponse struct {
	ID          uuid.UUID `json:"id"`
	WorkspaceID uuid.UUID `json:"workspace_id"`
	UserID      uuid.UUID `json:"user_id"`
	Role        string    `json:"role"`
	Email       string    `json:"email"`
	Name        *string   `json:"name,omitempty"`
	AvatarURL   *string   `json:"avatar_url,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
}

type AddMemberInput struct {
	Email string `json:"email" binding:"required,email"`
	Role  string `json:"role" binding:"required"`
}

type UpdateMemberRoleInput struct {
	Role string `json:"role" binding:"required"`
}

