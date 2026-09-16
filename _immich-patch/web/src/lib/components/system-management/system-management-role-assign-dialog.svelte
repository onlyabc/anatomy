<script lang="ts">
  import { assignUserRole, getUserRole } from '$lib/api/role.api';
  import {
    notificationController,
    NotificationType,
  } from '$lib/components/shared-components/notification/notification';
  import { SYSTEM_ROLE_OPTIONS } from '$lib/constants/system-role-codes';
  import CjvLoadingOverlay from '$lib/components/shared-components/cjv-loading-overlay.svelte';
  import type { UserAdminResponseDto } from '@immich/sdk';
  import { onMount } from 'svelte';

  type Props = {
    user: UserAdminResponseDto;
    onClose: () => void;
    onSuccess: () => void;
  };

  let { user, onClose, onSuccess }: Props = $props();

  let selectedRoleCode = $state('user');
  let loading = $state(true);
  let submitting = $state(false);

  onMount(async () => {
    try {
      const role = await getUserRole(user.id);
      selectedRoleCode = role.roleCode;
    } catch {
      // 回退到布尔字段推断
      if (user.isAdmin && !(user as { isAdmin2?: boolean }).isAdmin2) {
        selectedRoleCode = 'super_admin';
      } else if (user.isAdmin) {
        selectedRoleCode = 'admin2';
      } else {
        selectedRoleCode = 'user';
      }
    } finally {
      loading = false;
    }
  });

  async function handleSave() {
    submitting = true;
    try {
      await assignUserRole(user.id, selectedRoleCode);
      notificationController.show({ type: NotificationType.Info, message: '角色已更新，用户重新登录后生效' });
      onSuccess();
      onClose();
    } catch (error) {
      notificationController.show({
        type: NotificationType.Error,
        message: error instanceof Error ? error.message : '设置角色失败',
      });
    } finally {
      submitting = false;
    }
  }
</script>

<div class="modal-mask" role="presentation" onclick={onClose}>
  <div class="modal-panel" role="dialog" aria-modal="true" onclick={(e) => e.stopPropagation()}>
    <header>
      <h2>设置角色</h2>
      <p>调整该用户在后台的功能权限范围。</p>
    </header>

    <div class="user-info">
      <strong>{user.name}</strong>
      <span>{user.phone}</span>
    </div>

    {#if loading}
      <div class="loading-wrap">
        <CjvLoadingOverlay mode="inline" message="正在加载内容…" />
      </div>
    {:else}
      <div class="role-list">
        {#each SYSTEM_ROLE_OPTIONS as option (option.code)}
          <label class="role-option" class:selected={selectedRoleCode === option.code}>
            <input type="radio" name="role" value={option.code} bind:group={selectedRoleCode} />
            <div>
              <strong>{option.name}</strong>
              <p>{option.description}</p>
            </div>
          </label>
        {/each}
      </div>
    {/if}

    <footer>
      <p class="hint">角色变更后，用户重新登录后台时生效。</p>
      <div class="actions">
        <button type="button" class="btn" onclick={onClose}>取消</button>
        <button type="button" class="btn primary" disabled={loading || submitting} onclick={handleSave}>
          {submitting ? '保存中…' : '保存角色'}
        </button>
      </div>
    </footer>
  </div>
</div>

<style>
  .modal-mask {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 50;
    padding: 20px;
  }

  .modal-panel {
    width: min(520px, 100%);
    background: #fff;
    border-radius: 14px;
    padding: 24px;
    box-shadow: 0 20px 50px rgba(15, 23, 42, 0.18);
  }

  header h2 {
    margin: 0;
    font-size: 20px;
    color: #111827;
  }

  header p {
    margin: 6px 0 0;
    color: #64748b;
    font-size: 13px;
  }

  .user-info {
    margin: 16px 0;
    padding: 12px 14px;
    background: #f8fafc;
    border-radius: 10px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .user-info strong {
    color: #111827;
  }

  .user-info span {
    color: #64748b;
    font-size: 13px;
  }

  .loading-wrap {
    display: flex;
    justify-content: center;
    padding: 12px 0 20px;
  }

  .role-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .role-option {
    display: flex;
    gap: 12px;
    padding: 14px;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    cursor: pointer;
  }

  .role-option.selected {
    border-color: #1665ff;
    background: #eff6ff;
  }

  .role-option strong {
    display: block;
    color: #111827;
    margin-bottom: 4px;
  }

  .role-option p {
    margin: 0;
    color: #64748b;
    font-size: 12px;
    line-height: 1.5;
  }

  footer {
    margin-top: 18px;
    border-top: 1px solid #f1f5f9;
    padding-top: 14px;
  }

  .hint {
    margin: 0 0 12px;
    color: #94a3b8;
    font-size: 12px;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }

  .btn {
    border: 1px solid #d1d5db;
    border-radius: 8px;
    padding: 8px 16px;
    background: #fff;
    cursor: pointer;
  }

  .btn.primary {
    background: #1665ff;
    border-color: #1665ff;
    color: #fff;
  }

  .btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
