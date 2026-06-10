// Dev-only keyframe authoring mode, toggled by adding `?edit` (or `edit=1`)
// to the URL. Kept out of the store: it is a launch-time switch, not state.

export const EDIT_MODE: boolean =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('edit');
