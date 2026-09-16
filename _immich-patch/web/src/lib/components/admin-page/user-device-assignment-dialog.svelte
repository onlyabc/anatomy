<script lang="ts">
  import Icon from '$lib/components/elements/icon.svelte';
  import { notificationController, NotificationType } from '$lib/components/shared-components/notification/notification';
  import { mdiClockOutline, mdiClose, mdiMagnify, mdiMapMarkerOutline, mdiMonitor } from '@mdi/js';
  import { onMount } from 'svelte';
  import CjvLoadingOverlay from '$lib/components/shared-components/cjv-loading-overlay.svelte';

  type AdminDevice = {
    id: string;
    name: string;
    sn?: string;
    address?: string;
    deviceDimension?: string;
    status?: string;
    isOnline?: boolean;
    lastHeartbeat?: string;
    authorizedUserIds?: string[];
  };

  type Props = {
    userId: string;
    userName: string;
    onClose: () => void;
    onSaved?: (count: number) => void;
  };

  const DEVICE_APP_NAME = 'HoloStudio';
  const ONLINE_WITHIN_SECONDS = 5 * 60;
  const TEXT = {
    loadListFailed: '\u52a0\u8f7d\u8bbe\u5907\u5217\u8868\u5931\u8d25',
    loadAuthorizedFailed: '\u52a0\u8f7d\u5df2\u6388\u6743\u8bbe\u5907\u5931\u8d25',
    loadAccessFailed: '\u52a0\u8f7d\u8bbe\u5907\u6388\u6743\u4fe1\u606f\u5931\u8d25',
    noLocation: '\u672a\u8bbe\u7f6e\u4f4d\u7f6e',
    online: '\u5728\u7ebf',
    offline: '\u79bb\u7ebf',
    unknownHeartbeat: '\u6700\u8fd1\u5fc3\u8df3\u672a\u77e5',
    saveFailed: '\u4fdd\u5b58\u5931\u8d25',
    saveSuccessPrefix: '\u5df2\u66f4\u65b0\u7528\u6237\u300c',
    saveSuccessSuffix: '\u300d\u7684\u8bbe\u5907\u6388\u6743',
    dialogTitle: '\u5206\u914d\u53ef\u8bbf\u95ee\u7684\u6295\u5c4f\u8bbe\u5907',
    userLabel: '\u7528\u6237\uff1a',
    closeDialogAria: '\u5173\u95ed\u8bbe\u5907\u6388\u6743\u5f39\u7a97',
    searchPlaceholder: '\u641c\u7d22\u8bbe\u5907\u540d\u79f0 / SN / \u5730\u5740',
    selectAllVisible: '\u5168\u9009\u5f53\u524d',
    unselectAllVisible: '\u53d6\u6d88\u5168\u9009\u5f53\u524d',
    loading: '\u6b63\u5728\u52a0\u8f7d...',
    retry: '\u91cd\u8bd5',
    noAssignableDevices: '\u6682\u65e0\u53ef\u5206\u914d\u7684\u8bbe\u5907',
    noMatchedDevices: '\u672a\u5339\u914d\u5230\u8bbe\u5907',
    unnamed: '(\u672a\u547d\u540d)',
    serialNumber: 'SN',
    none: '\u65e0',
    heartbeatPrefix: '\u6700\u8fd1\u5fc3\u8df3 ',
    authorizedUsersPrefix: '\u5df2\u6388\u6743 ',
    authorizedUsersSuffix: ' \u4f4d\u7528\u6237\u8bbf\u95ee',
    selectedPrefix: '\u5df2\u9009 ',
    selectedSuffix: ' \u53f0\u8bbe\u5907',
    cancel: '\u53d6\u6d88',
    saving: '\u4fdd\u5b58\u4e2d...',
    save: '\u4fdd\u5b58',
  } as const;

  let { userId, userName, onClose, onSaved }: Props = $props();

  let devices = $state<AdminDevice[]>([]);
  let selectedIds = $state<string[]>([]);
  let initialSelectedIds = $state<string[]>([]);
  let keyword = $state('');
  let isLoading = $state(true);
  let isSaving = $state(false);
  let loadError = $state('');

  let filteredDevices = $derived.by(() => {
    const trimmed = keyword.trim().toLowerCase();
    if (!trimmed) {
      return devices;
    }

    return devices.filter((device) => {
      const haystack =
        `${device.name ?? ''} ${device.sn ?? ''} ${device.address ?? ''} ${device.deviceDimension ?? ''}`.toLowerCase();
      return haystack.includes(trimmed);
    });
  });

  let hasAllVisibleSelected = $derived(
    filteredDevices.length > 0 && filteredDevices.every((device) => selectedIds.includes(device.id)),
  );

  let isDirty = $derived.by(() => {
    if (selectedIds.length !== initialSelectedIds.length) {
      return true;
    }

    const baseline = new Set(initialSelectedIds);
    return selectedIds.some((id) => !baseline.has(id));
  });

  onMount(() => {
    void loadAll();
  });

  async function loadAll() {
    isLoading = true;
    loadError = '';

    try {
      const params = new URLSearchParams({
        appName: DEVICE_APP_NAME,
        onlineWithin: String(ONLINE_WITHIN_SECONDS),
      });

      const [listResp, currentResp] = await Promise.all([
        fetch(`/api/external/cast-devices/admin/list?${params}`, { credentials: 'include' }),
        fetch(`/api/external/cast-devices/by-user/${userId}/devices`, { credentials: 'include' }),
      ]);

      if (!listResp.ok) {
        throw new Error(`${TEXT.loadListFailed}: ${listResp.status}`);
      }

      if (!currentResp.ok) {
        throw new Error(`${TEXT.loadAuthorizedFailed}: ${currentResp.status}`);
      }

      const listData = await listResp.json();
      const currentData = await currentResp.json();

      devices = (listData.devices ?? []) as AdminDevice[];
      const currentIds = (currentData.deviceIds ?? []) as string[];
      selectedIds = [...currentIds];
      initialSelectedIds = [...currentIds];
    } catch (error) {
      loadError = error instanceof Error ? error.message : TEXT.loadAccessFailed;
    } finally {
      isLoading = false;
    }
  }

  function toggleDevice(id: string) {
    selectedIds = selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id];
  }

  function toggleAllVisible() {
    const visibleIds = filteredDevices.map((device) => device.id);
    if (hasAllVisibleSelected) {
      selectedIds = selectedIds.filter((id) => !visibleIds.includes(id));
    } else {
      selectedIds = [...new Set([...selectedIds, ...visibleIds])];
    }
  }

  function getLocationLabel(device: AdminDevice) {
    const address = (device.address ?? '').trim();
    return address || TEXT.noLocation;
  }

  function getStatusLabel(device: AdminDevice) {
    return device.isOnline ? TEXT.online : TEXT.offline;
  }

  function getLastHeartbeatLabel(device: AdminDevice) {
    if (!device.lastHeartbeat) {
      return TEXT.unknownHeartbeat;
    }

    const timestamp = new Date(device.lastHeartbeat);
    if (Number.isNaN(timestamp.getTime())) {
      return TEXT.unknownHeartbeat;
    }

    return timestamp.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  async function handleSave() {
    isSaving = true;

    try {
      const response = await fetch(`/api/external/cast-devices/by-user/${userId}/devices`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceIds: selectedIds }),
      });

      if (!response.ok) {
        let message = `${TEXT.saveFailed}: ${response.status}`;

        try {
          const data = await response.json();
          if (data?.message) {
            message = Array.isArray(data.message) ? data.message.join('\uff1b') : String(data.message);
          }
        } catch {
          // Ignore JSON parse errors and fall back to the default message.
        }

        throw new Error(message);
      }

      notificationController.show({
        message: `${TEXT.saveSuccessPrefix}${userName}${TEXT.saveSuccessSuffix}`,
        type: NotificationType.Info,
      });
      onSaved?.(selectedIds.length);
      onClose();
    } catch (error) {
      notificationController.show({
        message: error instanceof Error ? error.message : TEXT.saveFailed,
        type: NotificationType.Warning,
      });
    } finally {
      isSaving = false;
    }
  }
