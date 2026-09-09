/* musicplayer.js - dependency-free Web Components audio player */
(function () {
  "use strict";

  const STORAGE_KEY = "musicplayer.preferences";
  const DEFAULT_PREFERENCES = { volume: 1, repeatMode: "all", orderMode: "inorder" };
  const REPEAT_MODES = ["1", "1-repeat", "all", "all-repeat"];
  const ORDER_MODES = ["inorder", "random", "reverse"];
  const MEDIA_SESSION_ACTIONS = ["play", "pause", "stop", "previoustrack", "nexttrack", "seekto", "seekbackward", "seekforward"];
  const API_PLAYLIST_OWNER = Symbol("musicplayer-api-owner");
  const engines = new Set();
  const orphanPlaylists = new WeakMap();
  const durationCache = new Map();
  const durationRequests = new Map();
  const durationQueue = [];
  let durationProbe;
  let activeDurationRequest;
  let mediaSessionOwner;
  let mediaSessionClaimSequence = 0;

  function loadPreferences() {
    try {
      return { ...DEFAULT_PREFERENCES, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
    } catch (_) {
      return { ...DEFAULT_PREFERENCES };
    }
  }

  let preferences = loadPreferences();

  function savePreference(name, value) {
    preferences = { ...preferences, [name]: value };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences)); } catch (_) { /* storage unavailable */ }
    engines.forEach((engine) => engine.applyPreferences(name));
  }

  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return;
    preferences = loadPreferences();
    engines.forEach((engine) => engine.applyPreferences());
  });

  function findEngine(engineName) {
    const all = [...document.querySelectorAll("music-player")];
    return engineName === undefined || engineName === ""
      ? all[0]
      : all.find((engine) => engine.id === engineName);
  }

  window.findEngine = findEngine;

  function absoluteURL(url) {
    try { return new URL(url, document.baseURI).href; } catch (_) { return url || ""; }
  }

  function requestDuration(url, callback) {
    const key = absoluteURL(url);
    if (!key) return;
    if (durationCache.has(key)) {
      queueMicrotask(() => callback(durationCache.get(key)));
      return;
    }
    if (durationRequests.has(key)) {
      durationRequests.get(key).push(callback);
      return;
    }
    durationRequests.set(key, [callback]);
    durationQueue.push({ key, url });
    runDurationProbe();
  }

  function runDurationProbe() {
    if (activeDurationRequest || !durationQueue.length) return;
    activeDurationRequest = durationQueue.shift();
    durationProbe ||= new Audio();
    durationProbe.preload = "metadata";
    let settled = false;
    const finish = (duration) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      durationProbe.removeEventListener("loadedmetadata", loaded);
      durationProbe.removeEventListener("error", failed);
      const callbacks = durationRequests.get(activeDurationRequest.key) || [];
      durationRequests.delete(activeDurationRequest.key);
      if (Number.isFinite(duration) && duration > 0) {
        durationCache.set(activeDurationRequest.key, duration);
        callbacks.forEach((callback) => callback(duration));
      }
      activeDurationRequest = undefined;
      durationProbe.removeAttribute("src");
      durationProbe.load();
      queueMicrotask(runDurationProbe);
    };
    const loaded = () => finish(durationProbe.duration);
    const failed = () => finish(undefined);
    const timeout = setTimeout(failed, 15000);
    durationProbe.addEventListener("loadedmetadata", loaded);
    durationProbe.addEventListener("error", failed);
    durationProbe.src = activeDurationRequest.url;
    durationProbe.load();
  }

  function time(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "--:--";
    return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
  }

  function hasTextSelection() {
    const selection = window.getSelection();
    return Boolean(selection && !selection.isCollapsed && selection.toString());
  }

  function installPointerFocus(root) {
    root.addEventListener("pointerdown", (event) => {
      event.target.closest?.("button,a,input,[tabindex]")?.classList.add("pointer-focus");
    });
    root.addEventListener("focusout", (event) => {
      event.target.classList?.remove("pointer-focus");
    });
  }

  function transportIcon(name) {
    const paths = {
      play: '<path d="M10 7v18l15-9z"/>',
      pause: '<path d="M9 7h5v18H9zm11 0h5v18h-5z"/>',
      previous: '<path d="M8 7h3v18H8zm18 1v16L13 16z"/>',
      next: '<path d="M23 7h3v18h-3zM8 8v16l13-8z"/>',
      up: '<path d="m8 20 8-8 8 8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
      down: '<path d="m8 12 8 8 8-8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
      close: '<path d="M9 9l14 14M23 9 9 23" fill="none" stroke-linecap="round"/>',
      share: '<path d="M16 5v16m-6-10 6-6 6 6M8 16H6v11h20V16h-2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
      copy: '<path d="M11 10V6h15v17h-4M6 10h16v17H6z" fill="none" stroke-linejoin="round"/>',
      download: '<path d="M16 5v15m-6-6 6 6 6-6M7 22v5h18v-5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
      reload: '<path d="M25 13a10 10 0 1 0 0 7M25 7v6h-6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
      volume0: '<path d="M5 13h5l6-5v16l-6-5H5zM21 12l7 8m0-8-7 8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
      volume1: '<path d="M5 13h5l6-5v16l-6-5H5zM20 13a5 5 0 0 1 0 6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
      volume2: '<path d="M5 13h5l6-5v16l-6-5H5zM20 13a5 5 0 0 1 0 6m3-9a9 9 0 0 1 0 12" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
      volume3: '<path d="M5 13h5l6-5v16l-6-5H5zM20 13a5 5 0 0 1 0 6m3-9a9 9 0 0 1 0 12m3-15a13 13 0 0 1 0 18" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
    };
    return `<svg viewBox="0 0 32 32" aria-hidden="true">${paths[name] || ""}</svg>`;
  }

  function runHTMLHandler(element, name, event) {
    const propertyHandler = element[`on${name}`];
    if (typeof propertyHandler === "function") propertyHandler.call(element, event);
    else {
      const source = element.getAttribute(`on${name}`);
      if (source) Function("event", source).call(element, event);
    }
  }

  function emit(element, name, detail) {
    const event = new CustomEvent(name, { detail });
    element.dispatchEvent(event);
    // Native handler properties (notably HTMLElement.onerror) are invoked by
    // dispatchEvent(). Custom callback attributes need explicit invocation.
    if (!(`on${name}` in HTMLElement.prototype)) runHTMLHandler(element, name, event);
    return event;
  }

  class MusicPlayerEngine extends HTMLElement {
    constructor() {
      super();
      this.audio = new Audio();
      this.audio.preload = "auto";
      this.playlists = new Map();
      this.playlistOwners = new Map();
      this.reportedPlaylistCollisions = new Set();
      this.activePlaylist = undefined;
      this.currentPlaylistIndex = -1;
      this.transport = "empty";
      this.loadingProgress = 0;
      this._generation = 0;
      this._failureCount = 0;
      this._mediaSessionClaim = 0;

      ["play", "pause", "playing", "waiting", "loadstart", "loadedmetadata", "durationchange", "timeupdate", "volumechange", "progress", "suspend"].forEach((name) => {
        this.audio.addEventListener(name, () => this.handleAudioEvent(name));
      });
      this.audio.addEventListener("ended", () => this.completeTrack(false));
      this.audio.addEventListener("error", () => this.handleAudioError());
    }

    connectedCallback() {
      this.hidden = true;
      engines.add(this);
      this.applyPreferences();
      this.publishState();
    }

    disconnectedCallback() {
      engines.delete(this);
      this.audio.pause();
      this.releaseMediaSession();
    }

    get currentPlaylist() {
      return this.activePlaylist ? this.playlists.get(this.activePlaylist) : undefined;
    }

    get currentTrack() {
      return this.currentPlaylist?.tracks[this.currentPlaylistIndex];
    }

    findPlaylist(playlistName) {
      if (playlistName === undefined || playlistName === "") return this.playlists.values().next().value;
      return this.playlists.get(playlistName);
    }

    getActivePlaylist() {
      return this.currentPlaylist;
    }

    addPlaylist(playlistId, playlist, owner) {
      if (!playlistId) return this.reportError("Playlist requires an id");
      const existingOwner = this.playlistOwners.get(playlistId);
      const registrationOwner = owner ?? existingOwner ?? API_PLAYLIST_OWNER;
      if (existingOwner !== undefined && existingOwner !== registrationOwner) {
        if (!this.reportedPlaylistCollisions.has(registrationOwner)) {
          this.reportedPlaylistCollisions.add(registrationOwner);
          this.reportError(`Playlist id is already registered: ${playlistId}`, undefined, {
            code: "playlist-id-collision",
            playlistId
          });
        }
        return false;
      }
      this.reportedPlaylistCollisions.delete(registrationOwner);
      const previous = this.playlists.get(playlistId);
      const currentTrack = this.activePlaylist === playlistId ? this.currentTrack : undefined;
      const previousIndex = this.currentPlaylistIndex;
      const wasPlaying = this.isPlaying();
      const definition = {
        id: playlistId,
        title: playlist.title || "",
        artist: playlist.artist || "",
        album: playlist.album || "",
        icon: playlist.icon || "",
        compact: Boolean(playlist.compact),
        tracks: playlist.tracks.map((track) => ({ ...track }))
      };
      this.orderTracks(definition.tracks, preferences.orderMode, !previous);
      this.playlists.set(playlistId, definition);
      this.playlistOwners.set(playlistId, registrationOwner);
      this.discoverTrackDurations(playlistId);

      if (this.activePlaylist === playlistId) {
        this.currentPlaylistIndex = currentTrack
          ? definition.tracks.findIndex((track) => track.sort_order === currentTrack.sort_order)
          : Math.min(this.currentPlaylistIndex, definition.tracks.length - 1);
        if (currentTrack && this.currentPlaylistIndex < 0) {
          if (previousIndex < definition.tracks.length) {
            this.currentPlaylistIndex = previousIndex;
            this.loadCurrentTrack();
            if (wasPlaying) this.play();
          } else {
            this.currentPlaylistIndex = -1;
            this.loadCurrentTrack();
          }
        } else if (this.currentPlaylistIndex < 0 && definition.tracks.length) {
          this.currentPlaylistIndex = 0;
        }
      }
      this.publishState();
      return true;
    }

    discoverTrackDurations(playlistId) {
      const playlist = this.playlists.get(playlistId);
      playlist?.tracks.forEach((track) => {
        if (!track.src || Number(track.duration) > 0) return;
        const expectedURL = absoluteURL(track.src);
        const sortOrder = track.sort_order;
        requestDuration(track.src, (duration) => {
          const currentPlaylist = this.playlists.get(playlistId);
          const currentTrack = currentPlaylist?.tracks.find((item) =>
            item.sort_order === sortOrder && absoluteURL(item.src) === expectedURL
          );
          if (!currentTrack || Number(currentTrack.duration) > 0) return;
          currentTrack.duration = duration;
          emit(this, "trackdurationchange", {
            playlistId,
            sort_order: currentTrack.sort_order,
            src: currentTrack.src,
            duration
          });
          this.publishState();
        });
      });
    }

    removePlaylist(playlistId, owner) {
      if (!this.playlists.has(playlistId)) return this.reportError(`Playlist not found: ${playlistId}`);
      if (owner !== undefined && this.playlistOwners.get(playlistId) !== owner) return false;
      if (this.activePlaylist === playlistId) {
        this.audio.pause();
        this.audio.removeAttribute("src");
        this.audio.load();
        this.activePlaylist = undefined;
        this.currentPlaylistIndex = -1;
        this.transport = "empty";
        this.releaseMediaSession();
      }
      this.playlists.delete(playlistId);
      this.playlistOwners.delete(playlistId);
      this.publishState();
      return true;
    }

    setActivePlaylist(playlistId) {
      if (playlistId === this.activePlaylist) return;
      this.setActivePlaylistAndTrack(playlistId, -1);
    }

    setActiveTrack(playlistIndex) {
      if (!this.currentPlaylist) return this.reportError("No active playlist");
      this.select(this.activePlaylist, playlistIndex);
    }

    setActivePlaylistAndTrack(playlistId, playlistIndex = -1) {
      if (playlistId === this.activePlaylist && playlistIndex < 0) return;
      this.select(playlistId, playlistIndex < 0 ? 0 : playlistIndex);
    }

    select(playlistId, playlistIndex) {
      const playlist = this.playlists.get(playlistId);
      if (!playlist) return this.reportError(`Playlist not found: ${playlistId}`);
      const wasPlaying = this.isPlaying();
      const nextIndex = playlist.tracks.length
        ? Math.max(0, Math.min(Number(playlistIndex) || 0, playlist.tracks.length - 1))
        : -1;
      if (playlistId === this.activePlaylist && nextIndex === this.currentPlaylistIndex) {
        if (this.transport === "stopped") {
          this.transport = "paused";
          this.publishState();
        }
        return;
      }

      const previousURL = absoluteURL(this.currentTrack?.src);
      this.activePlaylist = playlistId;
      this.currentPlaylistIndex = nextIndex;
      const nextURL = absoluteURL(this.currentTrack?.src);
      if (previousURL !== nextURL) this.loadCurrentTrack(wasPlaying);
      this.updateMediaSession();
      this.publishState();
      if (wasPlaying && this.currentTrack) this.play();
    }

    loadCurrentTrack(resumePlayback = false, idleTransport = "paused") {
      this._generation += 1;
      this.audio.pause();
      this.loadingProgress = 0;
      if (!this.currentTrack) {
        this.audio.removeAttribute("src");
        this.audio.load();
        this.transport = "empty";
        return;
      }
      this.audio.src = this.currentTrack.src;
      this.audio.load();
      this.transport = resumePlayback ? "loading" : idleTransport;
    }

    async play() {
      if (!this.currentTrack) {
        if (!this.currentPlaylist?.tracks.length) return;
        this.currentPlaylistIndex = 0;
        this.loadCurrentTrack();
      }
      if (absoluteURL(this.audio.src) !== absoluteURL(this.currentTrack.src)) this.loadCurrentTrack();
      this.claimMediaSession();
      const generation = this._generation;
      this.transport = "loading";
      this.publishState();
      try {
        await this.audio.play();
      } catch (error) {
        if (generation === this._generation && error.name !== "AbortError") this.reportError(error.message, error);
      }
    }

    pause() {
      this.audio.pause();
      if (this.currentTrack) this.transport = "paused";
      this.publishState();
    }

    isPlaying() {
      return !this.audio.paused && !this.audio.ended;
    }

    stop() {
      if (!this.currentTrack) return;
      if (this.transport === "stopped") {
        this.currentPlaylistIndex = 0;
        this.loadCurrentTrack(false, "stopped");
      } else {
        this.audio.pause();
        this.audio.currentTime = 0;
        this.transport = "stopped";
      }
      this.releaseMediaSession();
      this.publishState();
    }

    next() { this.move(1); }
    prev() { this.move(-1); }

    move(direction) {
      const tracks = this.currentPlaylist?.tracks || [];
      if (!tracks.length) return;
      const wasPlaying = this.isPlaying();
      let index = this.currentPlaylistIndex + direction;
      if (tracks.length === 1) {
        if (!preferences.repeatMode.endsWith("-repeat")) return;
        this.audio.currentTime = 0;
        if (wasPlaying) this.play();
        this.publishState();
        return;
      }
      if (index < 0 || index >= tracks.length) {
        if (preferences.repeatMode !== "all-repeat") return;
        index = index < 0 ? tracks.length - 1 : 0;
      }
      this.select(this.activePlaylist, index);
    }

    seek(seconds) {
      if (!this.currentTrack || !Number.isFinite(Number(seconds))) return;
      const maximum = Number.isFinite(this.audio.duration) ? this.audio.duration : Number(seconds);
      this.audio.currentTime = Math.max(0, Math.min(Number(seconds), maximum));
      this.publishState();
    }

    setVolume(value) {
      savePreference("volume", Math.max(0, Math.min(1, Number(value))));
    }

    setRepeatMode(mode) {
      if (!REPEAT_MODES.includes(mode)) return this.reportError(`Unknown repeat mode: ${mode}`);
      savePreference("repeatMode", mode);
    }

    setOrderMode(mode) {
      if (!ORDER_MODES.includes(mode)) return this.reportError(`Unknown order mode: ${mode}`);
      savePreference("orderMode", mode);
    }

    applyPreferences(changedPreference) {
      const currentTrack = this.currentTrack;
      this.audio.volume = preferences.volume;
      if (!changedPreference || changedPreference === "orderMode") {
        this.playlists.forEach((playlist) => this.orderTracks(playlist.tracks, preferences.orderMode, true));
        if (currentTrack) this.currentPlaylistIndex = this.currentPlaylist.tracks.indexOf(currentTrack);
      }
      this.publishState();
    }

    orderTracks(tracks, mode, apply) {
      if (!apply) return;
      if (mode === "inorder") tracks.sort((a, b) => a.sort_order - b.sort_order);
      if (mode === "reverse") tracks.sort((a, b) => b.sort_order - a.sort_order);
      if (mode === "random") {
        for (let index = tracks.length - 1; index > 0; index -= 1) {
          const other = Math.floor(Math.random() * (index + 1));
          [tracks[index], tracks[other]] = [tracks[other], tracks[index]];
        }
      }
    }

    completeTrack(fromError) {
      if (!this.currentTrack) return;
      if (fromError) this._failureCount += 1;
      else this._failureCount = 0;
      const tracks = this.currentPlaylist.tracks;
      const repeat = preferences.repeatMode;
      if (fromError && ((repeat === "1-repeat" && this._failureCount >= 1) || (repeat === "all-repeat" && this._failureCount >= tracks.length))) {
        this.stop();
        return;
      }
      if (repeat === "1" || (repeat === "all" && this.currentPlaylistIndex === tracks.length - 1)) {
        this.stop();
      } else if (repeat === "1-repeat") {
        this.audio.currentTime = 0;
        this.play();
      } else {
        let index = this.currentPlaylistIndex + 1;
        if (index >= tracks.length) index = 0;
        this.select(this.activePlaylist, index);
        this.play();
      }
    }

    handleAudioError() {
      const error = this.audio.error;
      this.reportError(error?.message || "Audio playback failed", error);
      this.completeTrack(true);
    }

    handleAudioEvent(name) {
      if (name === "playing" || name === "play") this.transport = "playing";
      if (name === "pause" && !["stopped", "loading"].includes(this.transport) && !this.audio.ended) this.transport = "paused";
      if (name === "waiting" && this.transport !== "stopped") this.transport = "loading";
      if (["progress", "durationchange", "loadedmetadata", "suspend"].includes(name)) this.updateLoadingProgress();
      if (["durationchange", "loadedmetadata"].includes(name) && this.currentTrack && Number.isFinite(this.audio.duration)) this.currentTrack.duration = this.audio.duration;
      this.publishState();
    }

    updateLoadingProgress() {
      if (!Number.isFinite(this.audio.duration) || this.audio.duration <= 0) return;
      let buffered = 0;
      for (let index = 0; index < this.audio.buffered.length; index += 1) {
        buffered += this.audio.buffered.end(index) - this.audio.buffered.start(index);
      }
      this.loadingProgress = Math.max(0, Math.min(1, buffered / this.audio.duration));
    }

    getState() {
      const playlist = this.currentPlaylist;
      const track = this.currentTrack;
      const length = playlist?.tracks.length || 0;
      const repeat = preferences.repeatMode;
      const oneTrackRepeat = length === 1 && repeat.endsWith("-repeat");
      return {
        engine: this,
        track: track ? { ...track } : undefined,
        playlist: playlist ? { ...playlist, tracks: playlist.tracks.map((item) => ({ ...item })) } : undefined,
        currentPlaylistIndex: this.currentPlaylistIndex,
        transport: this.transport,
        playing: this.isPlaying(),
        paused: this.audio.paused,
        loading: this.transport === "loading",
        loadingProgress: this.loadingProgress,
        currentTime: this.audio.currentTime || 0,
        duration: Number.isFinite(this.audio.duration) ? this.audio.duration : 0,
        volume: this.audio.volume,
        muted: this.audio.muted,
        repeatMode: repeat,
        orderMode: preferences.orderMode,
        hasPrevious: oneTrackRepeat || length > 1 && (this.currentPlaylistIndex > 0 || repeat === "all-repeat"),
        hasNext: oneTrackRepeat || length > 1 && (this.currentPlaylistIndex < length - 1 || repeat === "all-repeat")
      };
    }

    publishState() {
      if (!this.isConnected) return;
      if (mediaSessionOwner === this) {
        navigator.mediaSession.playbackState = this.isPlaying() ? "playing" : this.currentTrack ? "paused" : "none";
        this.updateMediaPosition();
      }
      emit(this, "statechange", this.getState());
    }

    reportError(message, error, detail = {}) {
      console.error(message, error || "");
      if (this.isConnected) emit(this, "error", { message, error, playlist: this.currentPlaylist, track: this.currentTrack, ...detail });
    }

    notify(message, detail = {}) {
      if (this.isConnected) emit(this, "notify", { message, ...detail });
    }

    installMediaSession() {
      if (!("mediaSession" in navigator)) return;
      const actions = {
        play: () => this.play(), pause: () => this.pause(), stop: () => this.stop(),
        previoustrack: () => this.prev(), nexttrack: () => this.next(),
        seekto: (details) => this.seek(details.seekTime),
        seekbackward: (details) => this.seek(this.audio.currentTime - (details.seekOffset || 10)),
        seekforward: (details) => this.seek(this.audio.currentTime + (details.seekOffset || 10))
      };
      Object.entries(actions).forEach(([action, handler]) => {
        try { navigator.mediaSession.setActionHandler(action, handler); } catch (_) { /* unsupported action */ }
      });
    }

    claimMediaSession() {
      engines.forEach((engine) => {
        if (engine !== this && (engine.isPlaying() || engine.transport === "loading")) engine.pause();
      });
      if (!("mediaSession" in navigator)) return;
      mediaSessionOwner = this;
      this._mediaSessionClaim = ++mediaSessionClaimSequence;
      this.installMediaSession();
      this.updateMediaSession();
      navigator.mediaSession.playbackState = this.isPlaying() ? "playing" : "paused";
      this.updateMediaPosition();
    }

    releaseMediaSession() {
      if (!("mediaSession" in navigator) || mediaSessionOwner !== this) return;
      const replacement = [...engines]
        .filter((engine) => engine !== this && engine.isPlaying())
        .sort((a, b) => b._mediaSessionClaim - a._mediaSessionClaim)[0];
      if (replacement) {
        replacement.claimMediaSession();
        return;
      }
      mediaSessionOwner = undefined;
      MEDIA_SESSION_ACTIONS.forEach((action) => {
        try { navigator.mediaSession.setActionHandler(action, null); } catch (_) { /* unsupported action */ }
      });
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = "none";
      try { navigator.mediaSession.setPositionState(); } catch (_) { /* unsupported position reset */ }
    }

    updateMediaSession() {
      if (!("mediaSession" in navigator) || mediaSessionOwner !== this || !this.currentTrack) return;
      const track = this.currentTrack;
      const icon = track.icon || this.currentPlaylist?.icon || this.getAttribute("icon");
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title || "Unknown track",
        artist: track.artist || this.currentPlaylist?.artist || "",
        album: track.album || this.currentPlaylist?.album || "",
        artwork: icon ? [{ src: absoluteURL(icon) }] : []
      });
    }

    updateMediaPosition() {
      if (!("mediaSession" in navigator) || mediaSessionOwner !== this || !navigator.mediaSession.setPositionState) return;
      if (!Number.isFinite(this.audio.duration) || this.audio.duration <= 0) return;
      try {
        navigator.mediaSession.setPositionState({ duration: this.audio.duration, playbackRate: this.audio.playbackRate, position: Math.min(this.audio.currentTime, this.audio.duration) });
      } catch (_) { /* media changed while updating */ }
    }
  }

  class PlayerComponent extends HTMLElement {
    connectedCallback() {
      this.connectPlayer();
    }

    disconnectedCallback() {
      clearTimeout(this._missingPlayerTimer);
      this.disconnectPlayer();
    }

    resolvePlayer() {
      return findEngine(this.getAttribute("player") || undefined);
    }

    connectPlayer() {
      const player = this.resolvePlayer();
      if (player === this._player && player) return;
      if (!player) {
        this.disconnectPlayer();
        this.scheduleMissingPlayerError();
        return;
      }
      clearTimeout(this._missingPlayerTimer);
      this._missingPlayerTimer = undefined;
      this._reportedMissingPlayer = undefined;
      this.disconnectPlayer();
      this._player = player;
      this._onState = (event) => this.renderState?.(event.detail);
      this._onTrackDuration = (event) => this.renderTrackDuration?.(event.detail);
      this._onError = (event) => this.handlePlayerError?.(event.detail);
      this._onNotify = (event) => this.handlePlayerNotify?.(event.detail);
      player?.addEventListener("statechange", this._onState);
      player?.addEventListener("trackdurationchange", this._onTrackDuration);
      player?.addEventListener("error", this._onError);
      player?.addEventListener("notify", this._onNotify);
      if (player) this.renderState?.(player.getState());
    }

    scheduleMissingPlayerError() {
      const playerId = this.getAttribute("player");
      if (!playerId || this._missingPlayerTimer || this._reportedMissingPlayer === playerId) return;
      this._missingPlayerTimer = setTimeout(() => {
        this._missingPlayerTimer = undefined;
        if (!this.isConnected || this.getAttribute("player") !== playerId) return;
        if (this.resolvePlayer()) {
          this.connectPlayer();
          return;
        }
        this._reportedMissingPlayer = playerId;
        this.reportComponentError(`Player not found: ${playerId}`, undefined, {
          code: "player-not-found",
          playerId,
          component: this.localName
        });
      });
    }

    reportComponentError(message, error, detail = {}) {
      const reporter = this._player || findEngine();
      if (reporter) return reporter.reportError(message, error, detail);
      console.error(message, error || "");
      emit(this, "error", { message, error, ...detail });
    }

    disconnectPlayer() {
      this._player?.removeEventListener("statechange", this._onState);
      this._player?.removeEventListener("trackdurationchange", this._onTrackDuration);
      this._player?.removeEventListener("error", this._onError);
      this._player?.removeEventListener("notify", this._onNotify);
      this._player = undefined;
    }
  }

  class MusicPlayerPlaylist extends PlayerComponent {
    static get observedAttributes() { return ["compact", "presentation-only", "playlist"]; }

    constructor() {
      super();
      this._data = undefined;
      this._syncQueued = false;
      this._registrationOwner = Symbol("music-player-playlist-owner");
    }

    connectedCallback() {
      if (this.presentationOnly) {
        super.connectedCallback();
        return;
      }
      this.populateDataTracks();
      this.assignSortOrder();
      super.connectedCallback();
      this.syncEngine();
      this._observer = new MutationObserver(() => this.queueSync());
      this._observer.observe(this, { childList: true, subtree: true, attributes: true, attributeFilter: ["src", "title", "desc", "artist", "album", "icon", "duration", "sort_order", "compact"] });
    }

    disconnectedCallback() {
      this._observer?.disconnect();
      if (!this.presentationOnly) this._player?.removePlaylist(this.id, this._registrationOwner);
      super.disconnectedCallback();
    }

    set data(value) {
      this._data = value;
      if (this.isConnected) {
        this.querySelectorAll(":scope > music-player-playlist-track[data-generated]").forEach((track) => track.remove());
        this.populateDataTracks();
        this.assignSortOrder();
        this.syncEngine();
      }
    }

    get data() {
      if (Array.isArray(this._data)) return this._data;
      try { return JSON.parse(this.getAttribute("data") || "[]"); }
      catch (error) { this.reportComponentError(`Invalid playlist data: ${this.id}`, error); return []; }
    }

    get trackElements() {
      return [...this.querySelectorAll(":scope > music-player-playlist-track")];
    }

    get tracks() {
      return this.trackElements.map((element) => element.definition);
    }

    get compact() { return this.hasAttribute("compact"); }
    set compact(value) { this.toggleAttribute("compact", Boolean(value)); }
    get presentationOnly() { return this.hasAttribute("presentation-only"); }
    set presentationOnly(value) { this.toggleAttribute("presentation-only", Boolean(value)); }
    get enginePlaylistId() { return this.presentationOnly ? this.getAttribute("playlist") || this._player?.getActivePlaylist()?.id : this.id; }

    attributeChangedCallback() {
      if (!this.isConnected) return;
      if (this.presentationOnly) {
        this.connectPlayer();
        this.renderState(this._player?.getState());
        return;
      }
      this.trackElements.forEach((track) => track.render());
      this.queueSync();
    }

    populateDataTracks() {
      if (this.querySelector(":scope > music-player-playlist-track[data-generated]")) return;
      const fragment = document.createDocumentFragment();
      this.data.forEach((definition, index) => {
        const track = document.createElement("music-player-playlist-track");
        track.setAttribute("data-generated", "");
        track.setAttribute("sort_order", index);
        ["src", "title", "desc", "artist", "album", "icon", "duration"].forEach((name) => {
          if (definition[name] !== undefined) track.setAttribute(name, definition[name]);
        });
        fragment.appendChild(track);
      });
      this.insertBefore(fragment, this.firstChild);
    }

    assignSortOrder() {
      this.trackElements.forEach((track, index) => {
        if (!track.hasAttribute("sort_order") || track.getAttribute("sort_order") === "") track.setAttribute("sort_order", index);
        if (!track.hasAttribute("playlist")) track.setAttribute("playlist", this.id);
      });
    }

    queueSync() {
      if (this._syncQueued) return;
      this._syncQueued = true;
      queueMicrotask(() => {
        this._syncQueued = false;
        this.assignSortOrder();
        this.syncEngine();
      });
    }

    syncEngine() {
      if (!this.id) return this.reportComponentError("Playlist requires an id");
      this.connectPlayer();
      this._player?.addPlaylist(this.id, {
        title: this.getAttribute("title"), artist: this.getAttribute("artist"), album: this.getAttribute("album"), icon: this.getAttribute("icon"),
        compact: this.compact, tracks: this.tracks
      }, this._registrationOwner);
    }

    renderState(state) {
      if (this.presentationOnly) {
        this.renderPresentation(state);
        return;
      }
      const playlist = this._player?.findPlaylist(this.id);
      if (!playlist) return;
      const orderSignature = playlist.tracks.map((track) => track.sort_order).join("|");
      if (orderSignature === this._orderSignature) return;
      this._orderSignature = orderSignature;
      const byOrder = new Map(this.trackElements.map((element) => [Number(element.getAttribute("sort_order")), element]));
      playlist.tracks.forEach((track, index) => {
        const element = byOrder.get(Number(track.sort_order));
        const current = this.trackElements[index];
        if (element && current !== element) this.insertBefore(element, current || null);
      });
    }

    renderPresentation(state) {
      const playlist = this._player?.findPlaylist(this.enginePlaylistId);
      const signature = playlist ? `${playlist.id}:${playlist.tracks.map((track) => `${track.sort_order}:${track.src}:${track.title}:${track.icon}`).join("|")}` : "";
      if (signature === this._presentationSignature) return;
      this._presentationSignature = signature;
      this.replaceChildren();
      (playlist?.tracks || []).forEach((definition) => {
        const track = document.createElement("music-player-playlist-track");
        ["src", "title", "desc", "artist", "album", "icon", "duration", "sort_order"].forEach((name) => {
          if (definition[name] !== undefined && definition[name] !== "") track.setAttribute(name, definition[name]);
        });
        track.setAttribute("playlist", playlist.id);
        this.appendChild(track);
      });
    }
  }

  class MusicPlayerPlaylistTrack extends PlayerComponent {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this._state = undefined;
      this._ready = false;
    }

    connectedCallback() {
      const playlist = this.closest("music-player-playlist");
      if (!playlist) {
        this.wrapOrphan();
        return;
      }
      super.connectedCallback();
      this.ensureDOM();
      this.render();
      if (!playlist.presentationOnly) playlist.queueSync();
    }

    resolvePlayer() {
      const playlist = this.closest("music-player-playlist");
      return playlist?.resolvePlayer() || super.resolvePlayer();
    }

    get duration() {
      const value = Number(this.getAttribute("duration"));
      return value > 0 ? value : undefined;
    }

    set duration(value) {
      const seconds = Number(value);
      if (seconds > 0) this.setAttribute("duration", String(seconds));
      else this.removeAttribute("duration");
    }

    get definition() {
      const playlist = this.closest("music-player-playlist");
      return {
        sort_order: Number(this.getAttribute("sort_order")),
        src: this.getAttribute("src") || "",
        title: this.getAttribute("title") || "Untitled",
        desc: this.getAttribute("desc") || "",
        artist: this.getAttribute("artist") || playlist?.getAttribute("artist") || "",
        album: this.getAttribute("album") || playlist?.getAttribute("album") || "",
        icon: this.getAttribute("icon") || playlist?.getAttribute("icon") || this._player?.getAttribute("icon") || "",
        duration: this.duration
      };
    }

    wrapOrphan() {
      const parent = this.parentElement;
      if (!parent) return;
      let playlist = orphanPlaylists.get(parent);
      if (!playlist) {
        playlist = document.createElement("music-player-playlist");
        playlist.id = `music-player-playlist-${Math.random().toString(36).slice(2, 10)}`;
        if (this.hasAttribute("player")) playlist.setAttribute("player", this.getAttribute("player"));
        orphanPlaylists.set(parent, playlist);
        parent.insertBefore(playlist, this);
      }
      playlist.appendChild(this);
    }

    renderState(state) {
      this._state = state;
      const renderSignature = [
        state.playlist?.id,
        state.track?.src,
        state.track?.duration,
        state.transport,
        state.playing,
        state.orderMode
      ].join("|");
      if (renderSignature === this._renderSignature) return;
      this._renderSignature = renderSignature;
      this.render();
    }

    renderTrackDuration(detail) {
      const playlist = this.closest("music-player-playlist");
      if (playlist?.enginePlaylistId !== detail.playlistId) return;
      if (Number(this.getAttribute("sort_order")) !== Number(detail.sort_order)) return;
      if (absoluteURL(this.getAttribute("src")) !== absoluteURL(detail.src)) return;
      if (!(Number(this.getAttribute("duration")) > 0)) {
        this.setAttribute("duration", String(detail.duration));
      }
      this.shadowRoot.querySelector(".duration").textContent = time(detail.duration);
    }

    ensureDOM() {
      if (this._ready) return;
      this._ready = true;
      this.shadowRoot.innerHTML = `
        <style>
          :host {
            display:block;
            font:14px/1.3 system-ui,sans-serif;
            color:#171717
          }
          .row {
            display:grid;
            grid-template-columns:auto minmax(0,1fr) 46px;
            align-items:center;
            gap:11px;
            padding:8px 10px;
            border-radius:8px;
            cursor:pointer;
            user-select:none;
            -webkit-user-select:none
          }
          .row.active {
            background:#eee
          }
          .copy {
            min-width:0
          }
          .titleline {
            display:flex;
            align-items:baseline;
            gap:10px;
            min-width:0
          }
          .title,.desc {
            overflow:hidden;
            text-overflow:ellipsis;
            white-space:nowrap;
            user-select:text;
            -webkit-user-select:text
          }
          .title {
            font-weight:700;
            flex:1;
            min-width:0
          }
          .duration {
            color:#666;
            white-space:nowrap
          }
          .desc {
            color:#666;
            margin-top:2px
          }
          music-player-playbutton {
            --playbutton-size:46px
          }
          a {
            display:grid;
            align-items:center;
            justify-items:end;
            justify-self:end;
            width:46px;
            height:46px;
            color:#555;
            padding:0;
            text-align:center;
            text-decoration:none
          }
          a svg {
            display:block;
            width:24px;
            height:24px;
            fill:none;
            stroke:currentColor;
            stroke-width:2;
            paint-order:stroke;
            overflow:visible
          }
          a:focus-visible,.row:focus-visible {
            outline:3px solid #149fd1;
            outline-offset:2px
          }
          .pointer-focus:focus-visible {
            outline:none
          }
          .row.presentation {
            color:#fff
          }
          .row.presentation.active {
            background:#ffffff16
          }
          .row.presentation .duration,.row.presentation .desc,.row.presentation a {
            color:#aaa
          }
          .number {
            display:none;
            color:#666
          }
          .row.compact {
            grid-template-columns:16px auto minmax(0,1fr) 16px;
            gap:4px;
            min-height:18px;
            padding:1px 2px;
            border-radius:2px;
            font-size:12px;
            line-height:1.15
          }
          .row.compact music-player-playbutton {
            --playbutton-size:16px;
            --playbutton-border:0;
            --playbutton-image-display:none
          }
          .row.compact .number {
            display:block
          }
          .row.compact .copy {
            display:flex;
            align-items:baseline;
            gap:4px;
            overflow:hidden
          }
          .row.compact .titleline {
            flex:0 1 auto;
            gap:5px;
            overflow:hidden
          }
          .row.compact .desc {
            flex:1;
            min-width:0;
            margin:0;
            font-size:11px
          }
          .row.compact a {
            width:16px;
            height:16px;
            padding:0;
            line-height:1
          }
          .row.compact a svg {
            width:14px;
            height:14px
          }
          @media(hover:hover) {
            .row:hover {
              background:#eee
            }
            .row.presentation:hover {
              background:#ffffff16
            }
          }
          @media(max-width:430px) {
            .row.compact .duration,.row.compact .desc {
              display:none
            }
            .row.compact .titleline {
              flex:1
            }
          }
        </style>
        <div class="row" role="button" tabindex="0">
          <music-player-playbutton></music-player-playbutton><span class="number"></span>
          <div class="copy"><div class="titleline"><span class="title"></span><span class="duration"></span></div><div class="desc"></div></div>
          <a download aria-label="Download">${transportIcon("download")}</a>
        </div>`;
      installPointerFocus(this.shadowRoot);
      this.shadowRoot.querySelector(".row").addEventListener("click", (event) => {
        if (event.target.closest("music-player-playbutton,a") || hasTextSelection()) return;
        this.activate();
      });
      this.shadowRoot.querySelector(".row").addEventListener("keydown", (event) => {
        if (event.target.closest("music-player-playbutton,a")) return;
        if (event.key === "Enter") event.preventDefault();
        if (["Enter", " "].includes(event.key)) this.activate();
      });
    }

    activate() {
      const playlist = this.closest("music-player-playlist");
      const index = playlist?.trackElements.indexOf(this) ?? 0;
      this._player?.setActivePlaylistAndTrack(playlist?.enginePlaylistId, index);
    }

    render() {
      this.ensureDOM();
      const track = this.definition;
      const active = absoluteURL(this._state?.track?.src) === absoluteURL(track.src);
      const playlist = this.closest("music-player-playlist");
      const index = playlist?.trackElements.indexOf(this) ?? 0;
      const registeredTrack = this._player?.findPlaylist(playlist?.enginePlaylistId)?.tracks.find((item) =>
        Number(item.sort_order) === Number(track.sort_order)
        && absoluteURL(item.src) === absoluteURL(track.src)
      );
      const stateTrack = active
        ? this._state?.track
        : registeredTrack;
      const row = this.shadowRoot.querySelector(".row");
      row.classList.toggle("active", active);
      row.classList.toggle("compact", Boolean(playlist?.compact));
      row.classList.toggle("presentation", Boolean(playlist?.presentationOnly));
      row.setAttribute("aria-label", `Select ${track.title}`);
      this.shadowRoot.querySelector(".number").textContent = `${index + 1}.`;
      this.shadowRoot.querySelector(".title").textContent = track.title;
      this.shadowRoot.querySelector(".desc").textContent = track.desc;
      this.shadowRoot.querySelector(".duration").textContent = time(stateTrack?.duration ?? track.duration);
      const download = this.shadowRoot.querySelector("a");
      download.href = track.src;
      download.setAttribute("aria-label", `Download ${track.title}`);
      const playbutton = this.shadowRoot.querySelector("music-player-playbutton");
      playbutton.setAttribute("player", this._player?.id || "");
      playbutton.setAttribute("playlist", playlist?.enginePlaylistId || "");
      playbutton.setAttribute("track-index", index);
      if (track.icon) playbutton.setAttribute("thumbnail", track.icon); else playbutton.removeAttribute("thumbnail");
    }
  }

  class MusicPlayerPlayButton extends PlayerComponent {
    static get observedAttributes() { return ["player", "playlist", "track-index", "thumbnail", "current"]; }

    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this._state = undefined;
      this._ready = false;
      this._playingRendered = null;
    }

    connectedCallback() { super.connectedCallback(); this.ensureDOM(); this.render(); }

    attributeChangedCallback() {
      if (!this.isConnected) return;
      this.connectPlayer();
      this.render();
    }

    renderState(state) {
      this._state = state;
      const renderSignature = [state.playlist?.id, state.track?.src, state.transport, state.playing].join("|");
      if (renderSignature === this._renderSignature) return;
      this._renderSignature = renderSignature;
      this.render();
    }

    ensureDOM() {
      if (this._ready) return;
      this._ready = true;
      this.shadowRoot.innerHTML = `
        <style>
          :host {
            display:inline-block;
            width:var(--playbutton-size,64px);
            height:var(--playbutton-size,64px)
          }
          button {
            position:relative;
            width:100%;
            height:100%;
            padding:0;
            overflow:hidden;
            border:var(--playbutton-border,2px) solid #fff;
            border-radius:4px;
            background:#242424;
            color:#fff;
            cursor:pointer;
            touch-action:manipulation;
            user-select:none;
            -webkit-user-select:none
          }
          button:focus-visible {
            outline:3px solid #18b4e3;
            outline-offset:2px
          }
          button.pointer-focus:focus-visible {
            outline:none
          }
          img,.art {
            place-items:center;
            width:100%;
            height:100%;
            object-fit:cover;
            user-select:none;
            -webkit-user-select:none;
            -webkit-user-drag:none
          }
          img {
            display:var(--playbutton-image-display,block)
          }
          .art {
            display:grid;
            font-size:24px
          }
          img[hidden],.art[hidden] {
            display:none
          }
          .symbol {
            position:absolute;
            inset:0;
            display:grid;
            place-items:center
          }
          .symbol svg {
            width:52%;
            height:52%;
            fill:#fff;
            stroke:#111;
            stroke-width:2.5;
            paint-order:stroke fill
          }
        </style>
        <button aria-label="Play"><img alt=""><span class="art">♫</span><span class="symbol"></span></button>`;
      installPointerFocus(this.shadowRoot);
      this.shadowRoot.querySelector("button").addEventListener("click", () => this.activate());
    }

    target() {
      const playlistElement = this.closest("music-player-playlist");
      const playlistId = playlistElement?.enginePlaylistId
        || this.getAttribute("playlist")
        || this._player?.getActivePlaylist()?.id
        || this._player?.findPlaylist()?.id;
      const playlist = this._player?.findPlaylist(playlistId);
      const trackElement = this.closest("music-player-playlist-track");
      const explicitIndex = this.hasAttribute("track-index") ? Number(this.getAttribute("track-index")) : undefined;
      const index = trackElement ? playlistElement?.trackElements.indexOf(trackElement) : explicitIndex;
      const track = Number.isInteger(index) && index >= 0 ? playlist?.tracks[index] : undefined;
      return { playlist, playlistId, index, track };
    }

    activate() {
      if (!this._player) return;
      const state = this._player.getState();
      if (this.hasAttribute("current")) {
        state.playing ? this._player.pause() : this._player.play();
        return;
      }
      const { playlist, playlistId, index, track } = this.target();
      const targetIsActive = track
        ? absoluteURL(track.src) === absoluteURL(state.track?.src)
        : !playlist || playlistId === state.playlist?.id;
      const targetIsPlaying = state.playing && targetIsActive;
      if (playlistId) {
        if (track) this._player.setActivePlaylistAndTrack(playlistId, index);
        else this._player.setActivePlaylist(playlistId);
      }
      if (targetIsPlaying) this._player.pause();
      else if (!(state.playing && !targetIsActive)) this._player.play();
    }

    render() {
      this.ensureDOM();
      const { playlist, playlistId, track } = this.target();
      const targetsActive = track
        ? absoluteURL(track.src) === absoluteURL(this._state?.track?.src)
        : !playlistId || playlistId === this._state?.playlist?.id;
      const playing = targetsActive && (this._state?.playing || this._state?.transport === "loading");
      const thumbnail = this.getAttribute("thumbnail") || track?.icon || this._state?.track?.icon || playlist?.icon || this._player?.getAttribute("icon");
      const image = this.shadowRoot.querySelector("img");
      image.hidden = !thumbnail;
      this.shadowRoot.querySelector(".art").hidden = Boolean(thumbnail);
      if (thumbnail && image.getAttribute("src") !== thumbnail) image.src = thumbnail;
      this.shadowRoot.querySelector("button").setAttribute("aria-label", playing ? "Pause" : "Play");
      if (playing !== this._playingRendered) {
        this._playingRendered = playing;
        this.shadowRoot.querySelector(".symbol").innerHTML = transportIcon(playing ? "pause" : "play");
      }
    }
  }

  class MusicPlayerBar extends PlayerComponent {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this._view = "normal";
      this._state = undefined;
      this._ready = false;
      this._keyHandler = (event) => this.handleKey(event);
    }

    connectedCallback() {
      super.connectedCallback();
      window.addEventListener("keydown", this._keyHandler);
      this.ensureDOM();
      this.render();
    }

    disconnectedCallback() {
      window.removeEventListener("keydown", this._keyHandler);
      super.disconnectedCallback();
    }

    renderState(state) { this._state = state; this.render(); }

    handleKey(event) {
      const insideControl = event.composedPath().some((node) =>
        node instanceof Element && node.matches("button,a,input,textarea,select,[role=textbox],[contenteditable]:not([contenteditable=false])")
      );
      if (!this.getClientRects().length || insideControl) return;
      if (event.code === "Space") { event.preventDefault(); this._state?.playing ? this._player?.pause() : this._player?.play(); }
      if (event.shiftKey && event.code === "ArrowLeft") {
        event.preventDefault();
        this._player?.seek((this._player.getState().currentTime || 0) - 10);
        return;
      }
      if (event.shiftKey && event.code === "ArrowRight") {
        event.preventDefault();
        this._player?.seek((this._player.getState().currentTime || 0) + 10);
        return;
      }
      if (["ArrowLeft", "ArrowUp"].includes(event.code)) { event.preventDefault(); this._player?.prev(); }
      if (["ArrowRight", "ArrowDown"].includes(event.code)) { event.preventDefault(); this._player?.next(); }
    }

    ensureDOM() {
      if (this._ready) return;
      this._ready = true;
      this.shadowRoot.innerHTML = `
        <style>
          :host {
            position:fixed;
            z-index:1000;
            left:0;
            right:0;
            bottom:0;
            color:#fff;
            font:14px/1.25 system-ui,sans-serif
          }
          :host([hidden]) {
            display:none
          }
          .panel {
            position:relative;
            display:flex;
            flex-direction:column;
            max-height:80vh;
            background:#202020;
            box-shadow:0 -4px 22px #0006
          }
          .playlist {
            display:none;
            overflow:auto;
            padding:8px max(10px,env(safe-area-inset-right)) 8px max(10px,env(safe-area-inset-left));
            border-bottom:1px solid #ffffff24
          }
          .panel.maximized .playlist {
            display:block
          }
          .rows {
            display:grid;
            gap:2px
          }
          button {
            border:0;
            color:inherit;
            background:transparent;
            cursor:pointer;
            touch-action:manipulation;
            user-select:none;
            -webkit-user-select:none
          }
          button:disabled {
            opacity:.28;
            cursor:default
          }
          button:focus-visible,input:focus-visible {
            outline:3px solid #18b4e3;
            outline-offset:-2px
          }
          .pointer-focus:focus-visible {
            outline:none
          }
          svg {
            width:24px;
            height:24px;
            fill:#fff;
            stroke:#fff;
            stroke-width:2
          }
          .track-row {
            display:grid;
            grid-template-columns:42px minmax(0,1fr);
            gap:8px;
            align-items:center;
            min-height:52px;
            padding:4px 6px;
            border-radius:7px
          }
          .track-row.active {
            background:#ffffff16
          }
          .track-row music-player-playbutton {
            --playbutton-size:38px
          }
          .track-select {
            display:flex;
            align-items:baseline;
            gap:10px;
            min-width:0;
            width:100%;
            padding:8px 4px;
            text-align:left
          }
          .track-title {
            overflow:hidden;
            text-overflow:ellipsis;
            white-space:nowrap;
            font-weight:650;
            flex:1
          }
          .track-time {
            color:#aaa;
            white-space:nowrap
          }
          .main {
            display:grid;
            grid-template-columns:64px minmax(0,1fr) auto;
            grid-template-rows:auto auto;
            align-items:start;
            gap:5px 10px;
            padding:8px max(10px,env(safe-area-inset-right)) calc(4px + env(safe-area-inset-bottom)) max(10px,env(safe-area-inset-left))
          }
          .art {
            --playbutton-size:64px;
            grid-column:1;
            grid-row:1
          }
          .info {
            grid-column:2/4;
            grid-row:1;
            min-width:0
          }
          .titleline {
            display:grid;
            grid-template-columns:minmax(0,1fr) auto;
            align-items:baseline;
            gap:10px;
            min-width:0
          }
          .mini-actions {
            display:none;
            align-items:center;
            gap:2px
          }
          .mini-actions button {
            display:grid;
            place-items:center;
            width:26px;
            height:26px;
            padding:2px
          }
          .mini-actions svg {
            width:18px;
            height:18px
          }
          .title {
            min-width:0;
            overflow:hidden;
            text-overflow:ellipsis;
            white-space:nowrap;
            font-weight:750;
            text-align:left;
            padding:2px 0;
            user-select:text;
            -webkit-user-select:text
          }
          .time {
            color:#bbb;
            white-space:nowrap;
            font-size:13px
          }
          .desc {
            overflow:hidden;
            text-overflow:ellipsis;
            white-space:nowrap;
            color:#aaa;
            font-size:12px;
            margin-top:2px;
            user-select:text;
            -webkit-user-select:text
          }
          .timeline {
            margin-top:8px
          }
          .seek {
            display:block;
            width:100%;
            height:8px;
            margin:0;
            appearance:none;
            -webkit-appearance:none;
            background:linear-gradient(to right,#18aee0 0 var(--played),#555 var(--played) var(--loaded),#050505 var(--loaded) 100%);
            cursor:pointer;
            user-select:none;
            -webkit-user-select:none
          }
          .seek::-webkit-slider-runnable-track {
            height:8px;
            background:transparent
          }
          .seek::-webkit-slider-thumb {
            -webkit-appearance:none;
            width:2px;
            height:14px;
            margin-top:-3px;
            border:0;
            border-radius:0;
            background:#18aee0
          }
          .seek::-moz-range-track {
            height:8px;
            background:transparent
          }
          .seek::-moz-range-thumb {
            width:2px;
            height:14px;
            border:0;
            border-radius:0;
            background:#18aee0
          }
          .controls {
            display:flex;
            grid-column:1/3;
            grid-row:2;
            align-items:center;
            justify-content:flex-start;
            min-width:0
          }
          .controls button,.close,.share {
            display:grid;
            place-items:center;
            min-width:38px;
            min-height:38px
          }
          .controls .prev {
            order:1
          }
          .controls .next {
            order:2
          }
          .controls .repeat {
            order:3
          }
          .controls .order {
            order:4
          }
          .controls .rerandomize {
            order:5
          }
          .controls .rerandomize[hidden] {
            display:none
          }
          .controls .volume {
            order:6
          }
          .mode {
            font-size:11px
          }
          .volume {
            width:70px
          }
          .bar-actions {
            display:flex;
            grid-column:3;
            grid-row:2;
            align-items:center;
            justify-content:flex-end;
            align-self:start
          }
          .bar-actions button {
            display:grid;
            place-items:center;
            width:36px;
            height:36px;
            padding:4px
          }
          .close {
            display:grid;
            min-width:36px;
            min-height:36px
          }
          .panel.minimized .main {
            grid-template-columns:48px minmax(0,1fr) auto;
            grid-template-rows:auto;
            padding-top:6px
          }
          .panel.minimized .art {
            --playbutton-size:48px;
            grid-row:auto
          }
          .panel.minimized .info {
            display:grid;
            grid-template-columns:minmax(0,1fr) auto;
            grid-column:2/4
          }
          .panel.minimized .bar-actions {
            display:none
          }
          .panel.minimized .timeline,.panel.minimized .controls {
            display:none
          }
          .panel.minimized .title {
            font-size:14px
          }
          .panel.minimized .titleline {
            grid-column:1/3;
            grid-template-columns:minmax(0,1fr) auto;
            gap:5px
          }
          .panel.minimized .mini-actions {
            display:flex;
            grid-column:2;
            justify-self:end
          }
          .panel.minimized .desc {
            grid-column:1;
            min-width:0
          }
          .panel.maximized .up {
            display:none
          }
          .share svg {
            fill:none
          }
          .rerandomize svg {
            fill:none
          }
          @media(max-width:760px) {
            .main {
              grid-template-columns:54px minmax(0,1fr) auto;
              gap:4px 6px
            }
            .art {
              --playbutton-size:54px
            }
            .volume {
              display:none
            }
            .panel.minimized .main {
              grid-template-columns:46px minmax(0,1fr) auto
            }
            .panel.minimized .controls {
              display:none
            }
            .bar-actions button {
              width:34px;
              height:34px
            }
            .controls button {
              min-width:34px;
              min-height:34px
            }
            .time {
              font-size:12px
            }
          }
          @media(max-width:360px) {
            .panel.minimized .mini-actions {
              display:none
            }
            .panel.minimized .titleline {
              grid-template-columns:minmax(0,1fr) auto
            }
          }
          dialog {
            color:#171717;
            border:0;
            border-radius:8px;
            padding:18px;
            box-shadow:0 12px 40px #0008
          }
          dialog::backdrop {
            background:#0008
          }
          .share-copy {
            display:flex;
            gap:8px;
            margin-top:10px
          }
          .share-copy input {
            min-width:min(62vw,420px);
            padding:8px
          }
          .panel {
            overflow:hidden
          }
          .panel.maximized {
            max-height:80vh
          }
          .panel.maximized .playlist {
            flex:1 1 auto;
            min-height:0;
            overflow-y:auto;
            -webkit-overflow-scrolling:touch;
            touch-action:pan-y
          }
          .main {
            flex:0 0 auto
          }
          .seek {
            touch-action:none
          }
          .volume-control {
            order:6;
            display:flex;
            align-items:center;
            gap:4px;
            margin-left:6px
          }
          .volume {
            width:86px;
            height:18px;
            margin:0;
            appearance:none;
            -webkit-appearance:none;
            background:transparent;
            cursor:pointer;
            user-select:none;
            -webkit-user-select:none
          }
          .volume::-webkit-slider-runnable-track {
            height:2px;
            background:linear-gradient(to right,#28a9df 0 var(--volume),#d7d7d7 var(--volume) 100%)
          }
          .volume::-webkit-slider-thumb {
            -webkit-appearance:none;
            width:13px;
            height:13px;
            margin-top:-5.5px;
            border:1px solid #198fc0;
            border-radius:50%;
            background:#fff
          }
          .volume::-moz-range-track {
            height:2px;
            background:linear-gradient(to right,#28a9df 0 var(--volume),#d7d7d7 var(--volume) 100%)
          }
          .volume::-moz-range-thumb {
            width:11px;
            height:11px;
            border:1px solid #198fc0;
            border-radius:50%;
            background:#fff
          }
          .volume-step {
            min-width:32px!important;
            min-height:32px!important;
            padding:3px;
            color:#28a9df
          }
          .volume-step svg {
            width:25px;
            height:25px;
            fill:none;
            stroke:currentColor;
            stroke-width:1.7
          }
          dialog,.share-box {
            box-sizing:border-box
          }
          dialog {
            width:100vw;
            height:100dvh;
            max-width:none;
            max-height:none;
            margin:0;
            padding:20px;
            border:0;
            background:transparent;
            color:#171717
          }
          dialog[open] {
            display:grid;
            place-items:center
          }
          dialog::backdrop {
            background:#0008
          }
          .share-box {
            position:relative;
            width:min(560px,100%);
            padding:22px 54px 22px 22px;
            border-radius:8px;
            background:#fff;
            box-shadow:0 12px 40px #0008
          }
          .dismiss {
            position:absolute;
            top:7px;
            right:7px;
            width:38px;
            height:38px;
            font-size:30px;
            line-height:1;
            color:#333
          }
          .share-copy {
            display:flex;
            align-items:center;
            gap:8px;
            margin-top:10px
          }
          .share-url {
            min-width:0;
            flex:1;
            padding:8px;
            border:1px solid #bbb;
            border-radius:4px;
            overflow-wrap:anywhere;
            user-select:all;
            -webkit-user-select:all
          }
          .copy {
            display:grid;
            place-items:center;
            width:40px;
            height:40px;
            color:#333
          }
          .copy svg {
            width:24px;
            height:24px;
            fill:none;
            stroke:currentColor;
            stroke-width:2
          }
          @media(max-width:760px) {
            .volume-control {
              display:none
            }
          }
          :host {
            bottom:-1px
          }
        </style>
        <div class="panel normal">
          <div class="playlist"><music-player-playlist class="bar-playlist" presentation-only></music-player-playlist></div>
          <div class="main">
            <music-player-playbutton class="art" current></music-player-playbutton>
            <div class="info"><div class="titleline"><button class="title"></button><span class="time"></span></div><div class="desc"></div><span class="mini-actions"><button class="mini-prev" aria-label="Previous track">${transportIcon("previous")}</button><button class="mini-next" aria-label="Next track">${transportIcon("next")}</button><button class="mini-up" aria-label="Expand player">${transportIcon("up")}</button><button class="mini-close" aria-label="Stop and close">${transportIcon("close")}</button></span><div class="timeline"><input class="seek" type="range" min="0" step="0.1" aria-label="Play position"></div></div>
            <div class="controls"><button class="repeat mode" aria-label="Repeat mode"></button><button class="order mode" aria-label="Order mode"></button><button class="rerandomize" aria-label="Randomize playlist again" hidden>${transportIcon("reload")}</button><button class="prev" aria-label="Previous track">${transportIcon("previous")}</button><button class="next" aria-label="Next track">${transportIcon("next")}</button><div class="volume-control"><input class="volume" type="range" min="0" max="1" step="0.01" aria-label="Volume"><button class="volume-step" aria-label="Change volume level"></button></div></div>
            <div class="bar-actions"><button class="share" aria-label="Share">${transportIcon("share")}</button><button class="down" aria-label="Minimize player">${transportIcon("down")}</button><button class="up" aria-label="Expand player">${transportIcon("up")}</button><button class="close" aria-label="Stop and close">${transportIcon("close")}</button></div>
          </div>
        </div>
        <dialog><div class="share-box"><button class="dismiss" aria-label="Dismiss share dialog">×</button><strong>Share this page</strong><div class="share-copy"><span class="share-url"></span><button class="copy" aria-label="Copy share URL">${transportIcon("copy")}</button></div></div></dialog>`;
      const root = this.shadowRoot;
      installPointerFocus(root);
      root.querySelector(".down").addEventListener("click", () => this.changeView(-1));
      root.querySelector(".up").addEventListener("click", () => this.changeView(1));
      root.querySelector(".title").addEventListener("click", () => {
        if (this._view === "minimized" && !hasTextSelection()) {
          this._view = "normal";
          this.render();
        }
      });
      root.querySelector(".close").addEventListener("click", () => this._player?.stop());
      root.querySelector(".prev").addEventListener("click", () => this._player?.prev());
      root.querySelector(".next").addEventListener("click", () => this._player?.next());
      root.querySelector(".mini-prev").addEventListener("click", () => this._player?.prev());
      root.querySelector(".mini-next").addEventListener("click", () => this._player?.next());
      root.querySelector(".mini-up").addEventListener("click", () => this.changeView(1));
      root.querySelector(".mini-close").addEventListener("click", () => this._player?.stop());
      const seek = root.querySelector(".seek");
      seek.addEventListener("input", (event) => this._player?.seek(event.target.value));
      seek.addEventListener("pointerdown", (event) => {
        this._seekPointer = event.pointerId;
        seek.setPointerCapture(event.pointerId);
        this.seekFromPointer(event);
      });
      seek.addEventListener("pointermove", (event) => {
        if (event.pointerId === this._seekPointer) this.seekFromPointer(event);
      });
      const finishSeek = (event) => {
        if (event.pointerId === this._seekPointer) this._seekPointer = undefined;
      };
      seek.addEventListener("pointerup", finishSeek);
      seek.addEventListener("pointercancel", finishSeek);
      root.querySelector(".volume").addEventListener("input", (event) => this._player?.setVolume(event.target.value));
      root.querySelector(".volume-step").addEventListener("click", () => {
        const volume = this._player?.getState().volume || 0;
        const levels = [0, 1 / 3, 2 / 3, 1];
        this._player?.setVolume(levels.find((level) => level > volume + 0.02) ?? 0);
      });
      root.querySelector(".repeat").addEventListener("click", () => {
        const mode = this._player?.getState().repeatMode;
        this._player?.setRepeatMode(REPEAT_MODES[(REPEAT_MODES.indexOf(mode) + 1) % REPEAT_MODES.length]);
      });
      root.querySelector(".order").addEventListener("click", () => {
        const mode = this._player?.getState().orderMode;
        this._player?.setOrderMode(ORDER_MODES[(ORDER_MODES.indexOf(mode) + 1) % ORDER_MODES.length]);
      });
      root.querySelector(".rerandomize").addEventListener("click", () => this._player?.setOrderMode("random"));
      root.querySelector(".share").addEventListener("click", () => this.share());
      root.querySelector(".copy").addEventListener("click", () => this.copyShareURL());
      root.querySelector(".dismiss").addEventListener("click", () => root.querySelector("dialog").close());
      root.querySelector("dialog").addEventListener("click", (event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      });
      const playlistScroll = root.querySelector(".playlist");
      playlistScroll.addEventListener("touchstart", (event) => {
        this._playlistTouchStartY = event.touches[0]?.clientY;
        this._playlistTouchMoved = false;
      }, { passive: true });
      playlistScroll.addEventListener("touchmove", (event) => {
        const y = event.touches[0]?.clientY;
        if (!Number.isFinite(y) || !Number.isFinite(this._playlistTouchStartY)) return;
        const delta = y - this._playlistTouchStartY;
        if (Math.abs(delta) < 6) return;
        this._playlistTouchMoved = true;
        const atTop = playlistScroll.scrollTop <= 0;
        const atBottom = playlistScroll.scrollTop + playlistScroll.clientHeight >= playlistScroll.scrollHeight - 1;
        if (atTop && delta > 0 || atBottom && delta < 0) event.preventDefault();
      }, { passive: false });
      playlistScroll.addEventListener("touchend", () => {
        if (this._playlistTouchMoved) this._suppressPlaylistClickUntil = performance.now() + 500;
        this._playlistTouchStartY = undefined;
      }, { passive: true });
      playlistScroll.addEventListener("touchcancel", () => {
        this._playlistTouchStartY = undefined;
      }, { passive: true });
      playlistScroll.addEventListener("click", (event) => {
        if (performance.now() >= (this._suppressPlaylistClickUntil || 0)) return;
        event.preventDefault();
        event.stopPropagation();
      }, true);
      playlistScroll.addEventListener("wheel", (event) => {
        const atTop = playlistScroll.scrollTop <= 0;
        const atBottom = playlistScroll.scrollTop + playlistScroll.clientHeight >= playlistScroll.scrollHeight - 1;
        if (atTop && event.deltaY < 0 || atBottom && event.deltaY > 0) event.preventDefault();
      }, { passive: false });
    }

    changeView(direction) {
      const views = ["minimized", "normal", "maximized"];
      this._view = views[Math.max(0, Math.min(2, views.indexOf(this._view) + direction))];
      this.render();
    }

    seekFromPointer(event) {
      const seek = this.shadowRoot.querySelector(".seek");
      const bounds = seek.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
      const seconds = ratio * Number(seek.max || 0);
      seek.value = seconds;
      this._player?.seek(seconds);
    }

    async share() {
      const data = { title: this._state?.track?.title || document.title, url: location.href };
      if (navigator.share) {
        try { await navigator.share(data); return; } catch (error) { if (error.name === "AbortError") return; }
      }
      const dialog = this.shadowRoot.querySelector("dialog");
      dialog.querySelector(".share-url").textContent = data.url;
      dialog.showModal();
    }

    async copyShareURL() {
      const url = this.shadowRoot.querySelector(".share-url");
      let copied = false;
      try {
        await navigator.clipboard.writeText(url.textContent);
        copied = true;
      } catch (_) {
        try {
          const selection = getSelection();
          const range = document.createRange();
          range.selectNodeContents(url);
          selection.removeAllRanges();
          selection.addRange(range);
          copied = document.execCommand("copy");
          selection.removeAllRanges();
        } catch (_) { /* copy unavailable */ }
      }
      if (!copied) return this._player?.reportError("Unable to copy share link");
      this.shadowRoot.querySelector("dialog").close();
      this._player?.notify("Share link copied", { code: "share-link-copied" });
    }

    render() {
      this.ensureDOM();
      const state = this._state || { currentPlaylistIndex: -1, currentTime: 0, duration: 0, volume: 1, repeatMode: "all", orderMode: "inorder", transport: "empty" };
      const track = state.track;
      const playlist = state.playlist;
      const visible = Boolean((track || playlist) && !["empty", "stopped"].includes(state.transport));
      this.hidden = !visible;
      const panel = this.shadowRoot.querySelector(".panel");
      const panelClass = `panel ${this._view}`;
      if (panel.className !== panelClass) panel.className = panelClass;
      const playlistView = this.shadowRoot.querySelector(".bar-playlist");
      const playerId = this._player?.id || "";
      if (playlistView.getAttribute("player") !== playerId) playlistView.setAttribute("player", playerId);
      if (playlist?.id && playlistView.getAttribute("playlist") !== playlist.id) playlistView.setAttribute("playlist", playlist.id);
      else if (!playlist?.id && playlistView.hasAttribute("playlist")) playlistView.removeAttribute("playlist");
      const artwork = track?.icon || playlist?.icon || this._player?.getAttribute("icon");
      const playbutton = this.shadowRoot.querySelector(".art");
      if (playbutton.getAttribute("player") !== playerId) playbutton.setAttribute("player", playerId);
      if (artwork && playbutton.getAttribute("thumbnail") !== artwork) playbutton.setAttribute("thumbnail", artwork);
      else if (!artwork && playbutton.hasAttribute("thumbnail")) playbutton.removeAttribute("thumbnail");
      const title = this.shadowRoot.querySelector(".title");
      const titleText = track?.title || playlist?.title || "Nothing playing";
      if (title.textContent !== titleText) title.textContent = titleText;
      this.shadowRoot.querySelector(".time").textContent = `${time(state.currentTime)} / ${time(state.duration)}`;
      const desc = this.shadowRoot.querySelector(".desc");
      const descText = track?.album || playlist?.album || track?.artist || playlist?.artist || track?.desc || "";
      if (desc.textContent !== descText) desc.textContent = descText;
      const seek = this.shadowRoot.querySelector(".seek");
      seek.max = state.duration || 0;
      seek.value = state.currentTime || 0;
      seek.disabled = !track;
      const played = state.duration ? Math.min(100, state.currentTime / state.duration * 100) : 0;
      const loaded = Math.max(played, Math.min(100, (state.loadingProgress || 0) * 100));
      seek.style.setProperty("--played", `${played}%`);
      seek.style.setProperty("--loaded", `${loaded}%`);
      const volume = this.shadowRoot.querySelector(".volume");
      volume.value = state.volume;
      volume.style.setProperty("--volume", `${state.volume * 100}%`);
      const volumeBand = state.volume <= 0 ? 0 : state.volume <= 1 / 3 ? 1 : state.volume <= 2 / 3 ? 2 : 3;
      const volumeStep = this.shadowRoot.querySelector(".volume-step");
      if (this._volumeBand !== volumeBand) {
        this._volumeBand = volumeBand;
        volumeStep.innerHTML = transportIcon(`volume${volumeBand}`);
      }
      volumeStep.setAttribute("aria-label", `Volume ${Math.round(state.volume * 100)} percent; change level`);
      const repeat = this.shadowRoot.querySelector(".repeat");
      if (repeat.textContent !== state.repeatMode) repeat.textContent = state.repeatMode;
      const order = this.shadowRoot.querySelector(".order");
      if (order.textContent !== state.orderMode) order.textContent = state.orderMode;
      this.shadowRoot.querySelector(".rerandomize").hidden = state.orderMode !== "random";
      this.shadowRoot.querySelector(".prev").disabled = !state.hasPrevious;
      this.shadowRoot.querySelector(".next").disabled = !state.hasNext;
      this.shadowRoot.querySelector(".mini-prev").disabled = !state.hasPrevious;
      this.shadowRoot.querySelector(".mini-next").disabled = !state.hasNext;
      this.shadowRoot.querySelector(".mini-up").disabled = this._view === "maximized";
      this.shadowRoot.querySelector(".down").disabled = this._view === "minimized";
      this.shadowRoot.querySelector(".up").disabled = this._view === "maximized";
    }
  }

  customElements.define("music-player", MusicPlayerEngine);
  customElements.define("music-player-playlist", MusicPlayerPlaylist);
  customElements.define("music-player-playlist-track", MusicPlayerPlaylistTrack);
  customElements.define("music-player-playbutton", MusicPlayerPlayButton);
  customElements.define("music-player-bar", MusicPlayerBar);
})();
