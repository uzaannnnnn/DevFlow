import { test, expect } from '@playwright/test';

test.describe('DevFlow Lean MVP — Browser E2E User Journeys', () => {
  const timestamp = Date.now();
  const testUser = {
    name: `Engineer ${timestamp}`,
    email: `devflow.e2e.${timestamp}@example.com`,
    password: 'SecurePassword123!',
  };
  const workspaceData = {
    name: `DevFlow Workspace ${timestamp}`,
    slug: `ws-${timestamp}`,
  };
  const projectData = {
    name: `Core Engine ${timestamp}`,
    key: `ENG${(timestamp % 1000).toString().padStart(3, '0')}`,
    description: 'Core backend engine and web services',
  };
  const taskData = {
    title: `Implement OAuth2 Flow ${timestamp}`,
    description: 'Setup token generation, refresh tokens, and rate limiting',
    updatedTitle: `Implement OAuth2 Flow ${timestamp} (V2 Verified)`,
  };

  test('complete end-to-end user journey across all MVP features', async ({ page }) => {
    // -------------------------------------------------------------------------
    // 1. REGISTER
    // -------------------------------------------------------------------------
    await page.goto('/register');
    await expect(page).toHaveURL(/.*\/register/);

    await page.fill('#email', testUser.email);
    await page.fill('#name', testUser.name);
    await page.fill('#password', testUser.password);

    await Promise.all([
      page.waitForURL((url) => url.pathname === '/', { timeout: 15000 }),
      page.click('button[type="submit"]'),
    ]);

    // -------------------------------------------------------------------------
    // 2. EMPTY STATE & WORKSPACE CREATION
    // -------------------------------------------------------------------------
    const createWsButton = page.locator('[data-testid="create-first-workspace-button"]');
    await expect(createWsButton).toBeVisible({ timeout: 10000 });
    await createWsButton.click();

    // Fill workspace modal
    await expect(page.locator('#ws-name')).toBeVisible();
    await page.fill('#ws-name', workspaceData.name);
    await page.fill('#ws-slug', workspaceData.slug);
    await page.click('button[type="submit"]');

    // Verify workspace dashboard loads
    const dashboardView = page.locator('[data-testid="dashboard-view"]');
    await expect(dashboardView).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('heading', { name: workspaceData.name })).toBeVisible();

    // -------------------------------------------------------------------------
    // 3. PROJECT NAVIGATION & CREATION
    // -------------------------------------------------------------------------
    await page.click('[data-testid="tab-projects"]');

    // Click create project
    const newProjectBtn = page.locator('[data-testid="create-project-button"], [data-testid="empty-create-project-button"]').first();
    await expect(newProjectBtn).toBeVisible({ timeout: 10000 });
    await newProjectBtn.click();

    // Fill project modal
    await expect(page.locator('#project-name')).toBeVisible();
    await page.fill('#project-name', projectData.name);
    await page.fill('#project-key', projectData.key);
    await page.fill('#project-description', projectData.description);
    await page.click('button[type="submit"]');

    // Upon creation, it navigates directly to ProjectDetailView
    await expect(page.getByRole('heading', { name: projectData.name })).toBeVisible({ timeout: 10000 });

    // Test navigation back to project list and clicking project card
    await page.click('[data-testid="back-to-projects-button"]');
    const projectCard = page.locator(`[data-testid="project-card-${projectData.key}"]`);
    await expect(projectCard).toBeVisible({ timeout: 10000 });
    await projectCard.click();

    // Verify project detail header
    await expect(page.getByRole('heading', { name: projectData.name })).toBeVisible({ timeout: 10000 });

    // -------------------------------------------------------------------------
    // 4. TASK CREATION (List View)
    // -------------------------------------------------------------------------
    await expect(page.locator('[data-testid="project-tab-tasks"]')).toBeVisible();
    await page.click('[data-testid="open-create-task-modal-button"]');

    await expect(page.locator('[data-testid="task-title-input"]')).toBeVisible();
    await page.fill('[data-testid="task-title-input"]', taskData.title);
    await page.fill('[data-testid="task-description-input"]', taskData.description);
    await page.click('[data-testid="submit-create-task-button"]');

    // Verify task is visible in task list
    await expect(page.getByText(taskData.title)).toBeVisible({ timeout: 10000 });

    // -------------------------------------------------------------------------
    // 5. KANBAN BOARD VIEW & DRAG-AND-DROP
    // -------------------------------------------------------------------------
    await page.click('[data-testid="view-mode-board-button"]');

    const todoCol = page.locator('[data-testid="kanban-column-todo"]');
    const inProgressCol = page.locator('[data-testid="kanban-column-in_progress"]');
    await expect(todoCol).toBeVisible({ timeout: 10000 });
    await expect(inProgressCol).toBeVisible({ timeout: 10000 });

    const taskCardLocator = todoCol.locator(`text=${taskData.title}`);
    await expect(taskCardLocator).toBeVisible({ timeout: 10000 });

    // Perform real drag-and-drop from TODO to IN_PROGRESS column
    const cardHandle = page.locator(`[data-testid^="kanban-card-"]:has-text("${taskData.title}")`).first();
    const cardBox = await cardHandle.boundingBox();
    const targetBox = await inProgressCol.boundingBox();

    expect(cardBox).not.toBeNull();
    expect(targetBox).not.toBeNull();

    if (cardBox && targetBox) {
      await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
      await page.mouse.down();
      // Move 15px to trigger pointer drag sensor threshold (5px constraint)
      await page.mouse.move(cardBox.x + cardBox.width / 2 + 15, cardBox.y + cardBox.height / 2 + 15, { steps: 5 });
      // Move over target column
      await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 10 });
      await page.mouse.up();
    }

    // Verify task card is now in IN_PROGRESS column
    const movedCard = inProgressCol.locator(`[data-testid^="kanban-card-"]`).first();
    await expect(movedCard).toBeVisible({ timeout: 10000 });
    await expect(movedCard).toContainText(taskData.title);

    // -------------------------------------------------------------------------
    // 6. TASK DETAIL MODAL, EDIT & COMMENT CREATION
    // -------------------------------------------------------------------------
    // Click task to open detail modal
    await page.waitForTimeout(500);
    await movedCard.click();

    const detailModalTitle = page.locator('[data-testid="detail-task-title"]');
    await expect(detailModalTitle).toBeVisible({ timeout: 10000 });
    await expect(detailModalTitle).toHaveText(taskData.title);

    // Add a comment
    const commentInput = page.locator('[data-testid="comment-input"]');
    await expect(commentInput).toBeVisible();
    await commentInput.fill('OAuth2 specs reviewed. Token expiration set to 15m.');
    await page.click('[data-testid="submit-comment-button"]');

    // Verify comment appears in comment list
    const commentList = page.locator('[data-testid="comment-list"]');
    await expect(commentList).toContainText('OAuth2 specs reviewed. Token expiration set to 15m.', { timeout: 10000 });

    // Edit task title from detail modal
    await page.click('[data-testid="edit-task-from-detail-button"]');
    const editTitleInput = page.locator('[data-testid="edit-task-title-input"]');
    await expect(editTitleInput).toBeVisible({ timeout: 10000 });
    await editTitleInput.fill(taskData.updatedTitle);
    await page.click('[data-testid="submit-edit-task-button"]');

    // Verify task title updated on the Kanban board
    await expect(page.getByRole('heading', { name: taskData.updatedTitle })).toBeVisible({ timeout: 10000 });

    // -------------------------------------------------------------------------
    // 7. PROJECT ACTIVITY FEED
    // -------------------------------------------------------------------------
    await page.click('[data-testid="project-tab-activity"]');
    const activityFeed = page.locator('[data-testid="project-activity-feed"]');
    await expect(activityFeed).toBeVisible({ timeout: 10000 });
    await expect(activityFeed).toContainText('Audit Trail', { timeout: 10000 });

    // -------------------------------------------------------------------------
    // 8. DASHBOARD METRICS SUMMARY
    // -------------------------------------------------------------------------
    await page.click('[data-testid="tab-overview"]');
    await expect(page.locator('[data-testid="dashboard-view"]')).toBeVisible({ timeout: 10000 });

    const totalProjectsMetric = page.locator('[data-testid="metric-total-projects"]');
    await expect(totalProjectsMetric).toHaveText('1');

    const totalTasksMetric = page.locator('[data-testid="metric-total-tasks"]');
    await expect(totalTasksMetric).toHaveText('1');

    // -------------------------------------------------------------------------
    // 9. LOGOUT & RE-LOGIN
    // -------------------------------------------------------------------------
    await page.getByRole('button', { name: 'Sign out' }).click();

    // Verify redirected to /login
    await expect(page).toHaveURL(/.*\/login/, { timeout: 10000 });
    await expect(page.locator('#email')).toBeVisible();

    // Log back in
    await page.fill('#email', testUser.email);
    await page.fill('#password', testUser.password);
    await Promise.all([
      page.waitForURL((url) => url.pathname === '/', { timeout: 15000 }),
      page.click('button[type="submit"]'),
    ]);

    // Verify logged in home page shows the active workspace and dashboard
    await expect(page.locator('[data-testid="dashboard-view"]')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('heading', { name: workspaceData.name })).toBeVisible();
  });
});

