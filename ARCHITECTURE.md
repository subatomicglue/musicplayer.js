# musicplayer.js Web Component Architecture


## Table of contents

- [Goals](#goals)
- [Components](#components)
  - [`<music-player>`](#music-player)
  - [`<music-player-playlist>`](#music-player-playlist)
  - [`<music-player-playlist-track>`](#music-player-playlist-track)
  - [`<music-player-bar>`](#music-player-bar)
  - [`<music-player-playbutton>`](#music-player-playbutton)
- [Playlist state machine](#playlist-state-machine)
- [Repeat and order](#repeat-and-order)
- [State and events](#state-and-events)
  - [State Change event callbacks](#state-change-event-callbacks)
  - [Error](#error)
  - [Notification](#notification)
- [Shared preferences](#shared-preferences)
- [Artwork fallback](#artwork-fallback)
- [iOS and mobile playback](#ios-and-mobile-playback)
  - [Technical approach](#technical-approach)
- [Error handling](#error-handling)
- [Demo plan](#demo-plan)
- [Dependencies](#dependencies)

## Goals

- Use standards-based HTML Web Components.
- Keep the entire implementation in `musicplayer.js` for easy inclusion.
- Separate components break out
  - `<music-player>` playback engine (containing all playback state, playlist/track configuration)
  - `<music-player-playlist>` playlist
  - `<music-player-playlist-track>` playlist-track (or track)
  - `<music-player-bar>` persistent playback bar with transport controls
  - `<music-player-playbutton>` simple album art button transport control
  - ...potentially others(??)
- Support multiple playlists
  - same track may appear in multiple playlists
- Support multiple independent `<music-player>` engines.
- Preserve playback when the page is backgrounded or the screen is locked where the browser and operating system permit it. (works like a native music player on iOS/iPhone)
- Integrate with operating-system media controls through the Media Session API.
- Remain dependency-free.
- all state callbacks have both: html param, code function listener

## Components

### `<music-player>`

The playback engine.

```html
<music-player id="main-player" icon="default-artwork.jpg"></music-player>
```

The engine owns:

- The single persistent `HTMLAudioElement`.
- Holds the data definitions for all [0..N] PLAYLISTS created referencing my player id
- the active playing playlist (playlist id name)
- the active playing playlist track (integer index into the playlist array).
- the active playing audio (audio object, src url, etc)
- Play, pause, stop, previous, and next behavior.
- Current time, duration, volume, and loading state.
- Track-ended sequencing.
- Media Session metadata and system media-control handlers.

Media Session is page-global even when multiple engines coexist. Only one engine plays at a time: the engine that most recently begins playback takes ownership, pauses any other playing/loading engine without resetting its selected track, and owns the Media Session handlers and lock-screen metadata. Any engine may later take that ownership in the same way. Stopping, removing, or disconnecting the owner hands ownership to another engine that is still playing, or clears the handlers when none remain.
- State-change events consumed by the other components.

Audio URL loading progress uses the standard `HTMLAudioElement` `progress` event and `buffered` time ranges. `loadingProgress` is reported from `0..1`; no separate XHR download is used.

Every element manipulates the engine: adding/removing configuration, triggering state changes, or listening to state changes.

The engine contains no GUI user interface.
It's a playback engine only.

Detailed engine behavior is defined in [Playlist state machine](#playlist-state-machine) and [State and events](#state-and-events).

Public methods:

```js
player.addPlaylist(playlist_id, playlist)
player.removePlaylist(playlist_id)
player.getActivePlaylist()
player.setActivePlaylist(playlist_id)
player.setActiveTrack(playlist_index) // uses playlist index (not the permanent sort_order)
player.setActivePlaylistAndTrack(playlist_id, playlist_index = -1)
player.play()
player.pause()
player.isPlaying()
player.stop()
player.prev()
player.next()
player.seek(seconds)
player.setVolume(value)
player.setRepeatMode(mode)
player.setOrderMode(mode)
player.notify(message, detail = {})
```

The library also provides:

```js
findEngine(engine_name)
engine.findPlaylist(playlist_name)
```

`findEngine()` selects all `<music-player>` elements. Given `undefined`, it returns the first engine. Given a name, it returns the first engine with that `id`, or `undefined` when not found.

`findPlaylist()`. Given `undefined`, it returns the first playlist. Given a name, it returns the first playlist with that `id`, or `undefined` when not found.

`getActivePlaylist()` returns the active playlist definition, or `undefined` when no playlist is active. Engine playlist definitions contain data only; the engine never stores playlist or track DOM elements.

`setActivePlaylist(playlist_id)` switches playlists and defaults the new playlist to track `0`; if already active, it does nothing. `setActiveTrack(playlist_index)` changes the current track in the active playlist. `setActivePlaylistAndTrack(playlist_id, playlist_index = -1)` atomically switches both without briefly loading another track; `-1` defaults to track `0`. If the engine is playing, the newly selected track plays immediately. If paused or stopped, selection changes without playing.

### `<music-player-playlist>`

Defines, Displays, and Controls an ordered playlist of tracks (into the <music-player> engine).

All playlist & tracks are registered with the `<music-player>` engine.
GUI here is notified by `<music-player>` engine
GUI here makes changes to the `<music-player>` engine

The playlist does not play audio, but could contain cached vars useful for its GUI.

```html
<music-player-playlist
  id="playlist-one"
  player="main-player"
  compact=""
  title="Playlist One"
  artist="Playlist Artist"
  album="Playlist Album"
  data="[ { src: '', title: '', desc: '' }, ... ]"
  icon="playlist-artwork.jpg">
  <music-player-playlist-track
    src="song-one.mp3"
    title="Song One"
    desc="Description">
  </music-player-playlist-track>
</music-player-playlist>
```

- A `<music-player-playlist>` requires a unique `id` to name it...
- Re-registering the same playlist component updates its engine copy. A different playlist component attempting to register an existing `id` is rejected and emits one `error`; it never silently replaces the existing playlist.
- On the engine
  - use this playlist `id` when setting the active playlist and adding/removing playlists. Track selection uses its current playlist array index.
  - Adding/removing a `<music-player-playlist>` to/from the DOM adds/removes the engine's registered copy of that playlist.
  - Removing the active playlist stops current playback.
- `artist`, `album`, and `icon` provide defaults for child tracks that do not set them.
- `compact` is a reflected boolean attribute/property. Compact presentation follows the supplied compact-playlist concept: each row is a minimal-height single line showing its playbutton, track number, ellipsized title, duration when space permits, and an always-visible download button. At compact icon sizes, the playbutton becomes glyph-only instead of shrinking album artwork into an unreadable thumbnail.

The `data` property/attribute is a convenience API. It creates the equivalent playlist-track children:

```html
<!--  data: convenience API creates playlist-track children -->
<music-player-playlist
  id="playlist-two"
  player="main-player"
  data='[{src:"", title:"", desc:""},...]'
></music-player-playlist>

<script>
  document.getElementById("playlist-two").data = [
    { src: "song-one.mp3", title: "Song One", desc: "Description" },
    { src: "song-two.mp3", title: "Song Two", desc: "Description" }
  ];
</script>
```

Using a JavaScript property is preferred for structured data. JSON in an HTML attribute will also be supported when validly escaped.

Playlist with both data and explicit track children:
- Merge both, children append to the end of the data

`presentation-only` makes the component a non-registering view of an existing engine playlist:

```html
<music-player-playlist presentation-only player="main-player" playlist="playlist-one"></music-player-playlist>
```

`presentation-only` is fixed when the element is connected. It is declarative setup, not a runtime mode; changing the attribute afterward is unsupported.

It mirrors the referenced registered playlist and uses the same playlist-track presentation and controls, but does not add, remove, replace, or own the engine's playlist data.

### `<music-player-playlist-track>`

Defines, Displays and controls one audiotrack in a playlist.

All playlist/tracks are registered with the `<music-player>` engine.
GUI here is notified by `<music-player>` engine
GUI here makes changes to the `<music-player>` engine

The playlist track does not create or contain a playlist, but could contain cached vars useful for its GUI.

```html
<!--  sort_order: unique index from 0-(n-1), automatically set at init
-->
<music-player-playlist-track
  player="main-player"
  src="song.mp3"
  title="Song"
  desc="Description"
  artist="Artist"
  album="Album"
  icon="song-artwork.jpg"
  duration=""
  sort_order=""
>
</music-player-playlist-track>
```

- `<music-player-playlist-track>`'s are mirrored to `engine.playlist[n]`
- Tracks get an automatically assigned permanent `sort_order="0".."(n-1)"` when created, based on original order. Never changes afterward.
- When registered, the `<music-player>` stores that `sort_order` as `engine.playlist[n].sort_order`.
  - It is used only for sorting (to restore original playlist order after randomization)
  - playback selection / statemachine always uses the playlist array index, NEVER the `sort_order`.
- Reordering a playlist, in the engine, does not change these permanent track `sort_order`s, only changes the playlist array sort order. Which reflects to any listeners (HTML music-player-playlist element will be listening).
- `playlist="<myplaylist>"` is assigned from the parent playlist when not present.
- `artist`, `album`, and `icon` fall back to defaults from the parent playlist.
- `duration` is the optional total track length in seconds. When omitted, the engine schedules discovery through one non-playing metadata-probe `HTMLAudioElement`, shared by the whole page. The probe checks track URLs sequentially with `preload="metadata"`; the engine reads and caches the result by normalized URL, updates its registered track state, and emits the duration change. Matching playlist-track widgets then reflect the value to their own `duration` attribute/property. Duplicate URLs share the same in-flight request or cached duration. Widgets never initiate metadata loading. This uses the browser's native media loader; it does not parse M4A/MP3 files or request entire files explicitly.
- Duration discovery never blocks playlist or bar rendering. Unknown durations display a placeholder and update individually in place as metadata arrives.

When activated, it tells the engine which playlist ID and current array index to play. Which will notify all listeners (including self), of the change (so GUI can reflect).

Clicking anywhere on a playlist track activates it with `engine.setActivePlaylistAndTrack(playlist_id, playlist_index)`. Its playbutton performs the same selection before calling `play()` or `pause()`.

Each track displays its total duration to the right of its title.

Each track's always-visible download control uses the standard arrow-pointing-down-into-a-tray icon.

Playlist tracks observe engine state. Every track whose normalized `src` URL matches the engine's current track updates its play/pause state, including duplicate tracks in different playlists.

Activating a duplicate track changes the engine's active playlist to the playlist containing the track that was activated.

If a track has no parent playlist, it creates a parent `<music-player-playlist>` with a nonconflicting ID and moves itself into it. All orphan tracks at the same DOM level share that generated parent playlist.

Removing this track DOM element auto removes the track from both the parent playlist (if cached there at all), and from the engine.

A playlist track may specify player, while its parent playlist also specifies one. Which wins?
- if a parent playlist is present, then all track players will be ignored.   the parent's player will be used.

### `<music-player-bar>`

A fixed bottom player connected to an engine.

```html
<music-player-bar player="main-player"></music-player-bar>
```

The bar is visible only when the engine has an active playlist or track and is not stopped. An empty playlist may be active without an active track. Calling `stop()` hides the bar while preserving the engine's selected playlist/track according to the state machine.

The bar has three presentation states:

- `minimized`: hugs the bottom edge and shows the current track's `<music-player-playbutton>`, title, album, `currentTime / duration`, `^`, and `X`. The `v` is hidden. Tapping the title restores `normal`.
- `normal`: shows:

    - Current artwork rendered by `<music-player-playbutton>`; the artwork itself is the play/pause button, not a separate control.
    - Current title with `currentTime / duration` to its right.
    - Current album beneath the title, falling back to artist when album metadata is absent.
    - Previous and next controls.
    - Repeat mode control.
    - Random/inorder/reverse control.
    - Playhead position and duration.
    - Seek control. Dragging captures the pointer, so the playhead continues following horizontal pointer position even when the pointer moves vertically outside the bar.
    - On desktop, a styled volume slider and speaker icon where screen space permits. The icon indicates mute, 33%, 66%, or 100%; activating it cycles those four levels and reflects the result into the slider. The control stays hidden on iOS/mobile, where device controls own output volume.
    - A close (`X`) button that calls `engine.stop()` and consequently hides the bar.
    - Share.

The seek display has three flat layers: black for unloaded time, light charcoal for loaded/buffered time, and blue in the foreground for elapsed playback. The blue playhead has a precise hard edge and no draggable ball in this widget.

Bar track information uses constrained responsive columns: the title ellipsizes before the time or transport controls overflow or move out of position.

- `maximized`: rises upward and additionally shows the engine's active playlist. It fits short playlists and grows to a viewport-relative maximum for long playlists, after which the playlist scrolls internally without scrolling the host page. Its lower-right control row is Share, `v`, and `X`; `^` is hidden. Share uses the standard box-with-up-arrow icon and shares the current page URL. Use the platform share sheet when the Web Share API is available in a secure context; otherwise show a small modal containing the URL as selectable text and a standard copy icon, dismissed by its `X` or a backdrop tap.

In `normal` and `maximized`, the view/share/close controls sit beneath the right side of the progress meter. Share is hidden only in `minimized`; unavailable direction controls remain hidden at either end. Previous and next sit at the lower-left beneath the playbutton, followed by repeat and order. The controls have no surrounding outline, remain finger-tappable, and use crisp standard vector icons. `X` calls `engine.stop()` from every view.

The maximized playlist must reuse `<music-player-playlist>` presentation rather than maintain separate playlist-row markup. Reuse must be presentation-only: it references the active registered playlist without moving it in the DOM, duplicating its ID, or registering a second playlist with the engine.

Previous and next controls are disabled when the active queue has no corresponding track.

Built-in GUI components expose play/pause only. `stop()` remains available through the engine API for application code or custom GUI.

While onscreen, the bar adds global keyboard handlers:

- spacebar toggles `play()`/`pause()`
- up/left calls `prev()`
- down/right calls `next()`
- shift+left/right seeks backward/forward 10 seconds

Multiple player bars are possible, although generally only one should be visible. Keyboard shortcuts act only through visible player bars; multiple visible player bars would each receive them.

### `<music-player-playbutton>`

A widget that can be used in multiple places:

- for `<music-player-playlist-track>` play/pause button
- for `<music-player-bar>` play/pause button

```html
<!-- 
  thumbnail="url"             // use the engine's if not specified.
  player=""                   // optional, defaults to findEngine() 
  playlist=""                 // optional; resolves from parent, active playlist, then first engine playlist
 -->
<music-player-playbutton
  thumbnail="url"
  player=""
  playlist=""
></music-player-playbutton>
```

Add this button to a playlist (auto affects that one playlist)
Add this button to a webpage (auto affects the first engine)
Otherwise, you can set the player="" and the playlist="" to constrain it...

When clicked:
- when associated with a playlist track, call `engine.setActivePlaylistAndTrack(resolved_playlist_id, resolved_playlist_index)`
- when used as the player bar's `<music-player-playbutton>` (the album-art button), call `engine.play()` or `engine.pause()` for the already-selected track without reselecting the playlist or track
- otherwise, call `engine.setActivePlaylist(resolved_playlist_id)`
- if the displayed icon is play, call `engine.play()`
- if the displayed icon is pause, call `engine.pause()`

listens to (and updates GUI with)
- engine play/pause state
- engine current track image

The play/pause glyph uses a simple, crisp, hard-edged treatment that remains legible over artwork of any color. It uses no blur, shadow falloff, or gradient. Previous/next and share controls use clean standard vector icons with the same visual treatment.

The playbutton resolves its engine and playlist from its attributes, parent components, or the fallback rules in [Dependencies](#dependencies), then uses the public engine API. Playlist resolution order is enclosing playlist, explicit `playlist`, active engine playlist, then the engine's first playlist. It contains no playlist state-machine logic; playback behavior is defined in [Playlist state machine](#playlist-state-machine).

The playbutton may inspect its own DOM context to resolve omitted player, playlist, or track inputs. It reads playlist and playback data from the engine and controls it through public APIs; it never asks the engine for DOM elements.

## Playlist state machine

The engine has one simple state machine governing the complete playlist lifecycle. Audio events and user commands use the same transitions so next/prev, errors, repeat, and automatic advancement cannot compete with each other.

State held by the engine:

```js
{
  activePlaylist,
  currentPlaylistIndex,
  currentTrackURL,
  transport, // empty, loading, playing, paused, stopped
  loadingProgress, // 0..1
  repeatMode,
  orderMode
}
```

Commands:

- `setActivePlaylist(playlist_id)`: if the playlist is not already active, make it active with track index `0`. If it is already active, do nothing. An empty playlist may be active for its metadata, but has no current track.
- `setActiveTrack(playlist_index)`: change the current track in the active playlist using its current array index, clamped between 0 and (playlist.size - 1). Selecting the current index is a NOP. An empty playlist has no current track.
- `setActivePlaylistAndTrack(playlist_id, playlist_index=-1)`: atomically switch playlist and track so an intermediate track is never loaded or played. `-1` defaults to index `0`. If the playlist and track are already selected, it is normally a NOP; when transport is stopped, it reactivates that selection as paused at 0:00 so player bars become visible without autoplaying.
- Playlist/track selection preserves transport intent: when the engine is playing, the newly selected track starts immediately; when paused or stopped, selection changes without playing.
- `play()`: play (or resume) the current track. If there is no current track, play index `0` of the active playlist.
- `pause()`: pause and preserve the current track and playhead.
- `stop()`: on the first call, pause and reset the current track's playhead to 0:00. If already stopped, reset the current playlist index to `0` as well.
- `next()` / `prev()`: always callable and move through the active playlist using its current array order. If no next/previous track is available, the command is a NOP. If playing, changing tracks immediately plays the changed track; if paused or stopped, it only changes the current track.
  - `next()` advances when there is a later track. At the final track, `all-repeat` wraps to index `0`; otherwise it is a NOP.
  - `prev()` moves back when there is an earlier track. At index `0`, `all-repeat` wraps to the final track; otherwise it is a NOP.
  - `1-repeat` affects automatic track advancment; manual next/previous still use the rules above (simply restarts the 1 track).
  - Engine state reports `hasNext` and `hasPrevious`. GUI components listen to `statechange` and enable/disable their next/previous buttons from those values.
  - With one track, next/previous restart that track when in a repeat mode. Without repeat, next/previous are NOPs and their GUI buttons are disabled (via the listener event causing the gui buttons to disable).
- `setRepeatMode()` / `setOrderMode()`: update the modes without interrupting the current track.

`isPlaying()` returns the engine's current playing state as a boolean. GUI components normally use `statechange` events instead of polling it.

Automatic transitions:

- An audio `ended` event enters the track-completion transition governed by repeat mode.
- A track playback error is treated exactly like the track finished and follows the same next/repeat behavior.
- Removing the active playlist stops playback and removes that playlist from the engine.
- Reordering changes only the playlist array order; the current track continues uninterrupted and keeps its permanent ID.
- Removing the active playing track from a playlist:
  - Stop the removed track
  - Play the next track if there is one
- Repeat behavior (for errors)
 - if the repeat-span (from play() until the repeat point) has played with no successes, then abort.  If any successes, then repeat... 

Completion behavior follows the repeat modes defined below.

Every completed transition publishes the new engine state. Playlist tracks, playlists, bars, Media Session, and code listeners update from that notification.

## Repeat and order

Repeat semantics:

- `1`: play selected track once
- `1-repeat`: repeat selected track
- `all`: play through the active playlist once
- `all-repeat`: loop the active playlist

Order semantics:

- `random`: shuffle the actual playlist
- `inorder`: sort by the original permanent track IDs
- `reverse`: reverse sort the playlist (by the original permanent track IDs)

While `random` is selected, the bar shows a reload-style circular-arrow button immediately to its right. Activating it calls `setOrderMode("random")` again to produce a new shuffle without changing modes.

Changing order during playback does not interrupt the current track.

## State and events

The engine is the source of truth. Presentation components do not maintain independent playback state.

GUI controls register one stable click handler and issue one intentional engine action sequence per click/tap. Rendering or state updates must not duplicate handlers, replace a live control during its click, or allow overlapping pointer/click handlers to issue competing commands. Play/pause and previous/next controls must respond on the first activation.

The engine provides an event API to "listen" for changes to state, both in HTML callback (e.g. onstatechange="") handlers and addEventListener/removeEventListener() api on the engine.

Every HTML callback has a 1:1 corresponding event-listener API. Both receive the same `CustomEvent` object.

### State Change event callbacks

HTML callback:

```html
<music-player onstatechange="handleState(event)"></music-player>
```

Corresponding code listener:

```js
player.addEventListener("statechange", (event) => {
  console.log(event.detail);
});
```

`statechange` is emitted after any engine state change, including:

- active playlist or current track changes
- play, pause, stop, loading, or ended changes
- playhead, duration, seek, volume, or mute changes
- repeat or order mode changes
- playlist registration, removal, or reordering

State detail:

```js
{
  track,
  playlist,
  currentPlaylistIndex,
  playing,
  paused,
  loading,
  loadingProgress,
  currentTime,
  duration,
  volume,
  muted,
  repeatMode,
  orderMode,
  hasPrevious,
  hasNext
}
```

The HTML `onstatechange` handler and every `statechange` listener run once for the same emitted event. Components listen to this event to update their GUI; they do not poll the engine.

The engine also emits `trackdurationchange` (and supports `ontrackdurationchange=""`) when asynchronous metadata discovery learns one track's duration. Its event detail contains `playlistId`, permanent `sort_order`, `src`, and `duration`. Playlist GUIs use this focused event to update that one time in place, including for inactive playlists. On connection they read the engine's registered playlist state to initialize durations already known; they do not poll.

### Error

HTML callback:

```html
<music-player onerror="handleError(event)"></music-player>
```

Corresponding code listener:

```js
player.addEventListener("error", (event) => {
  console.error(event.detail);
});
```

Error detail:

```js
{
  message,
  error,
  playlist,
  track
}
```

Specific errors may add fields such as a stable error `code` or referenced playlist ID.

The engine emits `error` for invalid API references and audio playback errors. Audio playback errors also enter the normal track-completion transition described by the playlist state machine.

### Notification

`engine.notify(message, detail)` emits `notify` and supports the matching `onnotify=""` HTML callback and `addEventListener("notify", listener)` API. Its event detail contains `message` plus the supplied detail fields. Notifications use the same listener/callback plumbing as errors but do not imply failure. The demo uses this channel to confirm that the fallback Share URL was copied.

Connected components subscribe directly to their target engine rather than using global events or polling.

## Shared preferences

Volume, order, and repeat preferences:

1. persist across reloads in `localStorage` for all music-player engines globally
2. initialize every engine from the stored values, or sane defaults when not set
3. remain synchronized between all engines during runtime through a shared state-change listener

Defaults:

```js
{
  volume: 1,
  repeatMode: "all",
  orderMode: "inorder"
}
```

## Artwork fallback

Artwork resolves in this order:

1. The playlist track's `icon`.
2. Its enclosing playlist's `icon`.
3. The engine's `icon`.
4. A built-in neutral music placeholder.

The resolved artwork is also passed to Media Session metadata. Track `artist` and `album` are also supplied for lock-screen metadata.

## iOS and mobile playback

Status: verified on a physical iPhone in iOS Safari with the current `musicplayer.js` implementation. Background-tab, background-app, lock-screen playback, and iOS system media presentation behave like the Bandcamp reference. This working behavior is a regression-protected baseline.

IMPORTANT: The observable behavior of [Bandcamp's iOS browser player](https://glacierma.bandcamp.com/album/a-distant-violent-shudder) is the reference. After playback begins from a user gesture, audio is expected to continue uninterrupted when the user:

- changes browser tabs
- puts the browser in the background or changes apps
- turns off the screen or displays the lock screen

The current track must appear in iOS system media UI, including the Dynamic Island/notch and lock screen where supported. Title, artist, album, and artwork stay synchronized. System play, pause, previous, next, and seek controls call the same engine API and state machine as the webpage controls.

Media metadata fields must remain normalized: `title` contains only the track title, `artist` contains only the artist name, and `album` contains only the album title. Do not append strings such as `"by <artist>"` to `title`; iOS displays `artist` beneath the title and would otherwise show it twice.

The engine uses one persistent `HTMLAudioElement` (`new Audio()`) for primary playback. It is never replaced or discarded between tracks. Page visibility changes must not pause, stop, unload, or recreate it. The first playback starts directly from a user gesture.

### Technical approach

This does not require a PWA or installation to the Home Screen. The primary target is a normal webpage open in iOS Safari, like Bandcamp. PWA behavior is a separate compatibility target.

Each `<music-player>` engine uses one long-lived native playback `HTMLAudioElement`, not one playback element per track. Track changes reuse that element. A separate page-wide element may sequentially load metadata only to discover track durations; it never plays or replaces an engine's playback element. Native media playback is preferred over Web Audio, XHR/fetched audio blobs, or a timer-driven transport because Safari can keep native media playback associated with the system audio session while the page is backgrounded.

Playback must begin from a user gesture to satisfy mobile autoplay rules. After that, native audio events drive playback state and playlist sequencing; hiding or backgrounding the page does not tear down or pause the audio element.

The Media Session API supplies track metadata and connects iOS system play/pause/seek/previous/next controls to the engine where supported. The Audio Session API may identify the content as music playback where supported. Both are progressive enhancements around the native audio element, not replacements for it.

Audio files are served as normal streamable media with correct MIME types and byte-range support. No special Bandcamp service, native wrapper, service worker, or PWA is required for the architecture.

The current implementation's persistent audio-element ownership, native event-driven sequencing, source-transition behavior, and Media Session integration must not be substantially changed without repeating the physical-iPhone regression tests below.

Playlist sequencing must continue through the normal state machine while the page is backgrounded or locked, including automatic advancement and repeat behavior when a track ends. Browser or operating-system interruptions must not be mistaken for `stop()`; playback state should recover consistently when the platform permits it.

Audio hosting must support iOS-compatible formats, correct MIME types, HTTPS in production, cross-origin access where applicable, and byte-range requests.

Before release, test on a physical iPhone in Safari:

1. Start playback with an onscreen user gesture.
2. Change Safari tabs and verify uninterrupted playback.
3. switch to another app and verify uninterrupted playback.
4. Lock the phone and verify uninterrupted playback, metadata, artwork, and controls.
5. Use lock-screen/Dynamic Island play, pause, seek, previous, and next.
6. Let a track end while backgrounded and verify auto-advance and every repeat mode.
7. Return to the page and verify its state and controls match the system state.

Safari-tab playback is the primary iOS acceptance target; installed Home Screen/PWA behavior must be tested separately because it can differ. A browser regression may be documented as a compatibility issue, but browser policy is not an excuse to omit this architecture or skip the physical-iPhone acceptance tests.

## Error handling

A playback error is treated as the track finishing and naturally triggers the state machine's `next()` behavior.

Missing engine, playlist, or track IDs are ignored and may call `console.error()` plus the optional error callback. Duplicate playlist IDs from different playlist components are rejected as errors. The demo connects errors to a full-screen modal queue in `index.html`; each error is dismissed in order with its `X`, a backdrop tap, or the platform dialog-cancel action.

## Demo plan

`index.html` will retain all existing valid track data and demonstrate:

- One engine.
- Two valid distinct playlists plus a deliberate duplicate-ID playlist demonstrating collision handling.
- At least one track URL appearing in both playlists.
- Manually declared playlist tracks.
- A playlist populated through the `data` property.
- A bottom playback bar.
- Switching the active playlist by activating a track in either playlist.
- Track, playlist, and engine artwork plus deliberate missing track/playlist artwork to demonstrate both fallback levels.
- Error callback connected to a full-screen queued error modal.

## Dependencies

- `<music-player>` expects nothing.
- `<music-player-playlist>` expects `<music-player-playlist-track>` children or a `data` field. With neither, it is empty and does nothing. In `presentation-only` mode it instead expects a registered playlist referenced by `playlist`, defaulting to the engine's active playlist.
- `<music-player-playbutton>` expects nothing.
- `<music-player-bar>` expects nothing.
- `<music-player-playlist-track>` expects a `<music-player-playlist>` parent and if missing, will create a parent `<music-player-playlist>` and move self to it.   all without a parent will land in the same parent.
- When `player` is unspecified, use `findEngine()`
- When a `playlist` is unspecified, use the enclosing playlist, then the engine's active playlist, then `engine.findPlaylist()`.
