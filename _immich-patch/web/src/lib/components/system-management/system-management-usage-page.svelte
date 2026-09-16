<script lang="ts">
  import DeleteConfirmDialog from '$lib/components/admin-page/delete-confirm-dialogue.svelte';
  import RestoreDialogue from '$lib/components/admin-page/restore-dialogue.svelte';
  import UserDeviceAssignmentDialog from '$lib/components/admin-page/user-device-assignment-dialog.svelte';
  import CreateUserForm from '$lib/components/forms/create-user-form.svelte';
  import EditUserForm from '$lib/components/forms/edit-user-form.svelte';
  import MaterialLibraryPagination from '$lib/components/material-library/material-library-pagination.svelte';
  import ConfirmDialog from '$lib/components/shared-components/dialog/confirm-dialog.svelte';
  import UserAvatar from '$lib/components/shared-components/user-avatar.svelte';
  import {
    NotificationType,
    notificationController,
  } from '$lib/components/shared-components/notification/notification';
  import { DEFAULT_ALBUM_PAGE_SIZE, paginateItems } from '$lib/utils/album-library.util';
  import { formatAlbumDateTime } from '$lib/utils/album-library.util';
  import { copyToClipboard } from '$lib/utils';
  import { dialogController } from '$lib/components/shared-components/dialog/dialog';
  import { handleError } from '$lib/utils/handle-error';
  import { getUserManagementRoleBadge, isAdmin2, isSuperAdmin } from '$lib/utils/permissions';
  import SystemManagementRoleAssignDialog from '$lib/components/system-management/system-management-role-assign-dialog.svelte';
  import TrashSegmented from '$lib/components/trash-page/trash-segmented.svelte';
  import { featureFlags } from '$lib/stores/server-config.store';
  import { user } from '$lib/stores/user.store';
  import { websocketEvents } from '$lib/stores/websocket';
  import {
    deleteUserAdmin,
    searchUsersAdmin,
    updateUserAdmin,
    UserStatus,
    type UserAdminResponseDto,
  } from '@immich/sdk';
  import { Code, IconButton, Text } from '@immich/ui';
  import {
    mdiAccountOff,
    mdiAccountOutline,
    mdiContentCopy,
    mdiKeyOutline,
    mdiMagnify,
    mdiMonitor,
    mdiPencilOutline,
    mdiRestore,
    mdiShieldAccountOutline,
    mdiCheckAll,
    mdiClose,
    mdiPlus,
    mdiSquareOutline,
    mdiTrashCanOutline,
  } from '@mdi/js';
  import Icon from '$lib/components/elements/icon.svelte';
  import CjvCheckbox from '$lib/components/shared-components/cjv/cjv-checkbox.svelte';
  import { DateTime } from 'luxon';
  import { onMount } from 'svelte';

  type Props = {
    allUsers: UserAdminResponseDto[];
  };

  let { allUsers: initialUsers }: Props = $props();

  let allUsers = $state<UserAdminResponseDto[]>([]);
  let deviceCountMap = $state<Record<string, number>>({});

  let keyword = $state('');
  let roleFilter = $state<'all' | 'super' | 'admin' | 'user'>('all');
  let statusFilter = $state<'all' | 'active' | 'disabled'>('all');
  let deviceFilter = $state<'all' | 'assigned' | 'unassigned'>('all');
  let createdFrom = $state('');
  let createdTo = $state('');
  let pageNum = $state(1);
  let pageSize = $state(DEFAULT_ALBUM_PAGE_SIZE);

  let showCreateForm = $state(false);
  let showEditForm = $state(false);
  let showDeleteDialog = $state(false);
  let showRestoreDialog = $state(false);
  let showDeviceDialog = $state(false);
  let showRoleDialog = $state(false);
  let showPasswordResetSuccess = $state(false);
  let selectedUser = $state<UserAdminResponseDto>();
  let newPassword = $state('');
  let selectedUserIds = $state<string[]>([]);

  const roleFilterOptions = [
    { value: 'all' as const, label: '全部' },
    { value: 'super' as const, label: '超级管理员' },
    { value: 'admin' as const, label: '管理员' },
    { value: 'user' as const, label: '普通用户' },
  ];

  const deviceFilterOptions = [
    { value: 'all' as const, label: '全部' },
    { value: 'assigned' as const, label: '已分配' },
    { value: 'unassigned' as const, label: '未分配' },
  ];

  const statusFilterOptions = [
    { value: 'all' as const, label: '全部' },
    { value: 'active' as const, label: '正常' },
    { value: 'disabled' as const, label: '禁用' },
  ];

  const filteredUsers = $derived.by(() => {
    const q = keyword.trim().toLowerCase();

    return allUsers.filter((item) => {
      if (q && !`${item.name} ${item.phone} ${item.email ?? ''}`.toLowerCase().includes(q)) {
        return false;
      }

      if (roleFilter === 'super' && !(item.isAdmin && !isAdmin2(item))) return false;
      if (roleFilter === 'admin' && !isAdmin2(item)) return false;
      if (roleFilter === 'user' && item.isAdmin) return false;

      const isDisabled = !!item.deletedAt || item.status !== UserStatus.Active;
      if (statusFilter === 'active' && isDisabled) return false;
      if (statusFilter === 'disabled' && !isDisabled) return false;

      const deviceCount = deviceCountMap[item.id] ?? 0;
      if (deviceFilter === 'assigned' && !item.isAdmin && deviceCount <= 0) return false;
      if (deviceFilter === 'unassigned' && (item.isAdmin || deviceCount > 0)) return false;

      if (createdFrom) {
        const from = DateTime.fromISO(createdFrom).startOf('day');
        const created = DateTime.fromISO(item.createdAt);
        if (created < from) return false;
      }

      if (createdTo) {
        const to = DateTime.fromISO(createdTo).endOf('day');
        const created = DateTime.fromISO(item.createdAt);
        if (created > to) return false;
      }

      return true;
    });
  });

  const pagination = $derived(paginateItems(filteredUsers, pageNum, pageSize));
  const pagedUsers = $derived(pagination.items);
  const selectableFilteredUsers = $derived(
    filteredUsers.filter((item) => !item.deletedAt && item.id !== $user?.id),
  );
  const selectableFilteredIds = $derived(selectableFilteredUsers.map((item) => item.id));
  const hasAllFilteredSelected = $derived(
    selectableFilteredIds.length > 0 &&
      selectableFilteredIds.every((id) => selectedUserIds.includes(id)),
  );
  const hasSomeFilteredSelected = $derived(
    selectableFilteredIds.some((id) => selectedUserIds.includes(id)),
  );
  const selectedUsers = $derived(allUsers.filter((item) => selectedUserIds.includes(item.id)));

  $effect(() => {
    keyword;
    roleFilter;
    statusFilter;
    deviceFilter;
    createdFrom;
    createdTo;
    pageNum = 1;
    selectedUserIds = [];
  });

  $effect(() => {
    if (pageNum > pagination.totalPages) {
      pageNum = pagination.totalPages;
    }
  });

  onMount(() => {
    allUsers = initialUsers;
    void refreshDeviceCounts();

    return websocketEvents.on('on_user_delete', (userId: string) => {
      allUsers = allUsers.filter((item) => item.id !== userId);
    });
  });

  const refreshDeviceCounts = async () => {
    try {
      const resp = await fetch('/api/external/cast-devices/admin/user-device-counts', { credentials: 'include' });
      if (resp.ok) {
        const data = (await resp.json()) as { counts?: { userId: string; count: number }[] };
        deviceCountMap = Object.fromEntries((data.counts ?? []).map((row) => [row.userId, row.count]));
      }
    } catch {
      // 忽略设备数加载失败
    }
  };

  const refreshUsers = async () => {
    allUsers = await searchUsersAdmin({ withDeleted: true });
    await refreshDeviceCounts();
  };

  const getAssignedDeviceCount = (item: UserAdminResponseDto) => {
    if (item.isAdmin) {
      return null;
    }
    return deviceCountMap[item.id] ?? 0;
  };

  const getStatusLabel = (item: UserAdminResponseDto) => {
    if (item.deletedAt || item.status !== UserStatus.Active) {
      return { label: '禁用', tone: 'disabled' as const };
    }
    return { label: '正常', tone: 'active' as const };
  };

  const formatUserIdLabel = (item: UserAdminResponseDto) => `ID-${item.id.slice(0, 4).toUpperCase()}`;

  const formatRelativeLogin = (value?: string | null) => {
    if (!value) {
      return '—';
    }
    const dt = DateTime.fromISO(value);
    if (!dt.isValid) {
      return '—';
    }
    const diffMinutes = Math.abs(dt.diffNow('minutes').minutes);
    if (diffMinutes < 60) {
      const minutes = Math.max(1, Math.round(diffMinutes));
      return `${minutes} 分钟前`;
    }
    const diffHours = Math.abs(dt.diffNow('hours').hours);
    if (diffHours < 24) {
      return `${Math.round(diffHours)} 小时前`;
    }
    const diffDays = Math.abs(dt.diffNow('days').days);
    if (diffDays < 2) {
      return `昨天 ${dt.toFormat('HH:mm')}`;
    }
    return formatAlbumDateTime(value);
  };

  const getRoleBadgeIcon = (tone: 'super' | 'admin' | 'user') => {
    if (tone === 'user') {
      return mdiAccountOutline;
    }
    return mdiShieldAccountOutline;
  };

  const generatePassword = (length = 16) => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  };

  const toggleUserSelect = (userId: string) => {
    selectedUserIds = selectedUserIds.includes(userId)
      ? selectedUserIds.filter((id) => id !== userId)
      : [...selectedUserIds, userId];
  };

  const toggleFilteredSelectAll = () => {
    if (hasAllFilteredSelected) {
      selectedUserIds = selectedUserIds.filter((id) => !selectableFilteredIds.includes(id));
      return;
    }
    selectedUserIds = [...new Set([...selectedUserIds, ...selectableFilteredIds])];
  };

  const clearSearch = () => {
    keyword = '';
  };

  const handleBatchSetRole = () => {
    if (!isSuperAdmin($user)) {
      notificationController.show({
        type: NotificationType.Info,
        message: '仅超级管理员可设置角色',
      });
      return;
    }

    const target = selectedUsers.find((item) => !item.deletedAt && item.id !== $user?.id);
    if (!target) {
      notificationController.show({
        type: NotificationType.Info,
        message: '请选择可设置角色的用户',
      });
      return;
    }
    selectedUser = target;
    showRoleDialog = true;
  };

  const handleBatchDeleteUsers = async () => {
    const targets = selectedUsers.filter((item) => !item.deletedAt && item.id !== $user?.id);
    if (targets.length === 0) {
      return;
    }

    const confirmed = await dialogController.show({
      prompt: `确认删除已选的 ${targets.length} 位用户？`,
    });
    if (!confirmed) {
      return;
    }

    try {
      for (const target of targets) {
        await deleteUserAdmin({
          id: target.id,
          userAdminDeleteDto: { force: false },
        });
      }
      selectedUserIds = [];
      await refreshUsers();
      notificationController.show({
        type: NotificationType.Success,
        message: `已删除 ${targets.length} 位用户`,
      });
    } catch (error) {
      handleError(error, '批量删除失败');
    }
  };

  const handleDisableUser = async (target: UserAdminResponseDto) => {
    const confirmed = await dialogController.show({
      prompt: `确认停用用户「${target.name}」？停用后该账号将无法登录。`,
    });
    if (!confirmed) {
      return;
    }

    try {
      await deleteUserAdmin({
        id: target.id,
        userAdminDeleteDto: { force: false },
      });
      selectedUserIds = selectedUserIds.filter((id) => id !== target.id);
      await refreshUsers();
      notificationController.show({
        type: NotificationType.Success,
        message: `用户「${target.name}」已停用`,
      });
    } catch (error) {
      handleError(error, '停用用户失败');
    }
  };

  const handleBatchDisableUsers = async () => {
    const targets = selectedUsers.filter((item) => !item.deletedAt && item.id !== $user?.id);
    if (targets.length === 0) {
      return;
    }

    const confirmed = await dialogController.show({
      prompt: `确认停用已选的 ${targets.length} 位用户？`,
    });
    if (!confirmed) {
      return;
    }

    try {
      for (const target of targets) {
        await deleteUserAdmin({
          id: target.id,
          userAdminDeleteDto: { force: false },
        });
      }
      selectedUserIds = [];
      await refreshUsers();
      notificationController.show({
        type: NotificationType.Success,
        message: `已停用 ${targets.length} 位用户`,
      });
    } catch (error) {
      handleError(error, '批量停用失败');
    }
  };

  const handleBatchAssignDevices = () => {
    const target = selectedUsers.find((item) => !item.isAdmin && !item.deletedAt);
    if (!target) {
      notificationController.show({
        type: NotificationType.Info,
        message: '请选择一位非管理员用户进行设备分配',
      });
      return;
    }
    selectedUser = target;
    showDeviceDialog = true;
  };

  const handleResetPassword = async (target: UserAdminResponseDto) => {
    const confirmed = await dialogController.show({
      prompt: `确认重置用户「${target.name}」的密码？`,
    });
    if (!confirmed) {
      return;
    }

    try {
      newPassword = generatePassword();
      await updateUserAdmin({
        id: target.id,
        userAdminUpdateDto: {
          password: newPassword,
          shouldChangePassword: true,
        },
      });
      showPasswordResetSuccess = true;
    } catch (error) {
      handleError(error, '重置密码失败');
    }
  };

