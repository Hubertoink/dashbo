<script lang="ts">
  import type { OutlookConnectionDto, SettingsDto } from '$lib/api';

  import DashboardPreview from '$lib/components/DashboardPreview.svelte';
  import BackgroundSection from '$lib/components/settings/BackgroundSection.svelte';
  import DashboardWidgetsSection from '$lib/components/settings/DashboardWidgetsSection.svelte';

  type HeosPlayerDto = { pid: number; name: string; model?: string };
  type HeosGroupPlayerDto = { name: string; pid: number; role?: 'leader' | 'member' | string };
  type HeosGroupDto = { name: string; gid: number | string; players: HeosGroupPlayerDto[] };

  export let authed: boolean;
  export let settings: SettingsDto | null;

  export let outlookConnections: OutlookConnectionDto[];

  export let weatherLocation: string;
  export let weatherSaving: boolean;
  export let weatherError: string | null;
  export let saveWeatherLocation: () => void | Promise<void>;

  export let holidaysEnabled: boolean;
  export let holidaysSaving: boolean;
  export let holidaysError: string | null;
  export let saveHolidays: () => void | Promise<void>;

  export let todoEnabled: boolean;
  export let todoSaving: boolean;
  export let todoError: string | null;
  export let saveTodo: () => void | Promise<void>;

  export let todoListNamesText: string;
  export let todoListNamesSaving: boolean;
  export let todoListNamesError: string | null;
  export let saveTodoListNames: () => void | Promise<void>;

  export let todoDefaultConnectionId: number | null;
  export let todoDefaultConnectionSaving: boolean;
  export let todoDefaultConnectionError: string | null;
  export let saveTodoDefaultConnection: () => void | Promise<void>;

  export let newsEnabled: boolean;
  export let newsSaving: boolean;
  export let newsError: string | null;
  export let saveNews: () => void | Promise<void>;

  export let scribbleEnabled: boolean;
  export let scribbleSaving: boolean;
  export let scribbleError: string | null;
  export let saveScribble: () => void | Promise<void>;

  export let scribbleStandbySeconds: number;
  export let scribbleStandbySecondsSaving: boolean;
  export let scribbleStandbySecondsError: string | null;
  export let saveScribbleStandbySeconds: () => void | Promise<void>;

  export let scribblePaperLook: boolean;
  export let scribblePaperLookSaving: boolean;
  export let scribblePaperLookError: string | null;
  export let saveScribblePaperLook: () => void | Promise<void>;

  export let newsFeeds: import('$lib/api').NewsFeedId[];
  export let newsFeedsSaving: boolean;
  export let newsFeedsError: string | null;
  export let saveNewsFeeds: () => void | Promise<void>;

  export let clockStyle: import('$lib/clockStyle').ClockStyle;
  export let clockStyleSaving: boolean;
  export let clockStyleError: string | null;
  export let saveClockStyle: () => void | Promise<void>;

  export let edgeBaseUrl: string;
  export let edgeToken: string;
  export let edgeSaving: boolean;
  export let edgePlayerWidgetEnabled: boolean;
  export let saveEdgePlayerWidgetEnabled: () => void | Promise<void>;

  export let openEdgeSetup: () => void;
  export let saveEdgeConfig: () => void | Promise<void>;

  export let testEdgeConnection: () => void | Promise<void>;
  export let edgeTestBusy: boolean;
  export let edgeTestMessage: string | null;
  export let edgeTestOk: boolean | null;

  export let scanEdgeNow: () => void | Promise<void>;
  export let edgeScanBusy: boolean;
  export let edgeScanMessage: string | null;

  export let edgeHeosEnabled: boolean;
  export let saveEdgeHeosEnabled: () => void | Promise<void>;

  export let edgeHeosHosts: string;
  export let isLocalhostUrl: (value: string) => boolean;

  export let dashboardGlassBlurEnabled: boolean;
  export let saveDashboardGlassBlurEnabled: () => void | Promise<void>;

  export let dashboardTextStyle: import('$lib/clockStyle').ClockStyle;
  export let saveDashboardTextStyle: () => void | Promise<void>;

  export let heosGroupPlayers: HeosPlayerDto[];
  export let heosGroupSelected: Record<string, boolean>;
  export let heosGroupBusy: boolean;
  export let heosGroupError: string | null;
  export let heosGroupMessage: string | null;

  export let heosGroups: HeosGroupDto[];
  export let heosGroupsLoaded: boolean;
  export let heosGroupsBusy: boolean;
  export let heosGroupsError: string | null;
  export let heosGroupsMessage: string | null;

  export let loadHeosGroups: () => void | Promise<void>;
  export let loadHeosPlayersForGrouping: () => void | Promise<void>;
  export let createHeosGroup: () => void | Promise<void>;
  export let dissolveHeosGroup: () => void | Promise<void>;
  export let dissolveHeosGroupByPid: (pid: number) => void | Promise<void>;
  export let getHeosGroupLeaderPid: (g: HeosGroupDto) => number | null;

  export let backgroundRotateEnabled: boolean;
  export let rotateSaving: boolean;
  export let rotateError: string | null;
  export let saveBackgroundRotate: () => void | Promise<void>;

  export let backgroundRotateImages: string[];
  export let rotateImagesSaving: boolean;
  export let rotateImagesError: string | null;
  export let toggleBackgroundRotateImage: (filename: string) => void;
  export let saveBackgroundRotateImages: () => void | Promise<void>;

  export let uploadFiles: File[];
  export let savingBg: boolean;
  export let uploadProgress: number;
  export let uploadTotalLabel: string | null;
  export let uploadError: string | null;

  export let folderInputEl: HTMLInputElement | null;

  export let onChooseUploadFilesFrom: (source: 'files' | 'folder', files: FileList | null | undefined) => void;
  export let doUpload: () => void | Promise<void>;
  export let chooseBg: (filename: string) => void | Promise<void>;

  export let deletingBg: boolean;
  export let requestDeleteBg: (filename: string) => void;

  let highlightWidget: string | null = null;
