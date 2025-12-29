<script lang="ts">
  import type { OutlookConnectionDto, OutlookStatusDto, PersonColorKey, PersonDto, TagColorKey, TagDto } from '$lib/api';

  import OutlookSection from '$lib/components/settings/OutlookSection.svelte';
  import PersonsSection from '$lib/components/settings/PersonsSection.svelte';
  import TagsSection from '$lib/components/settings/TagsSection.svelte';

  export let authed: boolean;

  export let tags: TagDto[];
  export let newTagName: string;
  export let newTagColor: string;
  export let tagError: string | null;
  export let tagColorMenuOpen: boolean;

  export let persons: PersonDto[];
  export let newPersonName: string;
  export let newPersonColor: string;
  export let personError: string | null;
  export let personColorMenuOpen: boolean;

  export let outlookStatus: OutlookStatusDto | null;
  export let outlookConnections: OutlookConnectionDto[];
  export let outlookError: string | null;
  export let outlookBusy: boolean;
  export let outlookColorMenuFor: number | null;

  export let colorBg: Record<TagColorKey, string>;
  export let colorNames: TagColorKey[];

  export let isTagColorKey: (value: string) => value is TagColorKey;
  export let isHexColor: (value: string) => boolean;

  export let chooseTagColor: (key: TagColorKey) => void;
  export let chooseCustomTagColor: (hex: string) => void;
  export let doCreateTag: () => void | Promise<void>;
  export let doDeleteTag: (id: number) => void | Promise<void>;

  export let choosePersonColor: (key: TagColorKey) => void;
  export let chooseCustomPersonColor: (hex: string) => void;
  export let doCreatePerson: () => void | Promise<void>;
  export let doDeletePerson: (id: number) => void | Promise<void>;

  export let doOutlookConnect: () => void | Promise<void>;
  export let doOutlookDisconnect: () => void | Promise<void>;
  export let doOutlookDisconnectConnection: (connectionId: number) => void | Promise<void>;
  export let doOutlookSetConnectionColor: (connectionId: number, colorKey: TagColorKey) => void | Promise<void>;
</script>

<section class="mb-8" id="section-calendar">
  <h2 class="text-lg font-semibold text-white/90 mb-4">Kalender</h2>

  <div class="space-y-4">
    <TagsSection
      {authed}
      {tags}
      bind:newTagName
      bind:newTagColor
      {tagError}
      bind:tagColorMenuOpen
      {colorBg}
      {colorNames}
      {isTagColorKey}
      {isHexColor}
      {chooseTagColor}
      {chooseCustomTagColor}
      {doCreateTag}
      {doDeleteTag}
    />

    <PersonsSection
      {authed}
      {persons}
      bind:newPersonName
      bind:newPersonColor
      {personError}
      bind:personColorMenuOpen
      {colorBg}
      {colorNames}
      {isTagColorKey}
      {isHexColor}
      {choosePersonColor}
      {chooseCustomPersonColor}
      {doCreatePerson}
      {doDeletePerson}
    />

    <OutlookSection
      {authed}
      {outlookStatus}
      {outlookConnections}
      {outlookError}
      {outlookBusy}
      bind:outlookColorMenuFor
      {colorBg}
      {colorNames}
      {doOutlookConnect}
      {doOutlookDisconnect}
      {doOutlookDisconnectConnection}
      {doOutlookSetConnectionColor}
    />
  </div>
</section>
