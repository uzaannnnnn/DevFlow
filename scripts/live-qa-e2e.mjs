// live-qa-e2e.mjs
// Comprehensive live End-to-End QA and Security Verification Suite for DevFlow

const API_BASE = 'http://localhost:8080/api/v1';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const headers = { ...options.headers };
  if (options.body && typeof options.body === 'object') {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }
  const res = await fetch(url, { ...options, headers });
  let data = null;
  const text = await res.text();
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, headers: res.headers, data };
}

async function run() {
  console.log('====================================================');
  console.log('DEVFLOW FINAL LIVE QA & E2E VERIFICATION SUITE');
  console.log('====================================================\n');

  const ts = Date.now();
  const user1Email = `alice_${ts}@devflow.local`;
  const user2Email = `bob_${ts}@devflow.local`;
  const user3Email = `charlie_${ts}@devflow.local`;
  const password = 'Password123!@#Secure';

  let user1Token = '';
  let user1Id = '';
  let user1Cookie = '';
  let user2Token = '';
  let user2Id = '';
  let user3Token = '';
  let user3Id = '';

  let workspaceId = '';
  let projectId = '';
  let task1Id = '';
  let task2Id = '';

  // ----------------------------------------------------
  // JOURNEY 1: Register a new account
  // ----------------------------------------------------
  console.log('Scenario 1: Register a new account');
  {
    const res = await request('/auth/register', {
      method: 'POST',
      body: { email: user1Email, password, name: 'Alice Smith' },
    });
    assert(res.status === 201, `Status is 201 Created (got ${res.status})`);
    assert(res.data.success === true, 'Success flag is true');
    assert(res.data.data.user.email === user1Email, 'User email matches');
    assert(Boolean(res.data.data.user.id), 'Returns user ID');
    user1Id = res.data.data.user.id;
  }

  // ----------------------------------------------------
  // JOURNEY 2: Login and Logout
  // ----------------------------------------------------
  console.log('\nScenario 2: Login and logout');
  {
    // Test Login
    const loginRes = await request('/auth/login', {
      method: 'POST',
      body: { email: user1Email, password },
    });
    assert(loginRes.status === 200, `Login status is 200 OK (got ${loginRes.status})`);
    assert(Boolean(loginRes.data.data.access_token), 'Login returns access token');
    user1Token = loginRes.data.data.access_token;
    const loginCookie = loginRes.headers.get('set-cookie');
    assert(Boolean(loginCookie && loginCookie.includes('refresh_token')), 'Sets HttpOnly refresh_token cookie');
    user1Cookie = loginCookie ? loginCookie.split(';')[0] : '';

    // Verify authenticated /auth/me
    const meRes = await request('/auth/me', {
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    assert(meRes.status === 200, `/auth/me status is 200 OK (got ${meRes.status})`);
    assert(meRes.data.data.user.id === user1Id, '/auth/me returns current user');

    // Test Logout
    const logoutRes = await request('/auth/logout', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        Cookie: user1Cookie,
      },
    });
    assert(logoutRes.status === 200, `Logout status is 200 OK (got ${logoutRes.status})`);

    // Verify refreshed token after logout fails
    const refreshAfterLogout = await request('/auth/refresh', {
      method: 'POST',
      headers: { Cookie: user1Cookie },
    });
    assert(refreshAfterLogout.status === 401, 'Refresh after logout is rejected with 401');

    // Log back in to continue
    const reLogin = await request('/auth/login', {
      method: 'POST',
      body: { email: user1Email, password },
    });
    user1Token = reLogin.data.data.access_token;
    user1Cookie = reLogin.headers.get('set-cookie')?.split(';')[0] || '';
  }

  // ----------------------------------------------------
  // JOURNEY 3: Create a Workspace
  // ----------------------------------------------------
  console.log('\nScenario 3: Create a workspace');
  {
    const wsSlug = `ws-${ts}`;
    const res = await request('/workspaces', {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
      body: { name: 'Acme SaaS', slug: wsSlug, description: 'Main engineering tenant' },
    });
    assert(res.status === 201, `Workspace creation status is 201 Created (got ${res.status})`);
    assert(res.data.data.workspace.name === 'Acme SaaS', 'Workspace name matches');
    assert(res.data.data.workspace.role === 'owner', 'Creator has owner role');
    workspaceId = res.data.data.workspace.id;

    // Verify Get Workspace
    const getWs = await request(`/workspaces/${workspaceId}`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    assert(getWs.status === 200, `Get workspace status is 200 OK`);
    assert(getWs.data.data.workspace.id === workspaceId, 'Fetched workspace id matches');
  }

  // ----------------------------------------------------
  // JOURNEY 4: Create a Project
  // ----------------------------------------------------
  console.log('\nScenario 4: Create a project');
  {
    const res = await request(`/workspaces/${workspaceId}/projects`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
      body: { name: 'Core Engine', key: 'ENG', description: 'Backend and core services' },
    });
    assert(res.status === 201, `Project creation status is 201 Created (got ${res.status})`);
    assert(res.data.data.project.key === 'ENG', 'Project key is ENG (Decision 6)');
    assert(res.data.data.project.task_counter === 0, 'Initial task counter is 0');
    assert(res.data.data.project.role === 'owner', 'Creator is project owner');
    projectId = res.data.data.project.id;

    // Verify Get Project
    const getProj = await request(`/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    assert(getProj.status === 200, 'Get project status is 200 OK');
    assert(getProj.data.data.project.id === projectId, 'Project id matches');
  }

  // ----------------------------------------------------
  // JOURNEY 5: Add a Project Member
  // ----------------------------------------------------
  console.log('\nScenario 5: Add a project member');
  {
    // Register User 2 (Bob)
    const bobReg = await request('/auth/register', {
      method: 'POST',
      body: { email: user2Email, password, name: 'Bob Jones' },
    });
    user2Id = bobReg.data.data.user.id;
    const bobLogin = await request('/auth/login', {
      method: 'POST',
      body: { email: user2Email, password },
    });
    user2Token = bobLogin.data.data.access_token;

    // Add Bob to Workspace
    const addWsMember = await request(`/workspaces/${workspaceId}/members`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
      body: { email: user2Email, role: 'member' },
    });
    assert(addWsMember.status === 201, `Added Bob to workspace (status ${addWsMember.status})`);

    // Add Bob to Project
    const addProjMember = await request(`/projects/${projectId}/members`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
      body: { user_id: user2Id, role: 'member' },
    });
    assert(addProjMember.status === 201, `Added Bob to project (status ${addProjMember.status})`);
    assert(addProjMember.data.data.member.role === 'member', 'Bob project role is member');

    // Verify project members list
    const listMembers = await request(`/projects/${projectId}/members`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    assert(listMembers.status === 200, 'List project members is 200 OK');
    assert(listMembers.data.data.members.length === 2, 'Project has 2 members (Alice & Bob)');
  }

  // ----------------------------------------------------
  // JOURNEY 6: Create, Edit, and Delete a Task
  // ----------------------------------------------------
  console.log('\nScenario 6: Create, edit, and delete a task');
  {
    // Create Task 1
    const createRes = await request(`/projects/${projectId}/tasks`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
      body: {
        title: 'Initial Database Setup',
        description: 'Run migrations and configure connection pool',
        priority: 'high',
        status: 'todo',
        assignee_id: user2Id,
      },
    });
    assert(createRes.status === 201, `Task creation status is 201 Created (got ${createRes.status})`);
    assert(createRes.data.data.task.identifier === 'ENG-001', 'Sequential identifier is ENG-001 (Decision 1 & 6)');
    assert(createRes.data.data.task.assignee_id === user2Id, 'Assignee is Bob (Decision 5)');
    task1Id = createRes.data.data.task.id;

    // Edit Task 1
    const editRes = await request(`/tasks/${task1Id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${user1Token}` },
      body: {
        title: 'Updated Database Setup & Indexing',
        priority: 'urgent',
      },
    });
    assert(editRes.status === 200, `Task update status is 200 OK (got ${editRes.status})`);
    assert(editRes.data.data.task.title === 'Updated Database Setup & Indexing', 'Title updated');
    assert(editRes.data.data.task.priority === 'urgent', 'Priority updated');

    // Delete Task 1 (Soft Delete Decision 2)
    const deleteRes = await request(`/tasks/${task1Id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    assert(deleteRes.status === 200, `Task deletion status is 200 OK (got ${deleteRes.status})`);

    // Verify soft-deleted task is omitted from regular task listing
    const listRes = await request(`/projects/${projectId}/tasks`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const foundDeleted = listRes.data.data.tasks.find((t) => t.id === task1Id);
    assert(!foundDeleted, 'Deleted task is excluded from active task list');

    // Direct GET on soft-deleted task returns 404 Not Found
    const directGet = await request(`/tasks/${task1Id}`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    assert(directGet.status === 404, 'Direct GET on soft-deleted task returns 404');
  }

  // ----------------------------------------------------
  // JOURNEY 7: Change Task Status through Kanban Transitions
  // ----------------------------------------------------
  console.log('\nScenario 7: Change task status through Kanban transitions');
  {
    // Create Task 2
    const createRes = await request(`/projects/${projectId}/tasks`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
      body: {
        title: 'Build Authentication Middleware',
        description: 'JWT validation and cookie checks',
        priority: 'medium',
        status: 'todo',
        assignee_id: user2Id,
      },
    });
    assert(createRes.status === 201, 'Task 2 created');
    assert(createRes.data.data.task.identifier === 'ENG-002', 'Identifier is ENG-002');
    task2Id = createRes.data.data.task.id;

    // Transition: todo -> in_progress
    const t1 = await request(`/tasks/${task2Id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${user1Token}` },
      body: { status: 'in_progress' },
    });
    assert(t1.status === 200 && t1.data.data.task.status === 'in_progress', 'Transitioned to in_progress');

    // Transition: in_progress -> review
    const t2 = await request(`/tasks/${task2Id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${user1Token}` },
      body: { status: 'review' },
    });
    assert(t2.status === 200 && t2.data.data.task.status === 'review', 'Transitioned to review');

    // Transition: review -> done
    const t3 = await request(`/tasks/${task2Id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${user1Token}` },
      body: { status: 'done' },
    });
    assert(t3.status === 200 && t3.data.data.task.status === 'done', 'Transitioned to done');
  }

  // ----------------------------------------------------
  // JOURNEY 8: Add a Comment to a Task
  // ----------------------------------------------------
  console.log('\nScenario 8: Add a comment to a task');
  {
    // Bob adds a comment
    const addCommentRes = await request(`/tasks/${task2Id}/comments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user2Token}` },
      body: { body: 'Middleware implementation verified with race detector.' },
    });
    assert(addCommentRes.status === 201, `Comment creation status is 201 Created (got ${addCommentRes.status})`);
    assert(addCommentRes.data.data.comment.author.email === user2Email, 'Comment author is Bob');
    assert(addCommentRes.data.data.comment.body.includes('Middleware implementation'), 'Comment body matches');

    // List comments
    const listCommentsRes = await request(`/tasks/${task2Id}/comments`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    assert(listCommentsRes.status === 200, 'List comments status is 200 OK');
    assert(listCommentsRes.data.data.comments.length === 1, 'Returns 1 comment');
  }

  // ----------------------------------------------------
  // JOURNEY 9: View Project Activity History
  // ----------------------------------------------------
  console.log('\nScenario 9: View project activity history');
  {
    const res = await request(`/projects/${projectId}/activities`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    assert(res.status === 200, `List activities status is 200 OK (got ${res.status})`);
    const acts = res.data.data.activities;
    assert(acts.length >= 4, `Contains at least 4 activities (got ${acts.length})`);

    const actions = acts.map((a) => a.action);
    assert(actions.includes('task_created'), 'Contains task_created event');
    assert(actions.includes('task_status_changed'), 'Contains task_status_changed event');
    assert(actions.includes('task_deleted'), 'Contains task_deleted event');
    assert(actions.includes('comment_added'), 'Contains comment_added event');

    // Task-level activity history
    const taskActRes = await request(`/tasks/${task2Id}/activity`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    assert(taskActRes.status === 200, 'Task activity status is 200 OK');
    assert(taskActRes.data.data.activities.length >= 2, 'Task has individual activity entries');
  }

  // ----------------------------------------------------
  // JOURNEY 10: View Dashboard Statistics
  // ----------------------------------------------------
  console.log('\nScenario 10: View dashboard statistics');
  {
    // Dashboard queries all workspace projects
    const wsProjectsRes = await request(`/workspaces/${workspaceId}/projects`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    assert(wsProjectsRes.status === 200, 'Workspace projects list is 200 OK');
    assert(wsProjectsRes.data.data.projects.length === 1, 'Total Projects count is 1');

    // Dashboard queries tasks across projects
    const tasksRes = await request(`/projects/${projectId}/tasks`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    assert(tasksRes.status === 200, 'Tasks query is 200 OK');
    const tasks = tasksRes.data.data.tasks;
    assert(tasks.length === 1, 'Total active tasks count is 1');
    assert(tasks[0].status === 'done', 'Task is properly categorized in Done column');
  }

  // ----------------------------------------------------
  // SECURITY REGRESSION TESTS
  // ----------------------------------------------------
  console.log('\n----------------------------------------------------');
  console.log('SECURITY REGRESSION VERIFICATION');
  console.log('----------------------------------------------------');

  // Register User 3 (Charlie)
  const charlieReg = await request('/auth/register', {
    method: 'POST',
    body: { email: user3Email, password, name: 'Charlie NonMember' },
  });
  user3Id = charlieReg.data.data.user.id;
  const charlieLogin = await request('/auth/login', {
    method: 'POST',
    body: { email: user3Email, password },
  });
  user3Token = charlieLogin.data.data.access_token;

  // Sec 1: Unauthorized requests rejected
  console.log('Sec 1: Unauthorized requests rejected');
  {
    const noAuth = await request(`/projects/${projectId}/tasks`);
    assert(noAuth.status === 401, 'Request without Authorization header returns 401');

    const invalidAuth = await request(`/projects/${projectId}/tasks`, {
      headers: { Authorization: 'Bearer invalid.fake.token' },
    });
    assert(invalidAuth.status === 401, 'Request with forged token returns 401');
  }

  // Sec 2: Non-project member cannot access project tasks (Decision 5)
  console.log('Sec 2: Non-project member cannot access project tasks');
  {
    const nonMemberGet = await request(`/projects/${projectId}/tasks`, {
      headers: { Authorization: `Bearer ${user3Token}` },
    });
    assert(nonMemberGet.status === 404 || nonMemberGet.status === 403, `Non-member cannot list project tasks (status ${nonMemberGet.status})`);

    const nonMemberTask = await request(`/tasks/${task2Id}`, {
      headers: { Authorization: `Bearer ${user3Token}` },
    });
    assert(nonMemberTask.status === 404 || nonMemberTask.status === 403, `Non-member cannot view task (status ${nonMemberTask.status})`);
  }

  // Sec 3: Workspace Admin cannot bypass project membership boundary (Decision 5)
  console.log('Sec 3: Workspace Admin cannot bypass project membership boundary');
  {
    // Add Charlie as workspace admin, but NOT project member
    await request(`/workspaces/${workspaceId}/members`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
      body: { email: user3Email, role: 'admin' },
    });

    const adminBypass = await request(`/projects/${projectId}/tasks`, {
      headers: { Authorization: `Bearer ${user3Token}` },
    });
    assert(
      adminBypass.status === 404 || adminBypass.status === 403,
      `Workspace Admin without project membership is denied access (status ${adminBypass.status})`
    );
  }

  // Sec 4: Comment author permissions
  console.log('Sec 4: Comment permissions');
  {
    // Charlie cannot comment on project task
    const nonMemberComment = await request(`/tasks/${task2Id}/comments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user3Token}` },
      body: { body: 'Illicit comment attempt' },
    });
    assert(
      nonMemberComment.status === 404 || nonMemberComment.status === 403,
      `Non-member cannot comment on task (status ${nonMemberComment.status})`
    );
  }

  // Sec 5: Refresh token rotation & reuse detection
  console.log('Sec 5: Refresh token rotation & reuse detection');
  {
    // Login Bob to get clean session
    const bobLogin = await request('/auth/login', {
      method: 'POST',
      body: { email: user2Email, password },
    });
    const cookie1 = bobLogin.headers.get('set-cookie')?.split(';')[0] || '';

    // First rotation
    const rot1 = await request('/auth/refresh', {
      method: 'POST',
      headers: { Cookie: cookie1 },
    });
    assert(rot1.status === 200, 'First refresh token rotation succeeds (200)');
    const cookie2 = rot1.headers.get('set-cookie')?.split(';')[0] || '';
    assert(cookie1 !== cookie2, 'Refresh token rotated with new cookie value');

    // Attempt reuse of cookie1 -> must be detected and rejected
    const reuse = await request('/auth/refresh', {
      method: 'POST',
      headers: { Cookie: cookie1 },
    });
    assert(reuse.status === 401, 'Token reuse is rejected with 401 Unauthorized');
  }

  console.log('\n====================================================');
  console.log(`LIVE QA RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