</script>

<section class="mb-8" id="section-dashboard">
  <h2 class="text-lg font-semibold text-white/90 mb-4">Dashboard Widgets</h2>

  <div class="md:flex md:gap-4">
    <div class="flex-1 space-y-4">
      <div id="section-weather">
        <DashboardWidgetsSection
          {authed}
          {settings}
          {outlookConnections}
          bind:weatherLocation
          {weatherSaving}
          {weatherError}
          {saveWeatherLocation}
          bind:holidaysEnabled
          {holidaysSaving}
          {holidaysError}
          {saveHolidays}
          bind:todoEnabled
          {todoSaving}
          {todoError}
          {saveTodo}
          bind:todoListNamesText
          {todoListNamesSaving}
          {todoListNamesError}
          {saveTodoListNames}
          bind:todoDefaultConnectionId
          {todoDefaultConnectionSaving}
          {todoDefaultConnectionError}
          {saveTodoDefaultConnection}
          bind:newsEnabled
          {newsSaving}
          {newsError}
          {saveNews}
          bind:scribbleEnabled
          {scribbleSaving}
          {scribbleError}
          {saveScribble}
          bind:scribbleStandbySeconds
          {scribbleStandbySecondsSaving}
          {scribbleStandbySecondsError}
          {saveScribbleStandbySeconds}
          bind:scribblePaperLook
          {scribblePaperLookSaving}
          {scribblePaperLookError}
          {saveScribblePaperLook}
          bind:newsFeeds
          {newsFeedsSaving}
          {newsFeedsError}
          {saveNewsFeeds}
          bind:clockStyle
          {clockStyleSaving}
          {clockStyleError}
          {saveClockStyle}
          bind:edgeBaseUrl
          bind:edgeToken
          {edgeSaving}
          bind:edgePlayerWidgetEnabled
          {saveEdgePlayerWidgetEnabled}
          {openEdgeSetup}
          {saveEdgeConfig}
          {testEdgeConnection}
          {edgeTestBusy}
          {edgeTestMessage}
          {edgeTestOk}
          {scanEdgeNow}
          {edgeScanBusy}
          {edgeScanMessage}
          bind:edgeHeosEnabled
          {saveEdgeHeosEnabled}
          bind:edgeHeosHosts
          {isLocalhostUrl}
          bind:dashboardGlassBlurEnabled
          {saveDashboardGlassBlurEnabled}
          bind:dashboardTextStyle
          {saveDashboardTextStyle}
          {heosGroupPlayers}
          {heosGroupSelected}
          {heosGroupBusy}
          {heosGroupError}
          {heosGroupMessage}
          {heosGroups}
          {heosGroupsLoaded}
          {heosGroupsBusy}
          {heosGroupsError}
          {heosGroupsMessage}
          {loadHeosGroups}
          {loadHeosPlayersForGrouping}
          {createHeosGroup}
          {dissolveHeosGroup}
          {dissolveHeosGroupByPid}
          {getHeosGroupLeaderPid}
          bind:highlightWidget
          previewClass="mb-6 md:hidden"
        />
      </div>

      <BackgroundSection
        {authed}
        {settings}
        bind:backgroundRotateEnabled
        {rotateSaving}
        {rotateError}
        {saveBackgroundRotate}
        bind:backgroundRotateImages
        {rotateImagesSaving}
        {rotateImagesError}
        toggleRotateImage={toggleBackgroundRotateImage}
        {saveBackgroundRotateImages}
        {uploadFiles}
        {savingBg}
        {uploadProgress}
        {uploadTotalLabel}
        {uploadError}
        bind:folderInputEl
        {onChooseUploadFilesFrom}
        {doUpload}
        {chooseBg}
        {deletingBg}
        {requestDeleteBg}
      />
    </div>

    <!-- Sticky Vorschau (nur Desktop) -->
    <div class="hidden md:block md:w-80 md:shrink-0">
      <div class="sticky top-4">
        <DashboardPreview
          weatherEnabled={true}
          todoEnabled={todoEnabled}
          newsEnabled={newsEnabled}
          scribbleEnabled={scribbleEnabled}
          musicEnabled={edgePlayerWidgetEnabled}
          {highlightWidget}
        />
      </div>
    </div>
  </div>
</section>