</script>

<div class="fixed inset-0 z-[10030] flex items-center justify-center bg-black/70 p-6">
  <div class="flex max-h-[85vh] w-full max-w-[760px] flex-col overflow-hidden rounded-[20px] border border-[#0ea5ff] bg-[#05070b] text-white shadow-[0_12px_40px_rgba(0,0,0,0.45)]">
    <div class="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
      <div class="min-w-0">
        <h2 class="text-[22px] leading-tight">{TEXT.dialogTitle}</h2>
        <p class="mt-2 truncate text-[14px] text-white/55">{TEXT.userLabel}{userName}</p>
      </div>
      <button
        type="button"
        class="rounded-[10px] border border-white/15 p-2 text-white/80 transition hover:border-white/30 hover:text-white"
        onclick={onClose}
        aria-label={TEXT.closeDialogAria}
        disabled={isSaving}
      >
        <Icon path={mdiClose} size="22" />
      </button>
    </div>

    <div class="flex flex-wrap items-center gap-3 border-b border-white/10 px-6 py-4">
      <label class="relative block min-w-[240px] flex-1">
        <input
          bind:value={keyword}
          type="text"
          placeholder={TEXT.searchPlaceholder}
          class="h-[40px] w-full rounded-[10px] border border-white/10 bg-white/5 pl-3 pr-10 text-[14px] text-white outline-none placeholder:text-white/35"
          disabled={isLoading || isSaving}
        />
        <span class="pointer-events-none absolute inset-y-0 right-3 flex items-center text-white/55">
          <Icon path={mdiMagnify} size="18" />
        </span>
      </label>

      <button
        type="button"
        class="h-[40px] rounded-[10px] bg-[#0554dd] px-4 text-[14px] text-white transition hover:bg-[#0b6bff] disabled:opacity-50"
        onclick={toggleAllVisible}
        disabled={filteredDevices.length === 0 || isLoading || isSaving}
      >
        {hasAllVisibleSelected ? TEXT.unselectAllVisible : TEXT.selectAllVisible}
      </button>
    </div>

    <div class="immich-scrollbar min-h-0 flex-1 overflow-y-auto px-6 py-4">
      {#if isLoading}
        <div class="flex h-48 items-center justify-center">
          <CjvLoadingOverlay mode="inline" message={TEXT.loading} />
        </div>
      {:else if loadError}
        <div class="flex h-48 flex-col items-center justify-center gap-3 text-center">
          <p class="text-[15px] text-white/70">{loadError}</p>
          <button
            type="button"
            class="h-[36px] rounded-[10px] bg-[#0554dd] px-4 text-[13px] text-white transition hover:bg-[#0b6bff]"
            onclick={() => loadAll()}
          >
            {TEXT.retry}
          </button>
        </div>
      {:else if filteredDevices.length === 0}
        <div class="flex h-48 items-center justify-center text-[15px] text-white/60">
          {devices.length === 0 ? TEXT.noAssignableDevices : TEXT.noMatchedDevices}
        </div>
      {:else}
        <ul class="space-y-3">
          {#each filteredDevices as device (device.id)}
            <li>
              <label
                class={`block cursor-pointer overflow-hidden rounded-[18px] border transition ${
                  selectedIds.includes(device.id)
                    ? 'border-[#2b7fff] bg-[#102042]'
                    : device.isOnline
                      ? 'border-[#5d86b5] bg-[#202734] hover:border-[#84aee0]'
                      : 'border-[#243649] bg-[#1d1d1d] hover:border-white/20'
                }`}
              >
                <div class="flex items-start gap-4 px-4 py-4">
                  <input
                    type="checkbox"
                    class="mt-1 h-4 w-4 shrink-0 accent-[#2b7fff]"
                    checked={selectedIds.includes(device.id)}
                    onchange={() => toggleDevice(device.id)}
                    disabled={isSaving}
                  />

                  <div class="flex min-w-0 flex-1 gap-4">
                    <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border border-white/10 bg-black/20">
                      <Icon path={mdiMonitor} size="24" class={device.isOnline ? 'text-white/90' : 'text-white/30'} />
                    </div>

                    <div class="min-w-0 flex-1">
                      <div class="flex flex-wrap items-center gap-2">
                        <span class={`truncate text-[18px] leading-none ${device.isOnline ? 'text-white' : 'text-white/80'}`}>
                          {device.name || TEXT.unnamed}
                        </span>
                        {#if device.deviceDimension}
                          <span class="rounded-full border border-white/15 px-2 py-0.5 text-[11px] text-white/70">
                            {device.deviceDimension}
                          </span>
                        {/if}
                        <span
                          class={`ml-auto shrink-0 rounded-full px-2.5 py-1 text-[11px] ${
                            device.isOnline
                              ? 'border border-[#37d61f]/40 bg-[#37d61f]/10 text-[#8fe77c]'
                              : 'border border-[#e33333]/40 bg-[#e33333]/10 text-[#f08a8a]'
                          }`}
                        >
                          {getStatusLabel(device)}
                        </span>
                      </div>

                      <div class="mt-3 flex items-center gap-2 text-[13px]">
                        <Icon
                          path={mdiMapMarkerOutline}
                          size="15"
                          class={device.isOnline ? 'text-[#66b7ff]' : 'text-white/45'}
                        />
                        <span class={device.isOnline ? 'text-white/75' : 'text-white/55'}>{getLocationLabel(device)}</span>
                      </div>

                      <div class="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-white/60">
                        <span class="rounded-full border border-white/10 bg-black/15 px-2.5 py-1">
                          {TEXT.serialNumber}: {device.sn || TEXT.none}
                        </span>
                        <span class="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/15 px-2.5 py-1">
                          <Icon path={mdiClockOutline} size="13" class="text-white/45" />
                          <span>{TEXT.heartbeatPrefix}{getLastHeartbeatLabel(device)}</span>
                        </span>
                      </div>

                      {#if device.authorizedUserIds && device.authorizedUserIds.length > 0}
                        <div class="mt-3 text-[12px] text-white/50">
                          {TEXT.authorizedUsersPrefix}{device.authorizedUserIds.length}{TEXT.authorizedUsersSuffix}
                        </div>
                      {/if}
                    </div>
                  </div>
                </div>
              </label>
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    <div class="flex items-center justify-between gap-3 border-t border-white/10 px-6 py-4">
      <div class="text-[13px] text-white/55">{TEXT.selectedPrefix}{selectedIds.length}{TEXT.selectedSuffix}</div>
      <div class="flex items-center gap-3">
        <button
          type="button"
          class="h-[40px] rounded-[10px] border border-white/10 px-4 text-[14px] text-white transition hover:border-white/25 hover:bg-white/5"
          onclick={onClose}
          disabled={isSaving}
        >
          {TEXT.cancel}
        </button>
        <button
          type="button"
          class="h-[40px] rounded-[10px] bg-[#0554dd] px-5 text-[14px] text-white transition hover:bg-[#0b6bff] disabled:opacity-50"
          onclick={handleSave}
          disabled={isSaving || isLoading || !!loadError || !isDirty}
        >
          {isSaving ? TEXT.saving : TEXT.save}
        </button>
      </div>
    </div>
  </div>
</div>