</script>

<div class="sys-page">
  <header class="page-header">
    <div class="title-block">
      <h1>用户情况</h1>
      <p>按角色管理账号、设备分配与状态。</p>
    </div>
  </header>

  <div class="toolbar-row">
    <div class="search-box">
      <Icon path={mdiMagnify} size="16" class="search-icon" />
      <input bind:value={keyword} placeholder="搜索姓名、手机号、邮箱" />
      {#if keyword.trim()}
        <button type="button" class="search-clear" aria-label="清空搜索" onclick={clearSearch}>
          <Icon path={mdiClose} size="14" />
        </button>
      {:else}
        <kbd class="search-kbd" aria-hidden="true">⌘K</kbd>
      {/if}
    </div>
    <button type="button" class="btn-create" onclick={() => (showCreateForm = true)}>
      <Icon path={mdiPlus} size="16" />
      创建用户
    </button>
  </div>

  <section class="filters">
    <div class="filter-row">
      <span class="filter-label">角色</span>
      <TrashSegmented
        options={roleFilterOptions}
        value={roleFilter}
        onChange={(value) => (roleFilter = value)}
      />
    </div>
    <div class="filter-row">
      <span class="filter-label">设备分配</span>
      <TrashSegmented
        options={deviceFilterOptions}
        value={deviceFilter}
        onChange={(value) => (deviceFilter = value)}
      />
    </div>
    <div class="filter-row">
      <span class="filter-label">状态</span>
      <TrashSegmented
        options={statusFilterOptions}
        value={statusFilter}
        onChange={(value) => (statusFilter = value)}
      />
    </div>
    <div class="filter-row">
      <span class="filter-label">创建时间</span>
      <div class="date-range">
        <input bind:value={createdFrom} type="date" aria-label="创建开始日期" />
        <span class="sep">–</span>
        <input bind:value={createdTo} type="date" aria-label="创建结束日期" />
      </div>
    </div>
  </section>

  <section class="table-card">
    <div class="table-summary">共 {pagination.total} 位用户</div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th class="check-col">
              <CjvCheckbox
                state={hasAllFilteredSelected
                  ? 'checked'
                  : hasSomeFilteredSelected
                    ? 'indeterminate'
                    : 'unchecked'}
                onChange={toggleFilteredSelectAll}
                ariaLabel="全选"
              />
            </th>
            <th>用户</th>
            <th>手机号</th>
            <th>邮箱</th>
            <th>角色</th>
            <th>已分配设备</th>
            <th>状态</th>
            <th>最近登录</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {#if pagedUsers.length === 0}
            <tr>
              <td colspan="9" class="empty">暂无匹配用户</td>
            </tr>
          {:else}
            {#each pagedUsers as item (item.id)}
              {@const roleBadge = getUserManagementRoleBadge(item)}
              {@const statusBadge = getStatusLabel(item)}
              {@const assignedCount = getAssignedDeviceCount(item)}
              <tr class:disabled-row={!!item.deletedAt} class:selected-row={selectedUserIds.includes(item.id)}>
                <td class="check-col">
                  {#if !item.deletedAt && item.id !== $user?.id}
                    <CjvCheckbox
                      checked={selectedUserIds.includes(item.id)}
                      onChange={() => toggleUserSelect(item.id)}
                      ariaLabel={`选择用户 ${item.name}`}
                    />
                  {/if}
                </td>
                <td>
                  <div class="user-cell">
                    <UserAvatar user={item} size="md" />
                    <div class="user-meta">
                      <strong>{item.name}</strong>
                      <span>{formatUserIdLabel(item)}</span>
                    </div>
                  </div>
                </td>
                <td class="mono">{item.phone || '—'}</td>
                <td class="email-cell">{item.email || '—'}</td>
                <td>
                  <span class="role-badge {roleBadge.tone}">
                    <Icon path={getRoleBadgeIcon(roleBadge.tone)} size="12" />
                    {roleBadge.label}
                  </span>
                </td>
                <td class="device-count">
                  {#if assignedCount === null}
                    —
                  {:else}
                    {assignedCount}
                  {/if}
                </td>
                <td>
                  <span class="status-pill {statusBadge.tone}">
                    <span class="status-dot" aria-hidden="true"></span>
                    {statusBadge.label}
                  </span>
                </td>
                <td class="login-cell">{formatRelativeLogin(item.lastLoginAt)}</td>
                <td class="actions">
                  {#if !item.deletedAt}
                    <button
                      type="button"
                      class="icon-action"
                      title="编辑"
                      onclick={() => {
                        selectedUser = item;
                        showEditForm = true;
                      }}
                    >
                      <Icon path={mdiPencilOutline} size="15" />
                    </button>
                    {#if item.id !== $user.id}
                      <button
                        type="button"
                        class="icon-action"
                        title="重置密码"
                        onclick={() => handleResetPassword(item)}
                      >
                        <Icon path={mdiKeyOutline} size="15" />
                      </button>
                    {/if}
                    {#if isSuperAdmin($user) && item.id !== $user.id}
                      <button
                        type="button"
                        class="icon-action"
                        title="设置角色"
                        onclick={() => {
                          selectedUser = item;
                          showRoleDialog = true;
                        }}
                      >
                        <Icon path={mdiShieldAccountOutline} size="15" />
                      </button>
                    {/if}
                    {#if !item.isAdmin}
                      <button
                        type="button"
                        class="icon-action"
                        title="分配设备"
                        onclick={() => {
                          selectedUser = item;
                          showDeviceDialog = true;
                        }}
                      >
                        <Icon path={mdiMonitor} size="15" />
                      </button>
                    {/if}
                    {#if item.id !== $user.id}
                      <button
                        type="button"
                        class="icon-action"
                        title="停用"
                        onclick={() => void handleDisableUser(item)}
                      >
                        <Icon path={mdiAccountOff} size="15" />
                      </button>
                      <button
                        type="button"
                        class="icon-action danger"
                        title="删除"
                        onclick={() => {
                          selectedUser = item;
                          showDeleteDialog = true;
                        }}
                      >
                        <Icon path={mdiTrashCanOutline} size="15" />
                      </button>
                    {/if}
                  {:else if item.status === UserStatus.Deleted}
                    <button
                      type="button"
                      class="icon-action"
                      title="恢复"
                      onclick={() => {
                        selectedUser = item;
                        showRestoreDialog = true;
                      }}
                    >
                      <Icon path={mdiRestore} size="15" />
                    </button>
                  {/if}
                </td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>

    <MaterialLibraryPagination
      total={pagination.total}
      page={pagination.page}
      totalPages={pagination.totalPages}
      pageSize={pagination.pageSize}
      onPageChange={(next) => {
        pageNum = next;
      }}
      onPageSizeChange={(next) => {
        pageSize = next;
        pageNum = 1;
      }}
    />
  </section>

  {#if selectedUserIds.length > 0}
    <div class="batch-dock">
      <div class="batch-bar">
        <div class="count-wrap">
          <span class="count">{selectedUserIds.length}</span>
          <span class="label">已选择 {selectedUserIds.length} 项</span>
        </div>
        <span class="divider"></span>
        <button type="button" class="batch-action" onclick={toggleFilteredSelectAll}>
          <Icon path={hasAllFilteredSelected ? mdiSquareOutline : mdiCheckAll} size="15" />
          {hasAllFilteredSelected ? '取消全选' : `全选 ${pagination.total} 项`}
        </button>
        <button type="button" class="batch-action" onclick={handleBatchAssignDevices}>
          <Icon path={mdiMonitor} size="15" />
          分配设备
        </button>
        <button type="button" class="batch-action" onclick={handleBatchSetRole}>
          <Icon path={mdiShieldAccountOutline} size="15" />
          设置权限
        </button>
        <button type="button" class="batch-action" onclick={() => void handleBatchDisableUsers()}>
          <Icon path={mdiAccountOff} size="15" />
          停用
        </button>
        <button type="button" class="batch-action danger" onclick={() => void handleBatchDeleteUsers()}>
          <Icon path={mdiTrashCanOutline} size="15" />
          删除
        </button>
        <span class="divider"></span>
        <button type="button" class="batch-action ghost" onclick={() => (selectedUserIds = [])}>
          <Icon path={mdiClose} size="15" />
          取消选择
        </button>
      </div>
    </div>
  {/if}
</div>

{#if showCreateForm}
  <CreateUserForm
    onSubmit={async () => {
      await refreshUsers();
      showCreateForm = false;
    }}
    onCancel={() => (showCreateForm = false)}
    onClose={() => (showCreateForm = false)}
    oauthEnabled={$featureFlags.oauth}
  />
{/if}

{#if showEditForm && selectedUser}
  <EditUserForm
    user={selectedUser}
    bind:newPassword
    canResetPassword={selectedUser.id !== $user.id}
    onEditSuccess={async () => {
      await refreshUsers();
      showEditForm = false;
    }}
    onResetPasswordSuccess={async () => {
      await refreshUsers();
      showEditForm = false;
      showPasswordResetSuccess = true;
    }}
    onClose={() => (showEditForm = false)}
  />
{/if}

{#if showDeleteDialog && selectedUser}
  <DeleteConfirmDialog
    user={selectedUser}
    onSuccess={async () => {
      await refreshUsers();
      showDeleteDialog = false;
    }}
    onFail={async () => {
      await refreshUsers();
      showDeleteDialog = false;
    }}
    onCancel={() => (showDeleteDialog = false)}
  />
{/if}

{#if showRestoreDialog && selectedUser}
  <RestoreDialogue
    user={selectedUser}
    onSuccess={async () => {
      await refreshUsers();
      showRestoreDialog = false;
    }}
    onFail={async () => {
      await refreshUsers();
      showRestoreDialog = false;
    }}
    onCancel={() => (showRestoreDialog = false)}
  />
{/if}

{#if showDeviceDialog && selectedUser}
  <UserDeviceAssignmentDialog
    userId={selectedUser.id}
    userName={selectedUser.name}
    onClose={() => (showDeviceDialog = false)}
    onSaved={async (count) => {
      deviceCountMap = { ...deviceCountMap, [selectedUser!.id]: count };
      showDeviceDialog = false;
      notificationController.show({
        type: NotificationType.Success,
        message: `已更新「${selectedUser!.name}」的设备授权`,
      });
    }}
  />
{/if}

{#if showRoleDialog && selectedUser}
  <SystemManagementRoleAssignDialog
    user={selectedUser}
    onClose={() => (showRoleDialog = false)}
    onSuccess={async () => {
      await refreshUsers();
    }}
  />
{/if}

{#if showPasswordResetSuccess}
  <ConfirmDialog
    title="密码已重置"
    confirmText="完成"
    onConfirm={() => (showPasswordResetSuccess = false)}
    onCancel={() => (showPasswordResetSuccess = false)}
    hideCancelButton={true}
    confirmColor="success"
  >
    {#snippet promptSnippet()}
      <div class="password-success">
        <Text>新密码已生成，请复制后告知用户。</Text>
        <div class="password-row">
          <Code color="primary">{newPassword}</Code>
          <IconButton
            icon={mdiContentCopy}
            shape="round"
            color="secondary"
            variant="ghost"
            onclick={() => copyToClipboard(newPassword)}
            title="复制密码"
            aria-label="复制密码"
          />
        </div>
      </div>
    {/snippet}
  </ConfirmDialog>
{/if}

<style>
  .sys-page {
    padding: 8px 8px 24px;
    color: #0f172a;
  }

  .page-header {
    margin-bottom: 0;
  }

  .toolbar-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
  }

  .toolbar-row .search-box {
    margin-left: auto;
    width: 280px;
  }

  .title-block h1 {
    margin: 0;
    font-size: 24px;
    font-weight: 600;
    color: #0f172a;
  }

  .title-block p {
    margin: 6px 0 0;
    color: #64748b;
    font-size: 13px;
    line-height: 1.5;
  }

  .search-box {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 36px;
    padding: 0 12px;
    border: 1px solid #e6eaf2;
    border-radius: 8px;
    background: #fff;
    transition:
      border-color 200ms ease,
      box-shadow 200ms ease;
  }

  .search-box:focus-within {
    border-color: rgba(76, 111, 255, 0.6);
    box-shadow: 0 0 0 3px rgba(76, 111, 255, 0.12);
  }

  .search-box :global(.search-icon) {
    color: #94a3b8;
    flex-shrink: 0;
    transition: color 200ms ease;
  }

  .search-box:focus-within :global(.search-icon) {
    color: #4c6fff;
  }

  .search-box input {
    flex: 1;
    min-width: 0;
    height: 100%;
    border: none;
    padding: 0;
    font-size: 13px;
    background: transparent;
    color: #0f172a;
    outline: none;
  }

  .search-box input::placeholder {
    color: #94a3b8;
  }

  .search-kbd {
    display: inline-flex;
    align-items: center;
    height: 20px;
    padding: 0 6px;
    border: 1px solid #e6eaf2;
    border-radius: 4px;
    background: rgba(248, 250, 253, 0.6);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 10.5px;
    color: #94a3b8;
    flex-shrink: 0;
  }

  .search-clear {
    display: grid;
    width: 20px;
    height: 20px;
    place-items: center;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: #94a3b8;
    padding: 0;
    cursor: pointer;
    flex-shrink: 0;
  }

  .search-clear:hover {
    background: #f1f5f9;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border-radius: 8px;
    padding: 0 14px;
    height: 38px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition:
      background-color 200ms ease,
      border-color 200ms ease;
  }

  .btn-create {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 36px;
    padding: 0 16px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 8px;
    background: var(--gradient-brand);
    color: #fff;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    box-shadow:
      0 2px 6px rgba(76, 111, 255, 0.28),
      0 10px 28px rgba(76, 111, 255, 0.28);
    transition:
      box-shadow 160ms ease,
      transform 160ms ease;
  }

  .btn-create:hover {
    box-shadow:
      0 2px 8px rgba(76, 111, 255, 0.32),
      0 14px 36px rgba(76, 111, 255, 0.36);
  }

  .btn-create:active {
    transform: scale(0.98);
  }

  .filters {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px 0 12px;
    margin-bottom: 12px;
    border-top: 1px solid color-mix(in srgb, #e6eaf2 80%, transparent);
    border-bottom: 1px solid color-mix(in srgb, #e6eaf2 80%, transparent);
  }

  .filter-row {
    display: flex;
    align-items: center;
    gap: 16px;
    min-height: 36px;
    padding: 4px 0;
  }

  .filter-label {
    width: 64px;
    flex-shrink: 0;
    font-size: 12px;
    font-weight: 500;
    color: #64748b;
    letter-spacing: 0.02em;
  }

  .date-range {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .date-range input {
    height: 28px;
    padding: 0 8px;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    background: #fff;
    font-size: 12px;
    color: #0f172a;
    font-variant-numeric: tabular-nums;
    outline: none;
  }

  .date-range input:focus {
    border-color: #4c6fff;
  }

  .sep {
    color: #94a3b8;
  }

  .table-card {
    border: 1px solid #e6eaf2;
    border-radius: 12px;
    background: #fff;
    padding: 14px 16px 8px;
  }

  .table-summary {
    margin-bottom: 10px;
    font-size: 13px;
    color: #64748b;
  }

  .table-wrap {
    overflow-x: auto;
    margin-bottom: 12px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    min-width: 1040px;
    font-size: 13px;
  }

  th,
  td {
    padding: 12px 10px;
    border-bottom: 1px solid #f1f5f9;
    text-align: left;
    vertical-align: middle;
  }

  th {
    color: #64748b;
    font-weight: 500;
    font-size: 12px;
    background: #f8fafd;
    white-space: nowrap;
  }

  .check-col {
    width: 40px;
    text-align: left;
    padding-left: 16px;
  }

  .selected-row {
    background: rgba(238, 241, 254, 0.4);
  }

  .batch-dock {
    pointer-events: none;
    position: fixed;
    inset-inline: 0;
    bottom: 24px;
    z-index: 10030;
    display: flex;
    justify-content: center;
    padding: 0 24px;
  }

  .batch-bar {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 4px;
    border-radius: 14px;
    padding: 6px 8px;
    background: linear-gradient(180deg, rgba(16, 24, 40, 0.92) 0%, rgba(10, 15, 28, 0.94) 100%);
    backdrop-filter: blur(14px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow:
      0 12px 32px -8px rgba(10, 15, 28, 0.55),
      0 2px 6px rgba(10, 15, 28, 0.35),
      inset 0 1px 0 rgba(255, 255, 255, 0.06);
  }

  .count-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 8px;
  }

  .count {
    display: grid;
    min-width: 24px;
    height: 24px;
    place-items: center;
    border-radius: 999px;
    padding: 0 6px;
    font-size: 12px;
    font-weight: 600;
    color: #fff;
    background: var(--gradient-brand);
  }

  .label {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.9);
    white-space: nowrap;
  }

  .divider {
    width: 1px;
    height: 20px;
    margin: 0 2px;
    background: rgba(255, 255, 255, 0.1);
  }

  .batch-action {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 10px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: rgba(255, 255, 255, 0.85);
    font-size: 12.5px;
    cursor: pointer;
    white-space: nowrap;
  }

  .batch-action:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }

  .batch-action.danger {
    color: #f26d6d;
  }

  .batch-action.danger:hover {
    background: rgba(229, 72, 77, 0.14);
    color: #ff8a8a;
  }

  .batch-action.ghost {
    color: rgba(255, 255, 255, 0.6);
  }

  .batch-action.ghost:hover {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.9);
  }

  .user-cell {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 180px;
  }

  .user-meta {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .user-meta strong {
    font-size: 13px;
    color: #0f172a;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .user-meta span {
    font-size: 11px;
    color: #94a3b8;
    font-variant-numeric: tabular-nums;
  }

  .mono {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .email-cell {
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #475569;
  }

  .device-count {
    font-variant-numeric: tabular-nums;
    color: #0f172a;
    font-weight: 500;
  }

  .login-cell {
    color: #64748b;
    white-space: nowrap;
  }

  .role-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    border-radius: 999px;
    font-size: 12px;
    white-space: nowrap;
  }

  .role-badge.super {
    background: #f3e8ff;
    color: #7c3aed;
  }

  .role-badge.admin {
    background: #dbeafe;
    color: #2563eb;
  }

  .role-badge.user {
    background: #dcfce7;
    color: #16a34a;
  }

  .status-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    white-space: nowrap;
  }

  .status-dot {
    width: 7px;
    height: 7px;
    border-radius: 999px;
    flex-shrink: 0;
  }

  .status-pill.active {
    color: #16a34a;
  }

  .status-pill.active .status-dot {
    background: #22c55e;
  }

  .status-pill.disabled {
    color: #64748b;
  }

  .status-pill.disabled .status-dot {
    background: #94a3b8;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
  }

  .icon-action {
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: #64748b;
    display: inline-grid;
    place-items: center;
    cursor: pointer;
    padding: 0;
    transition:
      background 150ms ease,
      color 150ms ease;
  }

  .icon-action:hover {
    background: #f1f5f9;
    color: #2563eb;
  }

  .icon-action.danger:hover {
    background: #fef2f2;
    color: #dc2626;
  }

  .disabled-row {
    background: #fffbeb;
  }

  .empty {
    text-align: center;
    color: #94a3b8;
    padding: 28px 0;
  }

  .password-success {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .password-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  @media (max-width: 960px) {
    .toolbar-row {
      flex-wrap: wrap;
    }

    .toolbar-row .search-box {
      margin-left: 0;
      flex: 1;
      width: auto;
      min-width: 200px;
    }
  }

  @media (max-width: 720px) {
    .filter-row {
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
    }

    .filter-label {
      width: auto;
    }
  }
</style>
