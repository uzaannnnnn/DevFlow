package domain

import (
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
)

// Project roles
const (
	ProjectRoleOwner  = "owner"
	ProjectRoleAdmin  = "admin"
	ProjectRoleMember = "member"
)

// IsValidProjectRole checks whether a role string is one of the supported project roles.
func IsValidProjectRole(role string) bool {
	switch strings.ToLower(strings.TrimSpace(role)) {
	case ProjectRoleOwner, ProjectRoleAdmin, ProjectRoleMember:
		return true
	default:
		return false
	}
}

// Project permissions
const (
	PermProjectRead             Permission = "project:read"
	PermProjectUpdate           Permission = "project:update"
	PermProjectDelete           Permission = "project:delete"
	PermProjectMemberView       Permission = "project_member:view"
	PermProjectMemberAdd        Permission = "project_member:add"
	PermProjectMemberRemove     Permission = "project_member:remove"
	PermProjectMemberRoleChange Permission = "project_member:role_change"
)

// projectRolePermissions maps project roles to their authorized capabilities.
var projectRolePermissions = map[string]map[Permission]bool{
	ProjectRoleOwner: {
		PermProjectRead:             true,
		PermProjectUpdate:           true,
		PermProjectDelete:           true,
		PermProjectMemberView:       true,
		PermProjectMemberAdd:        true,
		PermProjectMemberRemove:     true,
		PermProjectMemberRoleChange: true,
	},
	ProjectRoleAdmin: {
		PermProjectRead:             true,
		PermProjectUpdate:           true,
		PermProjectDelete:           true, // Project Admins can archive/delete projects per AC-C5
		PermProjectMemberView:       true,
		PermProjectMemberAdd:        true,
		PermProjectMemberRemove:     true,
		PermProjectMemberRoleChange: true,
	},
	ProjectRoleMember: {
		PermProjectRead:       true,
		PermProjectMemberView: true,
	},
}

// HasProjectPermission checks whether a given project role holds the specified permission.
func HasProjectPermission(role string, perm Permission) bool {
	perms, ok := projectRolePermissions[strings.ToLower(strings.TrimSpace(role))]
	if !ok {
		return false
	}
	return perms[perm]
}

// CanManageProjectMember checks whether an actor holding actorRole can manage a member with targetRole.
func CanManageProjectMember(actorRole, targetRole string) bool {
	actor := strings.ToLower(strings.TrimSpace(actorRole))
	target := strings.ToLower(strings.TrimSpace(targetRole))

	switch actor {
	case ProjectRoleOwner:
		return true
	case ProjectRoleAdmin:
		// Project Admin cannot modify or remove a Project Owner
		return target != ProjectRoleOwner
	default:
		return false
	}
}

// Project key regex: 2 to 10 characters, starts with uppercase letter, followed by uppercase letters or digits.
var projectKeyRegex = regexp.MustCompile(`^[A-Z][A-Z0-9]{1,9}$`)

// ValidateProjectKey validates that a project key conforms to standard naming (2-10 uppercase alphanumeric, starting with letter).
func ValidateProjectKey(key string) bool {
	return projectKeyRegex.MatchString(key)
}

// GenerateProjectKey generates a suggested uppercase project key from a project name.
func GenerateProjectKey(name string) string {
	clean := strings.ToUpper(strings.TrimSpace(name))
	if clean == "" {
		return "PRJ"
	}

	words := strings.Fields(clean)
	var sb strings.Builder

	if len(words) >= 2 {
		for _, w := range words {
			reg := regexp.MustCompile(`[^A-Z0-9]`)
			wClean := reg.ReplaceAllString(w, "")
			if len(wClean) > 0 {
				sb.WriteByte(wClean[0])
			}
			if sb.Len() >= 5 {
				break
			}
		}
	}

	res := sb.String()
	if len(res) < 2 {
		reg := regexp.MustCompile(`[^A-Z0-9]`)
		alphanumeric := reg.ReplaceAllString(clean, "")
		if len(alphanumeric) >= 3 {
			res = alphanumeric[:3]
		} else if len(alphanumeric) == 2 {
			res = alphanumeric
		} else if len(alphanumeric) == 1 {
			res = alphanumeric + "P"
		} else {
			res = "PRJ"
		}
	}

	if len(res) > 10 {
		res = res[:10]
	}

	// Ensure it starts with a letter
	if res[0] < 'A' || res[0] > 'Z' {
		res = "P" + res
		if len(res) > 10 {
			res = res[:10]
		}
	}

	return res
}

// DTOs for Project API

type CreateProjectInput struct {
	Name        string  `json:"name" binding:"required,min=1,max=255"`
	Key         *string `json:"key"`
	Description *string `json:"description"`
}

type UpdateProjectInput struct {
	Name        *string `json:"name"`
	Description *string `json:"description"`
}

type ProjectResponse struct {
	ID          uuid.UUID  `json:"id"`
	WorkspaceID uuid.UUID  `json:"workspace_id"`
	Key         string     `json:"key"`
	Name        string     `json:"name"`
	Description *string    `json:"description,omitempty"`
	TaskCounter int32      `json:"task_counter"`
	CreatedBy   uuid.UUID  `json:"created_by"`
	Role        string     `json:"role,omitempty"` // Actor's role in this project
	MemberCount int64      `json:"member_count,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
	DeletedAt   *time.Time `json:"deleted_at,omitempty"`
}

type AddProjectMemberInput struct {
	UserID uuid.UUID `json:"user_id" binding:"required"`
	Role   string    `json:"role"`
}

type UpdateProjectMemberRoleInput struct {
	Role string `json:"role" binding:"required"`
}

type ProjectMemberResponse struct {
	ID          uuid.UUID `json:"id"`
	ProjectID   uuid.UUID `json:"project_id"`
	WorkspaceID uuid.UUID `json:"workspace_id"`
	UserID      uuid.UUID `json:"user_id"`
	Role        string    `json:"role"`
	Email       string    `json:"email"`
	Name        *string   `json:"name,omitempty"`
	AvatarURL   *string   `json:"avatar_url,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
}
